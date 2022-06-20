import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  runInAction,
  toJS,
} from "mobx";
import { assert, createUniqueId } from "./utils";

interface Options {
  debug?: boolean;
}

export interface Document<T> {
  id: string;
  data: T;
  ref: FirebaseFirestore.DocumentReference;
}

function isDocumentReference(
  source: SourceType,
): source is FirebaseFirestore.DocumentReference {
  return (source as FirebaseFirestore.DocumentReference).set !== undefined;
}

function isCollectionReference(
  source: SourceType,
): source is FirebaseFirestore.CollectionReference {
  return (source as FirebaseFirestore.CollectionReference).doc !== undefined;
}

function getPathFromCollectionRef(
  collectionRef?: FirebaseFirestore.CollectionReference,
) {
  return collectionRef ? `${collectionRef.path}/__no_document_id` : undefined;
}

const NO_DATA = "__no_data" as const;

type SourceType =
  | FirebaseFirestore.DocumentReference
  | FirebaseFirestore.CollectionReference;

export class ObservableDocument<T> {
  _data?: T;
  isLoading = false;

  private debugId = createUniqueId();
  private documentRef?: FirebaseFirestore.DocumentReference;
  private collectionRef?: FirebaseFirestore.CollectionReference;
  private isDebugEnabled = false;

  private readyPromise?: Promise<T | undefined>;
  private readyResolveFn?: (data?: T) => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private observedCount = 0;
  private firedInitialFetch = false;
  private sourcePath?: string;
  private listenerSourcePath?: string;

  private onErrorCallback?: (err: Error) => void;
  private onDataCallback?: (data: T) => void;

  constructor(source?: SourceType, options?: Options) {
    if (options) {
      this.isDebugEnabled = options.debug || false;
    }

    // Don't think we need to call this here. Every change to source creates a
    // new one via changeReady()
    this.initializeReadyPromise();

    if (!source) {
      // do nothing?
    } else if (isCollectionReference(source)) {
      this.collectionRef = source;
      this.sourcePath = source.path;
      this.logDebug("Constructor from collection reference");
    } else if (isDocumentReference(source)) {
      this.documentRef = source;
      this.collectionRef = source.parent;
      this.sourcePath = source.path;
      this.logDebug("Constructor from document reference");
      /**
       * In this case we have data to wait on from the start. So initialize the
       * promise and resolve function.
       */
      this.changeLoadingState(true);
    }

    /**
     * By placing the Mobx initialization after calling changeLoadingState we
     * prevent having to make that private method an action.
     */
    makeObservable(this, {
      _data: observable,
      isLoading: observable,
      data: computed,
      document: computed,
      attachTo: action,
      hasData: computed,
    });

    onBecomeObserved(this, "_data", () => this.resumeUpdates());
    onBecomeUnobserved(this, "_data", () => this.suspendUpdates());

    onBecomeObserved(this, "isLoading", () => this.resumeUpdates());
    onBecomeUnobserved(this, "isLoading", () => this.suspendUpdates());
  }

  get id(): string {
    return this.documentRef ? this.documentRef.id : "__no_id";
  }

  attachTo(documentIdOrRef?: string | FirebaseFirestore.DocumentReference) {
    if (!documentIdOrRef || typeof documentIdOrRef === "string") {
      this.changeSourceViaId(documentIdOrRef);
    } else {
      this.changeSourceViaRef(documentIdOrRef);
    }

    /**
     * Return this so we can chain ready()
     */
    return this;
  }

  get data(): T {
    assert(this._data, "No data available");
    return toJS(this._data);
  }

  get document(): Document<T> {
    assert(this.documentRef && this._data, "No document available");

    return {
      id: this.documentRef.id,
      data: toJS(this._data),
      ref: this.documentRef,
    };
  }

  onError(cb: (err: Error) => void) {
    this.onErrorCallback = cb;
    return this;
  }

  onData(cb: (data: T) => void) {
    this.onDataCallback = cb;
    return this;
  }

  private get isObserved(): boolean {
    return this.observedCount > 0;
  }

  get ref(): FirebaseFirestore.DocumentReference {
    assert(this.documentRef, "No document ref available");
    return this.documentRef;
  }

  get path(): string | undefined {
    return this.documentRef ? this.documentRef.path : undefined;
  }

  async update(
    fields: FirebaseFirestore.UpdateData,
    precondition?: FirebaseFirestore.Precondition,
  ) {
    if (!this.documentRef) {
      return this.handleError(
        new Error("Can not update data on document with undefined ref"),
      );
    }
    return this.documentRef.update(fields, precondition);
  }

  async set(data: Partial<T>, options?: FirebaseFirestore.SetOptions) {
    if (!this.documentRef) {
      return this.handleError(
        new Error("Can not set data on document with undefined ref"),
      );
    }
    return this.documentRef.set(data, options || {});
  }

  delete() {
    if (!this.documentRef) {
      return this.handleError(
        new Error("Can not delete document with undefined ref"),
      );
    }
    return this.documentRef.delete();
  }

  ready(): Promise<T | undefined> {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (!isListening && this.documentRef) {
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

  get hasData(): boolean {
    return typeof this._data !== "undefined";
  }

  private changeReady(isReady: boolean) {
    this.logDebug(`Change ready ${isReady}`);

    if (isReady) {
      const readyResolve = this.readyResolveFn;
      assert(readyResolve, "Missing ready resolve function");

      this.logDebug("Call ready resolve");

      readyResolve(this.hasData ? this.data : undefined);

      /**
       * After the first promise has been resolved we want subsequent calls to
       * ready() to immediately return with the available data. Ready is only
       * meant to be used for initial data fetching
       */
      this.readyPromise = Promise.resolve(this.hasData ? this.data : undefined);
    }
  }

  private initializeReadyPromise() {
    this.logDebug("Initialize new ready promise");
    this.readyPromise = new Promise((resolve) => {
      this.readyResolveFn = resolve;
    });
  }

  private fetchInitialData() {
    if (this.firedInitialFetch || !this.documentRef) {
      this.logDebug("Ignore fetch initial data");
      return;
    }

    this.logDebug("Fetch initial data");

    /**
     * Pass the promise from the snapshot get to the handler function, which
     * will resolve the ready promise just like the snapshot passed in from the
     * normal listener.
     */
    this.documentRef
      .get()
      .then((snapshot) => this.handleSnapshot(snapshot))
      // .then(() => this.changeReady(true))
      .catch((err) =>
        this.handleError(
          new Error(`Fetch initial data failed: ${err.message}`),
        ),
      );
    this.firedInitialFetch = true;
  }

  private resumeUpdates() {
    this.observedCount += 1;

    this.logDebug(`Resume. Observed count: ${this.observedCount}`);

    if (this.observedCount === 1) {
      this.logDebug("Becoming observed");
      this.updateListeners(true);
    }
  }

  private suspendUpdates() {
    this.observedCount -= 1;

    this.logDebug(`Suspend. Observed count: ${this.observedCount}`);

    if (this.observedCount === 0) {
      this.logDebug("Becoming un-observed");
      this.updateListeners(false);
    }
  }

  private handleSnapshot(snapshot: FirebaseFirestore.DocumentSnapshot) {
    runInAction(() => {
      this._data = snapshot.exists ? (snapshot.data() as T) : undefined;

      /**
       * We only need to call back if data exists. This function needs to fire
       * before the loading/ready state is set, so that one document can depend
       * on data from another. For example `isSomethingLoading = a.isLoading ||
       * b.isLoading` would not work if a has isLoading false before b is able
       * to access the data via the callback.
       */
      if (snapshot.exists && typeof this.onDataCallback === "function") {
        this.onDataCallback(snapshot.data() as T);
      }

      this.changeLoadingState(false);
    });
  }

  /**
   * If there is an error handler callback we use that, otherwise we throw.
   */
  private handleError(err: Error) {
    if (typeof this.onErrorCallback === "function") {
      this.onErrorCallback(err);
    } else {
      throw err;
    }
  }

  private changeSourceViaRef(ref?: FirebaseFirestore.DocumentReference) {
    const newPath = ref ? ref.path : undefined;
    // const oldPath = this._ref ? this._ref.path : undefined;

    if (this.documentRef && ref && this.documentRef.isEqual(ref)) {
      // this.logDebug("Ignore change source");
      return;
    }

    this.logDebug(`Change source via ref to ${ref ? ref.path : undefined}`);
    this.documentRef = ref;
    this.sourcePath = newPath;
    this.firedInitialFetch = false;

    const hasSource = !!ref;

    this.initializeReadyPromise();

    this._data = undefined;

    // @TODO make D.R.Y.
    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Change document -> clear listeners");
        this.updateListeners(false);
      }

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
    if (this.id === documentId) {
      return;
    }

    if (documentId && !this.collectionRef) {
      this.handleError(
        new Error(
          `Can not change source via id if there is no known collection reference`,
        ),
      );
      return;
    }

    const newRef =
      documentId && this.collectionRef
        ? this.collectionRef.doc(documentId)
        : undefined;

    const newPath = newRef
      ? newRef.path
      : getPathFromCollectionRef(this.collectionRef);

    this.logDebug(`Change source via id to ${newPath}`);
    this.documentRef = newRef;
    this.sourcePath = newPath;
    this.firedInitialFetch = false;

    const hasSource = !!newRef;

    this.initializeReadyPromise();

    this._data = undefined;

    // @TODO make DRY
    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Change document -> clear listeners");
        this.updateListeners(false);
      }

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
      if (!this.documentRef) {
        console.log(
          `${this.debugId} (${getPathFromCollectionRef(
            this.collectionRef,
          )}) ${message}`,
        );
      } else {
        console.log(`${this.debugId} (${this.documentRef.path}) ${message}`);
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
      if (!this.documentRef) {
        return;
      }

      this.logDebug("Subscribe listeners");

      this.onSnapshotUnsubscribeFn = this.documentRef.onSnapshot(
        (snapshot) => this.handleSnapshot(snapshot),
        (err) => this.handleError(err),
      );

      this.listenerSourcePath = this.sourcePath;
    }
  }

  private changeLoadingState(isLoading: boolean) {
    this.logDebug(`Change loading state: ${isLoading}`);
    this.changeReady(!isLoading);
    this.isLoading = isLoading;
  }
}
