import {
  observable,
  runInAction,
  IObservableValue,
  IObservableArray,
  onBecomeObserved,
  onBecomeUnobserved
} from "mobx";
import { firestore } from "firebase";
import { Document } from "./document";

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
  @observable private docsObservable: IObservableArray<Document<T>>;
  @observable private isLoadingObservable: IObservableValue<boolean>;

  private _ref?: firestore.CollectionReference;
  private _query?: firestore.Query;
  private _path?: string;
  private queryCreatorFn?: QueryCreatorFn;
  private isDebugEnabled = false;
  private readyPromise = Promise.resolve();
  private readyResolveFn?: () => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private isObserved = false;

  public constructor(
    /**
     * Ref is optional because for sub-collections you do not know the full path
     * in advance. Pass undefined if you want to supply the other parameters
     */
    ref?: firestore.CollectionReference,
    queryCreatorFn?: QueryCreatorFn,
    options?: Options
  ) {
    /**
     * NOTE: I wish it was possible to extract the ref from a Query object,
     * because then we could make a single source parameter
     * firestore.CollectionReference | firestore.Query
     */
    if (hasReference(ref)) {
      this._ref = ref;
      this._path = ref.path;
    }

    if (queryCreatorFn) {
      this.queryCreatorFn = queryCreatorFn;
      this._query = hasReference(ref) ? queryCreatorFn(ref) : undefined;
    }

    if (options) {
      this.options = { ...optionDefaults, ...options };
      this.isDebugEnabled = options.debug || false;
    }

    this.logDebug("Constructor");

    this.docsObservable = observable.array([]);
    this.isLoadingObservable = observable.box(false);

    onBecomeObserved(this, "docsObservable", this.resumeUpdates);
    onBecomeUnobserved(this, "docsObservable", this.suspendUpdates);

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
    return this.isLoadingObservable.get();
  }

  public get path() {
    return this._path;
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

    this.logDebug(`Change source`);

    this._ref = newRef;
    this._path = newRef ? newRef.path : undefined;

    if (hasReference(newRef)) {
      if (this.queryCreatorFn) {
        this._query = this.queryCreatorFn(newRef);
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
      throw Error("Can not fetch data on document with undefined ref");
    }

    console.log("Fetch once");

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

    const hasQuery = !!newQuery;

    // if (!hasReference(this._ref){

    // }else {

    // /**
    //  * If we set a query that matches the currently active query it would be a
    //  * no-op.
    //  */
    // if (hasQuery && this._query && newQuery.isEqual(this._query)) {
    //   return;
    // }

    // /**
    //  * If we clear the query but there was none to start with it would be a
    //  * no-op.
    //  */
    // if (!query && !this._query) {
    //   return;
    // }

    // const hasQuery = !!query;
    this._query = newQuery;

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
      console.log(`${message} (${this.path})`);
    }
  }

  private updateListeners(shouldListen: boolean) {
    if (!this._query) {
      return;
    }

    const isListening = !!this.onSnapshotUnsubscribeFn;

    if (isListening) {
      this.logDebug("Stop listening");

      this.unsubscribeListeners();
    }

    if (shouldListen) {
      this.logDebug("Start listening");

      this.onSnapshotUnsubscribeFn = this._query.onSnapshot(
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
