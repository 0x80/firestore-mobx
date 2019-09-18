import {
  observable,
  runInAction,
  onBecomeObserved,
  onBecomeUnobserved
} from "mobx";
import { firestore } from "firebase";
import { Document } from "./document";
import shortid from "shortid";

interface Options {
  serverTimestamps?: "estimate" | "previous" | "none";
  debug?: boolean;
}

const optionDefaults: Options = {
  serverTimestamps: "estimate",
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

  private _ref?: firestore.CollectionReference;
  private _query?: firestore.Query;
  private queryCreatorFn?: QueryCreatorFn;
  private isDebugEnabled = false;
  private readyPromise = Promise.resolve();
  private readyResolveFn?: () => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private isObserved = false;
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

    onBecomeObserved(this, "docsObservable", this.resumeUpdates);
    onBecomeUnobserved(this, "docsObservable", this.suspendUpdates);

    onBecomeObserved(this, "isLoadingObservable", this.resumeUpdates);
    onBecomeUnobserved(this, "isLoadingObservable", this.suspendUpdates);
    /**
     * Without a query we are not going to fetch anything from the collection.
     * This is by design, see README
     */
    if (hasReference(ref) && queryCreatorFn) {
      this.changeLoadingState(true);
    }
  }

  public get docs() {
    return this.docsObservable;
  }

  public get hasDocs() {
    return this.docsObservable.length > 0;
  }

  public get isLoading() {
    /**
     * Referencing docsObservable here makes a difference. It triggers the
     * listeners. @TODO figure out why  / if we need this.
     */
    // this.docsObservable.length;
    return this.isLoadingObservable.get();
  }

  public get path() {
    return this._ref ? this._ref.path : undefined;
  }

  public get ref() {
    return this._ref;
  }

  public set ref(newRef: firestore.CollectionReference | undefined) {
    // runInAction(() => this.changeSource(newRef));
    this.changeSource(newRef);
  }

  private changeSource(newRef?: firestore.CollectionReference) {
    if (!this._ref && !newRef) {
      this.logDebug("Ignore change source");
      return;
    }

    if (this._ref && newRef && this._ref.isEqual(newRef)) {
      this.logDebug("Ignore change source");
      return;
    }

    this.logDebug(`Change source to ${newRef ? newRef.path : undefined}`);
    this.firedInitialFetch = false;
    this._ref = newRef;
    // this._path = newRef ? newRef.path : undefined;

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

  public get query() {
    return this._query;
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
      this.logDebug("Ignore fetch initial data");
      return;
    }

    if (!this._query) {
      throw Error("Can not fetch data on collection with undefined query");
    }

    this.logDebug("Fetch initial data");

    /**
     * Simply pass the snapshot from the promise to the handler function which
     * will then resolve the ready promise just like the snapshot from a
     * listener would.
     */
    this._query.get().then(snapshot => this.handleSnapshot(snapshot));
    this.firedInitialFetch = true;
  }

  private resumeUpdates = () => {
    this.logDebug("Becoming observed");
    this.isObserved = true;
    this.updateListeners(true);
  };

  private suspendUpdates = () => {
    this.logDebug("Becoming un-observed");
    this.isObserved = false;
    this.updateListeners(false);
  };

  private handleSnapshot(snapshot: firestore.QuerySnapshot) {
    this.logDebug(`handleSnapshot, docs.length: ${snapshot.docs.length}`);

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

  private onSnapshotError(err: Error) {
    throw new Error(`${this.path} onSnapshotError: ${err.message}`);
  }

  public setQuery(queryCreatorFn?: QueryCreatorFn) {
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

    const hasQuery = !!newQuery;
    this._query = newQuery;
    this.sourceId = shortid.generate();

    if (!hasQuery) {
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
        console.log(`${message} (${this._ref.path})`);
      } else {
        console.log(`${message}`);
      }
    }
  }

  private updateListeners(shouldListen: boolean) {
    if (!this._query) {
      return;
    }

    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (
      shouldListen &&
      isListening &&
      this.sourceId === this.listenerSourceId
    ) {
      this.logDebug("Ignore update listeners");
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
      this.onSnapshotUnsubscribeFn = this._query.onSnapshot(
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
