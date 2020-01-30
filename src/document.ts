import {
  observable,
  runInAction,
  IObservableValue,
  onBecomeObserved,
  onBecomeUnobserved
} from "mobx";
import { firestore } from "firebase";
import shortid from "shortid";

interface Options {
  serverTimestamps?: "estimate" | "previous" | "none";
  debug?: boolean;
}

const optionDefaults: Options = {
  serverTimestamps: "estimate",
  debug: false
};

export interface Document<T> {
  id: string;
  data: T;
  ref: firestore.DocumentReference;
}

function isDocumentReference<T>(
  source: SourceType<T>
): source is firestore.DocumentReference {
  return (source as firestore.DocumentReference).set !== undefined;
}

function isCollectionReference<T>(
  source: SourceType<T>
): source is firestore.CollectionReference {
  return (source as firestore.CollectionReference).doc !== undefined;
}

function getPathFromCollectionRef(
  collectionRef?: firestore.CollectionReference
) {
  return collectionRef ? `${collectionRef.path}/__no_document_id` : undefined;
}

type SourceType<T> =
  | firestore.DocumentReference
  | firestore.CollectionReference
  | Document<T>;

export class ObservableDocument<T extends object> {
  @observable private dataObservable: IObservableValue<T | undefined>;
  @observable private isLoadingObservable: IObservableValue<boolean>;

  private _id: string;
  private _ref?: firestore.DocumentReference;
  private _collectionRef?: firestore.CollectionReference;
  private isDebugEnabled = false;

  private _exists = false;
  private readyPromise = Promise.resolve();
  private readyResolveFn?: () => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private observedCount = 0;
  private firedInitialFetch = false;
  private sourceId?: string;
  private listenerSourceId?: string;

  public constructor(source?: SourceType<T>, options?: Options) {
    this._id = shortid.generate();
    this.dataObservable = observable.box(undefined);
    this.isLoadingObservable = observable.box(false);

    if (options) {
      this.options = { ...optionDefaults, ...options };
      this.isDebugEnabled = options.debug || false;
    }

    if (!source) {
      // do nothing?
    } else if (isCollectionReference<T>(source)) {
      this._collectionRef = source;
      this.sourceId = source.path;
      this.logDebug("Constructor from collection reference");
    } else if (isDocumentReference<T>(source)) {
      this._ref = source;
      this._collectionRef = source.parent;
      this.sourceId = source.path;
      this.logDebug("Constructor from document reference");
      /**
       * In this case we have data to wait on from the start. So initialize the
       * promise and resolve function.
       */
      this.changeLoadingState(true);
    } else {
      /**
       * Source is type Document<T>, typically passed in from the docs  data of
       * an ObservableCollection instance.
       */
      this._ref = source.ref;
      this._collectionRef = source.ref.parent;
      this.sourceId = source.ref.path;
      this.logDebug("Constructor from Document<T>");

      this._exists = true;
      this.dataObservable.set(source.data);
    }

    onBecomeObserved(this, "dataObservable", () => this.resumeUpdates("data"));
    onBecomeUnobserved(this, "dataObservable", () =>
      this.suspendUpdates("data")
    );

    onBecomeObserved(this, "isLoadingObservable", () =>
      this.resumeUpdates("isLoading")
    );
    onBecomeUnobserved(this, "isLoadingObservable", () =>
      this.suspendUpdates("isLoading")
    );
  }

  public get id(): string | undefined {
    return this._ref ? this._ref.id : undefined;
  }

  // @TODO rename to changeDocument? more explicit
  public set id(documentId: string | undefined) {
    runInAction(() => this.changeSourceViaId(documentId));
  }

  public get data() {
    return this.dataObservable.get();
  }

  public get document(): Document<T> | undefined {
    if (!this._ref || !this._exists || this.isLoading) return;

    return {
      id: this._ref.id,
      data: this.dataObservable.get() as T,
      ref: this._ref
    };
  }

  public get isLoading() {
    return this.isLoadingObservable.get();
  }

  public get isObserved() {
    return this.observedCount > 0;
  }

  public get ref() {
    return this._ref;
  }

  public set ref(ref: firestore.DocumentReference | undefined) {
    runInAction(() => this.changeSourceViaRef(ref));
  }

  public get path() {
    return this._ref ? this._ref.path : undefined;
  }

  public update(fields: firestore.UpdateData): Promise<void> {
    if (!this._ref) {
      throw Error("Can not update data on document with undefined ref");
    }
    return this._ref.update(fields);
  }

  public set(data: Partial<T>, options?: firestore.SetOptions): Promise<void> {
    if (!this._ref) {
      throw Error("Can not set data on document with undefined ref");
    }
    return this._ref.set(data, options);
  }

  public delete(): Promise<void> {
    if (!this._ref) {
      throw Error("Can not delete document with undefined ref");
    }
    return this._ref.delete();
  }

  public ready(): Promise<void> {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (!isListening && this._ref) {
      /**
       * If the client is calling ready() but document is not being observed /
       * no listeners are set up, we treat ready() as a one time fetch request,
       * so data is available after awaiting the promise.
       */
      this.fetchInitialData();
    }

    return this.readyPromise;
  }

  public get hasData() {
    return this._exists;
  }

  private changeReady(isReady: boolean) {
    if (isReady) {
      const readyResolve = this.readyResolveFn;
      if (readyResolve) {
        this.readyResolveFn = undefined;
        readyResolve();
      }
    } else {
      this.initReadyResolver();
    }
  }

  private initReadyResolver() {
    if (!this.readyResolveFn) {
      this.readyPromise = new Promise(resolve => {
        this.readyResolveFn = resolve;
      });
    }
  }

  private fetchInitialData() {
    if (this.firedInitialFetch || !this._ref) {
      // this.logDebug("Ignore fetch initial data");
      return;
    }

    // if (!this._ref) {// this.changeLoadingState(false);

    //   throw Error("Can not fetch data on document with undefined ref");
    //   }

    this.logDebug("Fetch initial data");

    /**
     * Simply pass the snapshot from the promise to the handler function which
     * will then resolve the ready promise just like the snapshot from a
     * listener would.
     */
    this._ref
      .get()
      .then(snapshot => this.handleSnapshot(snapshot))
      .catch(err => console.error(`Fetch initial data failed: ${err.message}`));
    this.firedInitialFetch = true;
  }

  private resumeUpdates = (context: string) => {
    this.observedCount += 1;

    this.logDebug(`Resume ${context}. Observed count: ${this.observedCount}`);

    if (this.observedCount === 1) {
      this.logDebug("Becoming observed");
      this.updateListeners(true);
    }
  };

  private suspendUpdates = (context: string) => {
    this.observedCount -= 1;

    this.logDebug(`Suspend ${context}. Observed count: ${this.observedCount}`);

    if (this.observedCount === 0) {
      this.logDebug("Becoming un-observed");
      this.updateListeners(false);
    }
  };

  private handleSnapshot(snapshot: firestore.DocumentSnapshot) {
    const exists = snapshot.exists;

    this.logDebug(`handleSnapshot, exists: ${exists}`);
    // this.logDebug(`handleSnapshot, exists: ${exists}, data:
    //   ${JSON.stringify(snapshot.data({serverTimestamps:
    //   this.options.serverTimestamps
    //     })
    //   )}`
    // );

    runInAction(() => {
      this._exists = exists;

      this.dataObservable.set(
        exists
          ? (snapshot.data({
              serverTimestamps: this.options.serverTimestamps
            }) as T)
          : undefined
      );

      this.changeLoadingState(false);
    });
  }

  private onSnapshotError(err: Error) {
    throw new Error(`${this.path} onSnapshotError: ${err.message}`);
  }

  private changeSourceViaRef(ref?: firestore.DocumentReference) {
    const newPath = ref ? ref.path : undefined;
    // const oldPath = this._ref ? this._ref.path : undefined;

    if (this._ref && ref && this._ref.isEqual(ref)) {
      // this.logDebug("Ignore change source");
      return;
    }

    // if (oldPath === newPath) {
    //   /**
    //    * When a ref is set with the same path as current it is a no-op
    //    */
    //   return;
    // }

    this.logDebug(`Change source via ref to ${ref ? ref.path : undefined}`);
    this._ref = ref;
    this.sourceId = newPath;
    this.firedInitialFetch = false;

    const hasSource = !!ref;

    // @TODO make DRY
    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Change document -> clear listeners");
        this.updateListeners(false);
      }

      this.dataObservable.set(undefined);
      this.changeLoadingState(false);
    } else {
      if (this.isObserved) {
        this.logDebug("Change document -> update listeners");
        this.updateListeners(true);
      }

      this.changeLoadingState(true);
    }
  }

  private changeSourceViaId(documentId?: string) {
    if (!this._collectionRef) {
      throw new Error(
        `Can not change source via id if there is no known collection reference`
      );
    }

    if (this.id === documentId) {
      return;
    }

    const newRef = documentId ? this._collectionRef.doc(documentId) : undefined;
    const newPath = newRef
      ? newRef.path
      : getPathFromCollectionRef(this._collectionRef);

    this.logDebug(`Change source via id to ${newPath}`);
    this._ref = newRef;
    this.sourceId = newPath;
    this.firedInitialFetch = false;

    const hasSource = !!newRef;

    // @TODO make DRY
    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Change document -> clear listeners");
        this.updateListeners(false);
      }

      this.dataObservable.set(undefined);
      this.changeLoadingState(false);
    } else {
      if (this.isObserved) {
        this.logDebug("Change document -> update listeners");
        this.updateListeners(true);
      }

      this.changeLoadingState(true);
    }
  }

  private logDebug(message: string) {
    if (this.isDebugEnabled) {
      if (!this._ref) {
        console.log(
          `${this._id} (${getPathFromCollectionRef(
            this._collectionRef
          )}) ${message}`
        );
      } else {
        console.log(`${this._id} (${this._ref.path}) ${message}`);
      }
    }
  }

  private updateListeners(shouldListen: boolean) {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (
      shouldListen &&
      isListening &&
      this.sourceId === this.listenerSourceId
    ) {
      // this.logDebug("Ignore update listeners");
      return;
    }

    if (isListening) {
      this.logDebug("Unsubscribe listeners");

      this.onSnapshotUnsubscribeFn && this.onSnapshotUnsubscribeFn();
      this.onSnapshotUnsubscribeFn = undefined;
      this.listenerSourceId = undefined;
    }

    if (shouldListen) {
      if (!this._ref) {
        return;
      }

      this.logDebug("Subscribe listeners");

      this.onSnapshotUnsubscribeFn = this._ref.onSnapshot(
        snapshot => this.handleSnapshot(snapshot),
        err => this.onSnapshotError(err)
      );

      this.listenerSourceId = this.sourceId;
    }
  }

  private changeLoadingState(isLoading: boolean) {
    const wasLoading = this.isLoading;
    if (wasLoading === isLoading) {
      this.logDebug(`Ignore change loading state: ${isLoading}`);
      return;
    }

    this.logDebug(`Change loading state: ${isLoading}`);
    this.changeReady(!isLoading);
    this.isLoadingObservable.set(isLoading);
  }
}
