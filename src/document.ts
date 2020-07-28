import {
  observable,
  runInAction,
  IObservableValue,
  onBecomeObserved,
  onBecomeUnobserved,
  toJS,
  computed,
} from "mobx";
import { firestore } from "firebase";
import shortid from "shortid";
import { assert } from "./utils";

interface Options {
  serverTimestamps?: "estimate" | "previous" | "none";
  debug?: boolean;
}

const optionDefaults: Options = {
  serverTimestamps: "estimate",
  debug: false,
};

export interface Document<T> {
  id: string;
  data: T;
  ref: firestore.DocumentReference;
}

function isDocumentReference<T>(
  source: SourceType<T>,
): source is firestore.DocumentReference {
  return (source as firestore.DocumentReference).set !== undefined;
}

function isCollectionReference<T>(
  source: SourceType<T>,
): source is firestore.CollectionReference {
  return (source as firestore.CollectionReference).doc !== undefined;
}

function getPathFromCollectionRef(
  collectionRef?: firestore.CollectionReference,
) {
  return collectionRef ? `${collectionRef.path}/__no_document_id` : undefined;
}

type SourceType<T> =
  | firestore.DocumentReference
  | firestore.CollectionReference
  | Document<T>;

export class ObservableDocument<T> {
  @observable private dataObservable: IObservableValue<T | undefined>;
  @observable private isLoadingObservable: IObservableValue<boolean>;

  private _debug_id: string;
  private _ref?: firestore.DocumentReference;
  private _collectionRef?: firestore.CollectionReference;
  private isDebugEnabled = false;

  private _exists = false;
  private readyPromise?: Promise<T | undefined>;
  private readyResolveFn?: (data?: T) => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private observedCount = 0;
  private firedInitialFetch = false;
  private sourcePath?: string;
  private listenerSourcePath?: string;

  public constructor(source?: SourceType<T>, options?: Options) {
    this._debug_id = shortid.generate();
    this.dataObservable = observable.box(undefined, {
      deep: false,
      name: `${this._debug_id}_data`,
    });
    this.isLoadingObservable = observable.box(false, {
      name: `${this._debug_id}_isLoading`,
    });

    if (options) {
      this.options = { ...optionDefaults, ...options };
      this.isDebugEnabled = options.debug || false;
    }

    // Don't think we need to call this here. Every change to source creates a
    // new one via changeReady()
    this.initializeReadyPromise();

    if (!source) {
      // do nothing?
    } else if (isCollectionReference<T>(source)) {
      this._collectionRef = source;
      this.sourcePath = source.path;
      this.logDebug("Constructor from collection reference");
    } else if (isDocumentReference<T>(source)) {
      this._ref = source;
      this._collectionRef = source.parent;
      this.sourcePath = source.path;
      this.logDebug("Constructor from document reference");
      /**
       * In this case we have data to wait on from the start. So initialize the
       * promise and resolve function.
       */
      this.changeLoadingState(true);
    } else {
      assert(source.ref, "Missing ref in source");
      /**
       * Source is type Document<T>, typically passed in from the docs  data of
       * an ObservableCollection instance.
       */
      this._ref = source.ref;
      // not sure why ref can be undefined here. Maybe a bug in gemini
      this._collectionRef = source.ref?.parent;
      this.sourcePath = source.ref?.path;
      this.logDebug("Constructor from Document<T>");

      this._exists = true;
      this.dataObservable.set(source.data);
    }

    onBecomeObserved(this, "dataObservable", () => this.resumeUpdates("data"));
    onBecomeUnobserved(this, "dataObservable", () =>
      this.suspendUpdates("data"),
    );

    onBecomeObserved(this, "isLoadingObservable", () =>
      this.resumeUpdates("isLoading"),
    );
    onBecomeUnobserved(this, "isLoadingObservable", () =>
      this.suspendUpdates("isLoading"),
    );
  }

  public get id(): string {
    return this._ref ? this._ref.id : "__no_id";
  }

  public attachTo(documentId?: string): void {
    runInAction(() => this.changeSourceViaId(documentId));
  }

  public get data(): T | undefined {
    return this.dataObservable.get();
  }

  @computed
  public get document(): Document<T> | undefined {
    const data = this.dataObservable.get();

    if (!this._ref || !this._exists || !data) return;

    /**
     * For document we return the data as non-observable by converting it to a
     * JS object. Not sure if we need this but seems logical. If you want to
     * observable data you can use the data property directly.
     */
    return {
      id: this._ref.id,
      data: toJS(data),
      ref: this._ref,
    };
  }

  public get isLoading(): boolean {
    return this.isLoadingObservable.get();
  }

  public get isObserved(): boolean {
    return this.observedCount > 0;
  }

  public get ref(): firestore.DocumentReference | undefined {
    return this._ref;
  }

  public set ref(ref: firestore.DocumentReference | undefined) {
    runInAction(() => this.changeSourceViaRef(ref));
  }

  public get path(): string | undefined {
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

  public ready(): Promise<T | undefined> {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (!isListening && this._ref) {
      /**
       * If the client is calling ready() but document is not being observed /
       * no listeners are set up, we treat ready() as a one time fetch request,
       * so data is available after awaiting the promise.
       */
      this.logDebug("Ready requested without listeners => fetch");
      this.fetchInitialData();
    } else {
      this.logDebug("Ready requested with active listeners");
    }

    assert(this.readyPromise, "Missing ready promise");

    return this.readyPromise;
  }

  public get hasData(): boolean {
    return this._exists;
  }

  private changeReady(isReady: boolean) {
    this.logDebug(`Change ready ${isReady}`);

    if (isReady) {
      const readyResolve = this.readyResolveFn;
      assert(readyResolve, "Missing ready resolve function");

      this.logDebug("Call ready resolve");

      readyResolve(this.data);

      /**
       * After the first promise has been resolved we want subsequent calls to
       * ready() to immediately return with the available data. Ready is only
       * meant to be used for initial data fetching
       */
      this.readyPromise = Promise.resolve(this.data);
    }
  }

  private initializeReadyPromise() {
    this.logDebug("Initialize new ready promise");
    this.readyPromise = new Promise((resolve) => {
      this.readyResolveFn = resolve;
    });
  }

  private fetchInitialData() {
    if (this.firedInitialFetch || !this._ref) {
      this.logDebug("Ignore fetch initial data");
      return;
    }

    this.logDebug("Fetch initial data");

    /**
     * Pass the promise from the snapshot get to the handler function, which
     * will resolve the ready promise just like the snapshot passed in from the
     * normal listener.
     */
    this._ref
      .get()
      .then((snapshot) => this.handleSnapshot(snapshot))
      .catch((err) =>
        console.error(`Fetch initial data failed: ${err.message}`),
      );
    this.firedInitialFetch = true;
  }

  private resumeUpdates(context: string) {
    this.observedCount += 1;

    this.logDebug(`Resume ${context}. Observed count: ${this.observedCount}`);

    if (this.observedCount === 1) {
      this.logDebug("Becoming observed");
      this.updateListeners(true);
    }
  }

  private suspendUpdates(context: string) {
    this.observedCount -= 1;

    this.logDebug(`Suspend ${context}. Observed count: ${this.observedCount}`);

    if (this.observedCount === 0) {
      this.logDebug("Becoming un-observed");
      this.updateListeners(false);
    }
  }

  private handleSnapshot(snapshot: firestore.DocumentSnapshot) {
    const exists = snapshot.exists;

    runInAction(() => {
      this._exists = exists;

      const data = exists
        ? (snapshot.data({
            serverTimestamps: this.options.serverTimestamps,
          }) as T)
        : undefined;

      this.dataObservable.set(data);

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

    this.logDebug(`Change source via ref to ${ref ? ref.path : undefined}`);
    this._ref = ref;
    this.sourcePath = newPath;
    this.firedInitialFetch = false;

    const hasSource = !!ref;

    this.initializeReadyPromise();

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
        `Can not change source via id if there is no known collection reference`,
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
    this.sourcePath = newPath;
    this.firedInitialFetch = false;

    const hasSource = !!newRef;

    this.initializeReadyPromise();

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
          `${this._debug_id} (${getPathFromCollectionRef(
            this._collectionRef,
          )}) ${message}`,
        );
      } else {
        console.log(`${this._debug_id} (${this._ref.path}) ${message}`);
      }
    }
  }

  private updateListeners(shouldListen: boolean) {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (
      shouldListen &&
      isListening &&
      this.sourcePath === this.listenerSourcePath
    ) {
      // this.logDebug("Ignore update listeners");
      return;
    }

    if (isListening) {
      this.logDebug("Unsubscribe listeners");

      this.onSnapshotUnsubscribeFn && this.onSnapshotUnsubscribeFn();
      this.onSnapshotUnsubscribeFn = undefined;
      this.listenerSourcePath = undefined;
    }

    if (shouldListen) {
      if (!this._ref) {
        return;
      }

      this.logDebug("Subscribe listeners");

      this.onSnapshotUnsubscribeFn = this._ref.onSnapshot(
        (snapshot) => this.handleSnapshot(snapshot),
        (err) => this.onSnapshotError(err),
      );

      this.listenerSourcePath = this.sourcePath;
    }
  }

  private changeLoadingState(isLoading: boolean) {
    this.logDebug(`Change loading state: ${isLoading}`);
    this.changeReady(!isLoading);
    this.isLoadingObservable.set(isLoading);
  }
}
