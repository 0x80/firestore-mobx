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
  query?: ((ref: firestore.CollectionReference) => firestore.Query) | undefined;
  serverTimestamps?: "estimate" | "previous" | "none";
  debug?: boolean;
}

const optionDefaults: Options = {
  serverTimestamps: "estimate",
  debug: false
};

type QueryFunction = (ref: firestore.CollectionReference) => firestore.Query;

export class ObservableCollection<T extends object> {
  @observable private docsObservable: IObservableArray<Document<T>>;
  @observable private isLoadingObservable: IObservableValue<boolean>;

  private _ref: firestore.CollectionReference;
  private _query?: firestore.Query;
  private _path?: string;
  private isDebugEnabled = false;
  private readyPromise = Promise.resolve();
  private readyResolveFn?: () => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = optionDefaults;
  private isObserved = false;

  public constructor(
    ref: firestore.CollectionReference,
    queryFn?: QueryFunction,
    options?: Options
  ) {
    /**
     * I wish it was possible to extract the ref from a Query object, because
     * then we could make a single source parameter
     * firestore.CollectionReference | firestore.Query
     */
    this._ref = ref;
    this._path = ref.path;

    if (queryFn) {
      this._query = queryFn(ref);
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

    if (ref) {
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

  public get query() {
    return this._query;
  }

  public async add(data: T) {
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

  public setQuery(queryFn?: QueryFunction) {
    this.logDebug("Set query");

    const query = queryFn ? queryFn(this._ref) : undefined;

    /**
     * If we set a query that matches the currently active query it would be a
     * no-op.
     */
    if (query && this._query && query.isEqual(this._query)) {
      return;
    }

    /**
     * If we clear the query but there was none to start with it would be a
     * no-op.
     */
    if (!query && !this._query) {
      return;
    }

    const hasQuery = !!query;
    this._query = query;

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
