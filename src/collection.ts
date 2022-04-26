import {
  action,
  computed,
  makeObservable,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  runInAction,
} from "mobx";
import shortid from "shortid";
import { Document } from "./document";
import { assert, executeFromCount } from "./utils";

interface Options {
  /**
   * For more info read
   * https://firebase.google.com/docs/firestore/query-data/listen
   */
  ignoreInitialSnapshot?: boolean;
  debug?: boolean;
}

const optionDefaults: Options = {
  ignoreInitialSnapshot: false, // @TODO test before making default true
  debug: false,
};

type QueryCreatorFn = (
  ref: FirebaseFirestore.CollectionReference,
) => FirebaseFirestore.Query;

function hasReference(
  ref?: FirebaseFirestore.CollectionReference,
): ref is FirebaseFirestore.CollectionReference {
  return !!ref;
}

export class ObservableCollection<T> {
  private debugId = shortid.generate();

  docs: Document<T>[] = [];
  isLoading = false;

  private collectionRef?: FirebaseFirestore.CollectionReference;
  private _query?: FirebaseFirestore.Query;
  private queryCreatorFn?: QueryCreatorFn;
  private isDebugEnabled = false;
  private readyPromise?: Promise<Document<T>[]>;
  private readyResolveFn?: (docs: Document<T>[]) => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private observedCount = 0;
  private firedInitialFetch = false;
  private sourcePath?: string;
  private listenerSourcePath?: string;

  onError?: (err: Error) => void;

  /**
   * @TODO maybe record a string of the query + reference, so we can figure out
   * if the current listeners belong to that combination or we need to update
   * them
   */
  public constructor(
    /**
     * Ref is optional because for sub-collections you might not know the full
     * path in advance. Pass undefined if you want to supply the other
     * parameters
     */
    ref?: FirebaseFirestore.CollectionReference,
    queryCreatorFn?: QueryCreatorFn,
    options?: Options,
  ) {
    makeObservable(this, {
      docs: observable,
      isLoading: observable,
      isEmpty: computed,
      hasDocs: computed,
      attachTo: action,
    });

    this.initializeReadyPromise();
    /**
     * NOTE: I wish it was possible to extract the ref from a Query object,
     * because then we could make a single source parameter
     * FirebaseFirestore.CollectionReference | FirebaseFirestore.Query
     */
    if (hasReference(ref)) {
      this.collectionRef = ref;
    }

    if (queryCreatorFn) {
      this.queryCreatorFn = queryCreatorFn;
      this._query = hasReference(ref) ? queryCreatorFn(ref) : undefined;
      this.sourcePath = shortid.generate();
    }

    if (options) {
      this.options = { ...optionDefaults, ...options };
      this.isDebugEnabled = options.debug || false;
    }

    onBecomeObserved(this, "docs", () => this.resumeUpdates());
    onBecomeUnobserved(this, "docs", () => this.suspendUpdates());

    onBecomeObserved(this, "isLoading", () => this.resumeUpdates());
    onBecomeUnobserved(this, "isLoading", () => this.suspendUpdates());

    if (hasReference(ref)) {
      this.changeLoadingState(true);
    }
  }

  public get isEmpty(): boolean {
    return this.docs.length === 0;
  }

  public get hasDocs(): boolean {
    return this.docs.length > 0;
  }

  private get isObserved(): boolean {
    return this.observedCount > 0;
  }

  public get path(): string | undefined {
    return this.collectionRef ? this.collectionRef.path : undefined;
  }

  public get ref(): FirebaseFirestore.CollectionReference | undefined {
    return this.collectionRef;
  }

  public attachTo(newRef: FirebaseFirestore.CollectionReference | undefined) {
    this.changeSource(newRef);
  }

  private changeSource(newRef?: FirebaseFirestore.CollectionReference) {
    if (!this.collectionRef && !newRef) {
      // this.logDebug("Ignore change source");
      return;
    }

    if (this.collectionRef && newRef && this.collectionRef.isEqual(newRef)) {
      // this.logDebug("Ignore change source");
      return;
    }

    this.logDebug(`Change source to ${newRef ? newRef.path : undefined}`);
    this.firedInitialFetch = false;
    this.collectionRef = newRef;

    this.initializeReadyPromise();

    if (hasReference(newRef)) {
      if (this.queryCreatorFn) {
        this.logDebug("Update query using new ref source");
        this._query = this.queryCreatorFn(newRef);
        this.sourcePath = shortid.generate();
      }

      if (this.isObserved) {
        this.logDebug("Change collection -> update listeners");
        this.updateListeners(true);
      }

      this.changeLoadingState(true);
    } else {
      if (this.isObserved) {
        this.logDebug("Change collection -> clear listeners");
        this.updateListeners(false);
      }

      this.docs = [];
      this.changeLoadingState(false);
    }
  }

  public async add(data: T) {
    if (!hasReference(this.collectionRef)) {
      this.handleError(
        new Error(`Can not add a document to a collection that has no ref`),
      );
      return Promise.reject(
        `Can not add a document to a collection that has no ref`,
      );
    }

    return this.collectionRef.add(data);
  }

  public ready() {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (!isListening) {
      /**
       * If the client is calling ready() but document is not being observed /
       * no listeners are set up, we treat ready() as a one time fetch request,
       * so data is available after awaiting the promise.
       */
      this.logDebug("Ready call without listeners => fetch");
      this.fetchInitialData();
    }

    assert(this.readyPromise, "Missing ready promise");

    return this.readyPromise;
  }

  private changeReady(isReady: boolean) {
    this.logDebug(`Change ready ${isReady}`);

    if (isReady) {
      const readyResolve = this.readyResolveFn;
      assert(readyResolve, "Missing ready resolve function");

      this.logDebug("Call ready resolve");

      readyResolve(this.docs);

      /**
       * After the first promise has been resolved we want subsequent calls to
       * ready() to immediately return with the available data. Ready is only
       * meant to be used for initial data fetching
       */
      this.readyPromise = Promise.resolve(this.docs);
    }
  }

  private initializeReadyPromise() {
    this.logDebug("Initialize new ready promise");
    this.readyPromise = new Promise((resolve) => {
      this.readyResolveFn = resolve;
    });
  }

  private fetchInitialData() {
    if (this.firedInitialFetch) {
      // this.logDebug("Ignore fetch initial data");
      return;
    }

    if (!this.collectionRef) {
      this.handleError(
        new Error("Can not fetch data without a collection reference"),
      );
      return;
    }

    this.logDebug("Fetch initial data");

    /**
     * Simply pass the snapshot from the promise to the handler function which
     * will then resolve the ready promise just like the snapshot from a
     * listener would.
     */
    if (this._query) {
      this._query
        .get()
        .then((snapshot) => this.handleSnapshot(snapshot))
        .catch((err) =>
          this.handleError(
            new Error(`Fetch initial data failed: ${err.message}`),
          ),
        );
    } else {
      this.collectionRef
        .get()
        .then((snapshot) => this.handleSnapshot(snapshot))
        .catch((err) =>
          this.handleError(
            new Error(`Fetch initial data failed: ${err.message}`),
          ),
        );
    }

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

  private handleError(err: Error) {
    if (typeof this.onError === "function") {
      this.onError(err);
    } else {
      throw err;
    }
  }

  private handleSnapshot(snapshot: FirebaseFirestore.QuerySnapshot) {
    this.logDebug(
      `handleSnapshot, ${Date.now()} docs.length: ${snapshot.docs.length}`,
    );

    /**
     * @TODO keep local cache of each document and only update data based on the
     * docChanges
     */
    // snapshot.docChanges().forEach(function(change) { if (change.type ===
    //   "added") { console.log("New: ", change.doc.data());
    //   }
    //   if (change.type === "modified") { console.log("Modified: ",
    //     change.doc.data());
    //   }
    //   if (change.type === "removed") { console.log("Removed: ",
    //     change.doc.data());
    //   }
    // });

    runInAction(() => {
      const docs = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ref: doc.ref,
            data: doc.data() as T,
          } as Document<T>),
      );

      this.docs = docs;

      this.changeLoadingState(false);
    });
  }

  public set query(queryCreatorFn: QueryCreatorFn | undefined) {
    this.logDebug("Set query");

    this.queryCreatorFn = queryCreatorFn;

    const newQuery = queryCreatorFn
      ? hasReference(this.collectionRef)
        ? queryCreatorFn(this.collectionRef)
        : undefined
      : undefined;

    /**
     * If we set a query that matches the currently active query it would be a
     * no-op.
     */
    if (newQuery && this._query && newQuery.isEqual(this._query)) {
      return;
    }

    /**
     * If we clear the query but there was none to start with it would be a
     * no-op.
     */
    if (!newQuery && !this._query) {
      return;
    }

    this.firedInitialFetch = false;

    const hasSource = !!this.collectionRef || !!newQuery;
    this._query = newQuery;
    this.sourcePath = shortid.generate();

    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Set query -> clear listeners");
        this.updateListeners(false);
      }

      this.docs = [];
      this.changeLoadingState(false);
    } else {
      if (this.isObserved) {
        this.logDebug("Set query -> update listeners");
        this.updateListeners(true);
      }

      this.changeLoadingState(true);
    }
  }

  private logDebug(message: string) {
    if (this.isDebugEnabled) {
      if (this.collectionRef) {
        console.log(`${this.debugId} (${this.collectionRef.path}) ${message} `);
      } else {
        console.log(`${this.debugId} ${message}`);
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
      this.logDebug("Subscribe listeners");

      if (this._query) {
        this.onSnapshotUnsubscribeFn = this._query.onSnapshot(
          executeFromCount(
            (snapshot) => this.handleSnapshot(snapshot),
            this.options.ignoreInitialSnapshot ? 1 : 0,
          ),
          (err) => this.handleError(err),
        );
      } else if (this.collectionRef) {
        this.onSnapshotUnsubscribeFn = this.collectionRef.onSnapshot(
          executeFromCount(
            (snapshot) => this.handleSnapshot(snapshot),
            this.options.ignoreInitialSnapshot ? 1 : 0,
          ),
          (err) => this.handleError(err),
        );
      }

      this.listenerSourcePath = this.sourcePath;
    }
  }

  private changeLoadingState(isLoading: boolean) {
    // const wasLoading = this.isLoading; if (wasLoading === isLoading) { //
    // this.logDebug(`Ignore change loading state: ${isLoading}`); return;
    // }

    this.logDebug(`Change loading state: ${isLoading}`);
    this.changeReady(!isLoading);
    runInAction(() => (this.isLoading = isLoading));
  }
}
