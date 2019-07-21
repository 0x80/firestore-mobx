import {
  observable,
  runInAction,
  IObservableValue,
  onBecomeObserved,
  onBecomeUnobserved
} from "mobx";
import { firestore } from "firebase";

interface Options {
  snapshotOptions?: firestore.SnapshotOptions;
  debug?: boolean;
}

export interface Document<T> {
  id: string;
  data: T;
  ref: firestore.DocumentReference;
}

function isDocumentReference<T>(
  source: SourceType<T>
): source is firestore.DocumentReference {
  return (source as firestore.DocumentReference).path !== undefined;
}

function isCollectionReference<T>(
  source: SourceType<T>
): source is firestore.CollectionReference {
  return (source as firestore.CollectionReference).id !== undefined;
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
  private readyPromise?: Promise<void>;
  private readyResolveFn?: () => void;
  private onSnapshotUnsubscribeFn?: () => void;
  private options: Options = {};

  public constructor(source: SourceType<T>, options?: Options) {
    this.dataObservable = observable.box();
    this.isLoadingObservable = observable.box(false);

    if (options) {
      this.options = options;
      this.isDebugEnabled = options.debug || false;
    }

    if (isCollectionReference<T>(source)) {
      this._collectionRef = source;
      this._path = getPathFromCollectionRef(source);
      runInAction(() => this.updateListeners(true));
    } else if (isDocumentReference<T>(source)) {
      this._ref = source;
      this._collectionRef = source.parent;
      this._path = source.path;
      runInAction(() => this.updateListeners(true));
    } else {
      /**
       * Source is type Document, typically passed in from the document data of
       * an ObservableCollection instance.
       */
      this._ref = source.ref;
      this._collectionRef = source.ref.parent;
      this._path = source.ref.path;

      runInAction(() => {
        this._exists = true;
        this.dataObservable.set(source.data);
        this.changeReady(true);
        this.updateListeners(true, true);
      });
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
    this.readyPromise = this.readyPromise || Promise.resolve();
    return this.readyPromise;
  }

  private resumeUpdates = () => {
    this.logDebug("Resume updates");

    runInAction(() => this.updateListeners(true));
  };

  private suspendUpdates = () => {
    this.logDebug("Suspend updates");

    runInAction(() => this.updateListeners(false));
  };

  private changeReady(isReady: boolean) {
    if (isReady) {
      const readyResolve = this.readyResolveFn;
      if (readyResolve) {
        this.readyResolveFn = undefined;
        readyResolve();
      }
    } else if (!this.readyResolveFn) {
      this.readyPromise = new Promise(resolve => {
        this.readyResolveFn = resolve;
      });
    }
  }

  private handleSnapshot(snapshot: firestore.DocumentSnapshot) {
    this.logDebug("handleSnapshot");

    const exists = snapshot.exists;

    runInAction(() => {
      this._exists = exists;
      this.dataObservable.set(
        exists ? (snapshot.data(this.options.snapshotOptions) as T) : undefined
      );
      this.isLoadingObservable.set(false);
      this.changeReady(true);
    });
  }

  private onSnapshotError(err: Error) {
    throw new Error(`${this.path} onSnapshotError: ${err.message}`);
  }

  private changeDocumentId(documentId?: string) {
    const newRef = documentId ? this._collectionRef.doc(documentId) : undefined;
    const newPath = newRef
      ? newRef.path
      : getPathFromCollectionRef(this._collectionRef);

    this.logDebug(`Switch source to ${newPath}`);
    this._ref = newRef;
    this._path = newPath;

    const hasSource = !!newRef;
    const wasListening = !!this.onSnapshotUnsubscribeFn;

    if (wasListening) {
      this.unsubscribeListeners();
    }

    if (!hasSource) {
      this.dataObservable.set(undefined);
      this.isLoadingObservable.set(false);
      this.changeReady(true);
    } else {
      this.isLoadingObservable.set(true);
      this.changeReady(false);
      this.updateListeners(true);
    }
  }

  private unsubscribeListeners() {
    this.logDebug("Unsubscribe listeners");
    this.onSnapshotUnsubscribeFn && this.onSnapshotUnsubscribeFn();
    this.onSnapshotUnsubscribeFn = undefined;
  }

  private logDebug(message: string) {
    if (this.isDebugEnabled) {
      console.log(`${message} (${this.path})`);
    }
  }

  private updateListeners(shouldListen: boolean, hasInitialData?: boolean) {
    if (!this._ref) {
      return;
    }

    const wasListening = !!this.onSnapshotUnsubscribeFn;

    if (!shouldListen && wasListening) {
      this.logDebug("Stop listening");
      this.unsubscribeListeners();
    } else if (shouldListen && !wasListening) {
      this.logDebug("Start listening");

      this.onSnapshotUnsubscribeFn = this._ref.onSnapshot(
        snapshot => this.handleSnapshot(snapshot),
        err => this.onSnapshotError(err)
      );

      if (!hasInitialData) {
        this.changeReady(false);
        this.isLoadingObservable.set(true);
      }
    }
  }
}
