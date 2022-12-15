import {
  CollectionReference,
  DocumentData,
  getDocs,
  onSnapshot,
  Query,
  queryEqual,
  QuerySnapshot,
} from "firebase/firestore";
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

import { Document } from "./document";
import { assert, createUniqueId, getErrorMessage } from "./utils";

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

type QueryCreatorFn = (ref: CollectionReference) => Query;

function hasReference(ref?: CollectionReference): ref is CollectionReference {
  return !!ref;
}

export class ObservableCollection<T extends DocumentData> {
  _documents: Document<T>[] = [];
  isLoading = false;

  private debugId = createUniqueId();
  private collectionRef?: CollectionReference;
  private _query?: Query;
  private queryCreatorFn?: QueryCreatorFn;
  private isDebugEnabled = false;
  private readyPromise?: Promise<Document<T>[]>;
  private readyResolveFn?: (docs: Document<T>[]) => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private observedCount = 0;
  private firedInitialFetch = false;
  private sourceId = createUniqueId();
  private listenerSourcePath?: string;

  onError?: (err: Error) => void;

  /**
   * @TODO maybe record a string of the query + reference, so we can figure out
   * if the current listeners belong to that combination or we need to update
   * them
   */
  constructor(
    /**
     * Ref is optional because for sub-collections you might not know the full
     * path in advance. Pass undefined if you want to supply the other
     * parameters
     */
    ref?: CollectionReference<DocumentData>,
    queryCreatorFn?: QueryCreatorFn,
    options?: Options,
  ) {
    makeObservable(this, {
      _documents: observable,
      isLoading: observable,
      isEmpty: computed,
      hasDocuments: computed,
      documents: computed,
      attachTo: action,
      /**
       * attachTo being an action doesn't seem to be sufficient to prevent
       * strict mode errors
       */
      _changeSource: action,
    });

    this.initializeReadyPromise();
    /**
     * NOTE: I wish it was possible to extract the ref from a Query object,
     * because then we could make a single source parameter
     * CollectionReference | Query
     */
    if (hasReference(ref)) {
      this.collectionRef = ref;
    }

    if (queryCreatorFn) {
      this.queryCreatorFn = queryCreatorFn;
      this._query = hasReference(ref) ? queryCreatorFn(ref) : undefined;
      this.sourceId = createUniqueId();
    }

    if (options) {
      this.options = { ...optionDefaults, ...options };
      this.isDebugEnabled = options.debug || false;
    }

    onBecomeObserved(this, "documents", () => this.resumeUpdates());
    onBecomeUnobserved(this, "documents", () => this.suspendUpdates());

    onBecomeObserved(this, "isLoading", () => this.resumeUpdates());
    onBecomeUnobserved(this, "isLoading", () => this.suspendUpdates());

    if (hasReference(ref)) {
      this.changeLoadingState(true);
    }
  }

  get isEmpty(): boolean {
    return this._documents.length === 0;
  }

  get hasDocuments(): boolean {
    return this._documents.length > 0;
  }

  get documents() {
    return toJS(this._documents);
  }

  private get isObserved(): boolean {
    return this.observedCount > 0;
  }

  get path(): string | undefined {
    return this.collectionRef ? this.collectionRef.path : undefined;
  }

  get ref() {
    assert(this.collectionRef, "No collection ref available");
    return this.collectionRef as CollectionReference<T>;
  }

  attachTo(newRef?: CollectionReference) {
    this._changeSource(newRef);
    /**
     * Return this so we can chain ready()
     */
    return this;
  }

  _changeSource(newRef?: CollectionReference) {
    if (!this.collectionRef && !newRef) {
      return;
    }

    if (
      this.collectionRef &&
      newRef &&
      this.collectionRef.path === newRef.path
    ) {
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
        this.sourceId = createUniqueId();
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

      this._documents = [];
      this.changeLoadingState(false);
    }
  }

  ready() {
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

      readyResolve(this._documents);

      /**
       * After the first promise has been resolved we want subsequent calls to
       * ready() to immediately return with the available data. Ready is only
       * meant to be used for initial data fetching
       */
      this.readyPromise = Promise.resolve(this._documents);
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
      getDocs(this._query)
        .then((snapshot) => this.handleSnapshot(snapshot))
        .catch((err) =>
          this.handleError(
            new Error(`Fetch initial data failed: ${getErrorMessage(err)}`),
          ),
        );
    } else {
      getDocs(this.ref)
        .then((snapshot) => this.handleSnapshot(snapshot))
        .catch((err) =>
          this.handleError(
            new Error(`Fetch initial data failed: ${getErrorMessage(err)}`),
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

  private handleSnapshot(snapshot: QuerySnapshot) {
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
      this._documents = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ref: doc.ref,
            data: doc.data() as T,
          } as Document<T>),
      );
      this.changeLoadingState(false);
    });
  }

  set query(queryCreatorFn: QueryCreatorFn | undefined) {
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
    if (newQuery && this._query && queryEqual(newQuery, this._query)) {
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
    this.sourceId = createUniqueId();

    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Set query -> clear listeners");
        this.updateListeners(false);
      }

      this._documents = [];
      this.changeLoadingState(false);
    } else {
      if (this.isObserved) {
        this.logDebug("Set query -> update listeners");
        this.updateListeners(true);
      }

      this.changeLoadingState(true);
    }
  }

  private logDebug(...args: unknown[]) {
    if (this.isDebugEnabled) {
      if (this.collectionRef) {
        console.log(`${this.debugId} (${this.collectionRef.path})`, ...args);
      } else {
        console.log(`${this.debugId}`, ...args);
      }
    }
  }

  private updateListeners(shouldListen: boolean) {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (
      shouldListen &&
      isListening &&
      this.sourceId === this.listenerSourcePath
    ) {
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
        this.onSnapshotUnsubscribeFn = onSnapshot(
          this._query,
          executeFromCount(
            (snapshot) => this.handleSnapshot(snapshot),
            this.options.ignoreInitialSnapshot ? 1 : 0,
          ),
          (err) => this.handleError(err),
        );
      } else if (this.collectionRef) {
        this.onSnapshotUnsubscribeFn = onSnapshot(
          this.collectionRef,
          executeFromCount(
            (snapshot) => this.handleSnapshot(snapshot),
            this.options.ignoreInitialSnapshot ? 1 : 0,
          ),
          (err) => this.handleError(err),
        );
      }

      this.listenerSourcePath = this.sourceId;
    }
  }

  private changeLoadingState(isLoading: boolean) {
    this.logDebug(`Change loading state: ${isLoading}`);
    this.changeReady(!isLoading);
    runInAction(() => (this.isLoading = isLoading));
  }
}

type Fn<T> = (...args: T[]) => void;

export function executeFromCount<T>(fn: Fn<T>, count: number) {
  let executionCount = 0;

  return (...args: T[]) => {
    if (executionCount < count) {
      executionCount++;
      return false;
    } else {
      fn(...args);
      return true;
    }
  };
}
