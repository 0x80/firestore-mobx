import {
  observable,
  runInAction,
  IObservableValue,
  onBecomeObserved,
  onBecomeUnobserved
} from "mobx";
import { firestore } from "firebase";

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
  collectionRef: firestore.CollectionReference
) {
  return `${collectionRef.id}/__no_document_id`;
}

type SourceType<T> =
  | firestore.DocumentReference
  | firestore.CollectionReference
  | Document<T>;

export class ObservableDocument<T extends object> {
  @observable private dataObservable: IObservableValue<T | undefined>;
  @observable private isLoadingObservable: IObservableValue<boolean>;

  private _ref?: firestore.DocumentReference;
  private _collectionRef: firestore.CollectionReference;
  private isDebugEnabled = false;
  private _path?: string;
  private _exists = false;
  private readyPromise = Promise.resolve();
  private readyResolveFn?: () => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private isObserved = false;

  public constructor(source: SourceType<T>, options?: Options) {
    this.dataObservable = observable.box();
    this.isLoadingObservable = observable.box(false);

    if (options) {
      this.options = { ...optionDefaults, ...options };
      this.isDebugEnabled = options.debug || false;
    }

    if (isCollectionReference<T>(source)) {
      this._collectionRef = source;
      this._path = getPathFromCollectionRef(source);
      this.logDebug("Constructor from collection reference");
    } else if (isDocumentReference<T>(source)) {
      this._ref = source;
      this._collectionRef = source.parent;
      this._path = source.path;
      this.logDebug("Constructor from document reference");
      /**
       * In this case we have data to wait on from the start. So initialize the
       * promise and resolve function.
       */
      this.changeLoadingState(true);
    } else {
      /**
       * Source is type Document, typically passed in from the document data of
       * an ObservableCollection instance.
       */
      this._ref = source.ref;
      this._collectionRef = source.ref.parent;
      this._path = source.ref.path;
      this.logDebug("Constructor from document");

      this._exists = true;
      this.dataObservable.set(source.data);
    }

    onBecomeObserved(this, "dataObservable", this.resumeUpdates);
    onBecomeUnobserved(this, "dataObservable", this.suspendUpdates);
  }

  public get id(): string | undefined {
    return this._ref ? this._ref.id : undefined;
  }

  public set id(documentId: string | undefined) {
    if (this.id === documentId) {
      return;
    }

    runInAction(() => this.changeDocumentId(documentId));
  }

  public get data() {
    return this.dataObservable.get();
  }

  public get doc(): Document<T> | undefined {
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

  public get path() {
    return this._path;
  }

  public get ref() {
    return this._ref;
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

    if (!isListening) {
      /**
       * If the client is calling ready() but document is not being observed /
       * no listeners are set up, we treat ready() as a one time fetch request,
       * so data is available after awaiting the promise.
       */
      this.fetchOnce();
    }

    return this.readyPromise;
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

  private fetchOnce() {
    if (!this._ref) {
      // throw Error("Can not fetch data on document with undefined ref");

      console.error("Can not fetch data on document with undefined ref");

      this.changeLoadingState(false);
      return;
    }

    /**
     * Simply pass the snapshot from the promise to the handler function which
     * will then resolve the ready promise just like the snapshot from a
     * listener would.
     */
    this._ref.get().then(snapshot => this.handleSnapshot(snapshot));
  }

  private resumeUpdates = () => {
    this.logDebug("Resume updates");
    this.isObserved = true;
    this.updateListeners(true);
  };

  private suspendUpdates = () => {
    this.logDebug("Suspend updates");
    this.isObserved = false;
    this.updateListeners(false);
  };

  private handleSnapshot(snapshot: firestore.DocumentSnapshot) {
    const exists = snapshot.exists;
    this.logDebug(
      `handleSnapshot, exists: ${exists}, data: ${JSON.stringify(
        snapshot.data({
          serverTimestamps: this.options.serverTimestamps
        })
      )}`
    );

    runInAction(() => {
      this._exists = exists;

      this.dataObservable.set(
        exists
          ? (snapshot.data({
              serverTimestamps: this.options.serverTimestamps
            }) as T)
          : undefined
      );
      // if (exists) {
      //   this.dataObservable.set(snapshot.data({
      //     serverTimestamps: this.options.serverTimestamps
      //   }) as T);
      // }

      this.changeLoadingState(false);
    });
  }

  private onSnapshotError(err: Error) {
    throw new Error(`${this.path} onSnapshotError: ${err.message}`);
  }

  private changeDocumentId(documentId?: string) {
    this.logDebug("Change document");
    const newRef = documentId ? this._collectionRef.doc(documentId) : undefined;
    const newPath = newRef
      ? newRef.path
      : getPathFromCollectionRef(this._collectionRef);

    this.logDebug(`Switch source to ${newPath}`);
    this._ref = newRef;
    this._path = newPath;

    const hasSource = !!newRef;

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
      console.log(`${message} (${this.path})`);
    }
  }

  private updateListeners(shouldListen: boolean) {
    if (!this._ref) {
      return;
    }

    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (isListening) {
      this.logDebug("Stop listening");

      this.unsubscribeListeners();
    }

    if (shouldListen) {
      this.logDebug("Start listening");

      this.onSnapshotUnsubscribeFn = this._ref.onSnapshot(
        snapshot => this.handleSnapshot(snapshot),
        err => this.onSnapshotError(err)
      );
    }
  }

  private unsubscribeListeners() {
    this.logDebug("Unsubscribe listeners");
    this.onSnapshotUnsubscribeFn && this.onSnapshotUnsubscribeFn();
    this.onSnapshotUnsubscribeFn = undefined;
  }

  private changeLoadingState(isLoading: boolean) {
    this.changeReady(!isLoading);
    this.isLoadingObservable.set(isLoading);
  }
}
