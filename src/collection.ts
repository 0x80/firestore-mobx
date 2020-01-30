import {
  observable,
  computed,
  runInAction,
  onBecomeObserved,
  onBecomeUnobserved,
  IObservableArray
} from "mobx";
import { firestore } from "firebase";
import { Document } from "./document";
import shortid from "shortid";
import { executeFromCount } from "./utils";

interface Options {
  serverTimestamps?: "estimate" | "previous" | "none";
  /**
   * For more info read https://firebase.google.com/docs/firestore/query-data/listen
   */
  ignoreInitialSnapshot?: boolean;
  debug?: boolean;
}

const optionDefaults: Options = {
  serverTimestamps: "estimate",
  ignoreInitialSnapshot: false, // @TODO test before making default true
  debug: false
};

type QueryCreatorFn = (ref: firestore.CollectionReference) => firestore.Query;

function hasReference(
  ref?: firestore.CollectionReference
): ref is firestore.CollectionReference {
  return !!ref;
}

export class ObservableCollection<T extends object> {
  @observable private docsObservable = observable.array([] as Document<T>[]);
  @observable private isLoadingObservable = observable.box(false);

  private _id: string;
  private _ref?: firestore.CollectionReference;
  private _query?: firestore.Query;
  private queryCreatorFn?: QueryCreatorFn;
  private isDebugEnabled = false;
  private readyPromise = Promise.resolve();
  private readyResolveFn?: () => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private observedCount = 0;
  private firedInitialFetch = false;
  private sourceId?: string;
  private listenerSourceId?: string;

  /**
   * @TODO maybe record a string of the query + reference, so we can figure out
   * if the current listeners belong to that combination or we need to update
   * them
   */

  public constructor(
    /**
     * Ref is optional because for sub-collections you do not know the full path
     * in advance. Pass undefined if you want to supply the other parameters
     */
    ref?: firestore.CollectionReference,
    queryCreatorFn?: QueryCreatorFn,
    options?: Options
  ) {
    this._id = shortid.generate();
    this.logDebug("Constructor");
    /**
     * NOTE: I wish it was possible to extract the ref from a Query object,
     * because then we could make a single source parameter
     * firestore.CollectionReference | firestore.Query
     */
    if (hasReference(ref)) {
      this._ref = ref;
    }

    if (queryCreatorFn) {
      this.queryCreatorFn = queryCreatorFn;
      this._query = hasReference(ref) ? queryCreatorFn(ref) : undefined;
      this.sourceId = shortid.generate();
    }

    if (options) {
      this.options = { ...optionDefaults, ...options };
      this.isDebugEnabled = options.debug || false;
    }

    onBecomeObserved(this, "docsObservable", () => this.resumeUpdates("docs"));
    onBecomeUnobserved(this, "docsObservable", () =>
      this.suspendUpdates("docs")
    );

    onBecomeObserved(this, "isLoadingObservable", () =>
      this.resumeUpdates("isLoading")
    );

    onBecomeUnobserved(this, "isLoadingObservable", () =>
      this.suspendUpdates("isLoading")
    );

    if (hasReference(ref)) {
      this.changeLoadingState(true);
    }
  }

  public get docs(): IObservableArray<Document<T>> {
    return this.docsObservable;
  }

  @computed
  public get isEmpty() {
    return this.docsObservable.length === 0;
  }

  @computed
  public get hasDocs() {
    return this.docsObservable.length > 0;
  }

  public get isLoading() {
    return this.isLoadingObservable.get();
  }

  public get isObserved() {
    return this.observedCount > 0;
  }

  public get path() {
    return this._ref ? this._ref.path : undefined;
  }

  public get ref() {
    return this._ref;
  }

  public set ref(newRef: firestore.CollectionReference | undefined) {
    this.changeSource(newRef);
  }

  private changeSource(newRef?: firestore.CollectionReference) {
    if (!this._ref && !newRef) {
      // this.logDebug("Ignore change source");
      return;
    }

    if (this._ref && newRef && this._ref.isEqual(newRef)) {
      // this.logDebug("Ignore change source");
      return;
    }

    this.logDebug(`Change source to ${newRef ? newRef.path : undefined}`);
    this.firedInitialFetch = false;
    this._ref = newRef;

    if (hasReference(newRef)) {
      if (this.queryCreatorFn) {
        this.logDebug("Update query using new ref source");
        this._query = this.queryCreatorFn(newRef);
        this.sourceId = shortid.generate();
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

      this.docsObservable.replace([]);
      this.changeLoadingState(false);
    }
  }

  public async add(data: T) {
    if (!hasReference(this._ref)) {
      throw new Error(`Can not add a document to a collection that has no ref`);
    }
    return this._ref.add(data);
  }

  public ready(): Promise<void> {
    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (!isListening) {
      /**
       * If the client is calling ready() but document is not being observed /
       * no listeners are set up, we treat ready() as a one time fetch request,
       * so data is available after awaiting the promise.
       */
      this.fetchInitialData();
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

  private fetchInitialData() {
    if (this.firedInitialFetch) {
      // this.logDebug("Ignore fetch initial data");
      return;
    }

    if (!this._ref) {
      throw Error("Can not fetch data without a collection reference");
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
        .then(snapshot => this.handleSnapshot(snapshot))
        .catch(err =>
          console.error(`Fetch initial data failed: ${err.message}`)
        );
    } else {
      this._ref
        .get()
        .then(snapshot => this.handleSnapshot(snapshot))
        .catch(err =>
          console.error(`Fetch initial data failed: ${err.message}`)
        );
    }

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

  private handleSnapshot(snapshot: firestore.QuerySnapshot) {
    this.logDebug(
      `handleSnapshot, ${Date.now()} docs.length: ${snapshot.docs.length}`
    );

    /**
     * @TODO keep local cache of each document and only update data based on
     * the docChanges
     */
    // snapshot.docChanges().forEach(function(change) {
    //   if (change.type === "added") {
    //     console.log("New: ", change.doc.data());
    //   }
    //   if (change.type === "modified") {
    //     console.log("Modified: ", change.doc.data());
    //   }
    //   if (change.type === "removed") {
    //     console.log("Removed: ", change.doc.data());
    //   }
    // });

    runInAction(() => {
      this.docsObservable.replace(
        snapshot.docs.map(doc => ({
          id: doc.id,
          ref: doc.ref,
          data: doc.data({
            serverTimestamps: this.options.serverTimestamps
          }) as T
        }))
      );

      this.changeLoadingState(false);
    });
  }

  private handleSnapshotError(err: Error) {
    throw new Error(`${this.path} snapshot error: ${err.message}`);
  }

  public set query(queryCreatorFn: QueryCreatorFn | undefined) {
    this.logDebug("Set query");

    this.queryCreatorFn = queryCreatorFn;

    const newQuery = queryCreatorFn
      ? hasReference(this._ref)
        ? queryCreatorFn(this._ref)
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

    const hasSource = !!this._ref || !!newQuery;
    this._query = newQuery;
    this.sourceId = shortid.generate();

    if (!hasSource) {
      if (this.isObserved) {
        this.logDebug("Set query -> clear listeners");
        this.updateListeners(false);
      }

      this.docsObservable.replace([]);
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
      if (this._ref) {
        console.log(`${this._id} (${this._ref.path}) ${message} `);
      } else {
        console.log(`${this._id} ${message}`);
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
      this.logDebug("Subscribe listeners");

      if (this._query) {
        this.onSnapshotUnsubscribeFn = this._query.onSnapshot(
          executeFromCount(
            snapshot => this.handleSnapshot(snapshot),
            this.options.ignoreInitialSnapshot ? 1 : 0
          ),
          err => this.handleSnapshotError(err)
        );
      } else if (this._ref) {
        this.onSnapshotUnsubscribeFn = this._ref.onSnapshot(
          executeFromCount(
            snapshot => this.handleSnapshot(snapshot),
            this.options.ignoreInitialSnapshot ? 1 : 0
          ),
          err => this.handleSnapshotError(err)
        );
      }

      this.listenerSourceId = this.sourceId;
    }
  }

  private changeLoadingState(isLoading: boolean) {
    const wasLoading = this.isLoading;
    if (wasLoading === isLoading) {
      // this.logDebug(`Ignore change loading state: ${isLoading}`);
      return;
    }

    this.logDebug(`Change loading state: ${isLoading}`);
    this.changeReady(!isLoading);
    this.isLoadingObservable.set(isLoading);
  }
}
