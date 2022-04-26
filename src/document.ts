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
import shortid from "shortid";
import { assert } from "./utils";

interface Options {
  debug?: boolean;
}

export interface Document<T> {
  id: string;
  data: T;
  ref: FirebaseFirestore.DocumentReference;
}

function isDocumentReference<T>(
  source: SourceType<T>,
): source is FirebaseFirestore.DocumentReference {
  return (source as FirebaseFirestore.DocumentReference).set !== undefined;
}

function isCollectionReference<T>(
  source: SourceType<T>,
): source is FirebaseFirestore.CollectionReference {
  return (source as FirebaseFirestore.CollectionReference).doc !== undefined;
}

function getPathFromCollectionRef(
  collectionRef?: FirebaseFirestore.CollectionReference,
) {
  return collectionRef ? `${collectionRef.path}/__no_document_id` : undefined;
}

const NO_DATA = "__no_data" as const;

type SourceType<T> =
  | FirebaseFirestore.DocumentReference
  | FirebaseFirestore.CollectionReference
  | Document<T>;

export class ObservableDocument<T> {
  _data: T | typeof NO_DATA = NO_DATA;
  isLoading = false;

  private debugId: string;
  private documentRef?: FirebaseFirestore.DocumentReference;
  private collectionRef?: FirebaseFirestore.CollectionReference;
  private isDebugEnabled = false;

  private _exists = false;
  private readyPromise?: Promise<T | undefined>;
  private readyResolveFn?: (data?: T) => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private observedCount = 0;
  private firedInitialFetch = false;
  private sourcePath?: string;
  private listenerSourcePath?: string;

  onError?: (err: Error) => void;

  public constructor(source?: SourceType<T>, options?: Options) {
    this.debugId = shortid.generate();

    makeObservable(this, {
      _data: observable,
      isLoading: observable,
      data: computed,
      document: computed,
      attachTo: action,
      hasData: computed,
    });

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
    } else {
      assert(source.ref, "Missing ref in source");
      /**
       * Source is type Document<T>, typically passed in from the docs  data of
       * an ObservableCollection instance.
       */
      this.documentRef = source.ref;
      // not sure why ref can be undefined here. Maybe a bug in gemini
      this.collectionRef = source.ref?.parent;
      this.sourcePath = source.ref?.path;
      this.logDebug("Constructor from Document<T>");

      this._exists = true;

      action(() => {
        this._data = source.data;
      });
    }

    onBecomeObserved(this, "_data", () => this.resumeUpdates("data"));
    onBecomeUnobserved(this, "_data", () => this.suspendUpdates("data"));

    onBecomeObserved(this, "isLoading", () => this.resumeUpdates("isLoading"));
    onBecomeUnobserved(this, "isLoading", () =>
      this.suspendUpdates("isLoading"),
    );
  }

  public get id(): string {
    return this.documentRef ? this.documentRef.id : "__no_id";
  }

  public attachTo(
    documentIdOrRef?: string | FirebaseFirestore.DocumentReference,
  ): void {
    if (!documentIdOrRef || typeof documentIdOrRef === "string") {
      this.changeSourceViaId(documentIdOrRef);
    } else {
      this.changeSourceViaRef(documentIdOrRef);
    }
  }

  public get data(): T | undefined {
    if (!this.documentRef || !this._exists || this._data === NO_DATA) return;

    return toJS(this._data);
  }

  public get document(): Document<T> | undefined {
    if (!this.documentRef || !this._exists || this._data === NO_DATA) return;

    /**
     * For document we return the data as non-observable by converting it to a
     * JS object. Not sure if we need this but seems logical. If you want to
     * observable data you can use the data property directly.
     */
    return {
      id: this.documentRef.id,
      data: toJS(this._data),
      ref: this.documentRef,
    };
  }

  private get isObserved(): boolean {
    return this.observedCount > 0;
  }

  public get ref(): FirebaseFirestore.DocumentReference | undefined {
    return this.documentRef;
  }

  public set ref(newRef: FirebaseFirestore.DocumentReference | undefined) {
    this.changeSourceViaRef(newRef);
  }

  public get path(): string | undefined {
    return this.documentRef ? this.documentRef.path : undefined;
  }

  public async update(
    fields: FirebaseFirestore.UpdateData,
    precondition?: FirebaseFirestore.Precondition,
  ) {
    if (!this.documentRef) {
      throw Error("Can not update data on document with undefined ref");
    }
    return this.documentRef.update(fields, precondition);
  }

  public async set(data: Partial<T>, options?: FirebaseFirestore.SetOptions) {
    if (!this.documentRef) {
      throw Error("Can not set data on document with undefined ref");
    }
    return this.documentRef.set(data, options || {});
  }

  public delete() {
    if (!this.documentRef) {
      throw Error("Can not delete document with undefined ref");
    }
    return this.documentRef.delete();
  }

  public ready(): Promise<T | undefined> {
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

  public get hasData(): boolean {
    return this._data !== NO_DATA;
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

  private handleSnapshot(snapshot: FirebaseFirestore.DocumentSnapshot) {
    const exists = snapshot.exists;

    runInAction(() => {
      this._exists = exists;

      this._data = exists ? (snapshot.data() as T) : NO_DATA;

      this.changeLoadingState(false);
    });
  }

  /**
   * If there is an error handler callback we use that, otherwise we throw.
   */
  private handleError(err: Error) {
    if (typeof this.onError === "function") {
      this.onError(err);
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

    // @TODO make DRY
    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Change document -> clear listeners");
        this.updateListeners(false);
      }

      this._data = NO_DATA;
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
    if (!this.collectionRef) {
      this.handleError(
        new Error(
          `Can not change source via id if there is no known collection reference`,
        ),
      );
      return;
    }

    if (this.id === documentId) {
      return;
    }

    const newRef = documentId ? this.collectionRef.doc(documentId) : undefined;
    const newPath = newRef
      ? newRef.path
      : getPathFromCollectionRef(this.collectionRef);

    this.logDebug(`Change source via id to ${newPath}`);
    this.documentRef = newRef;
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

      this._data = NO_DATA;
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
