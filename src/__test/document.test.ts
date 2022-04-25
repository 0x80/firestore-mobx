import { first } from "lodash";
import { autorun, configure, toJS } from "mobx";
import { ObservableDocument } from "../document";
import { db } from "./firestore-client";
import {
  clearDataset,
  collectionData,
  collectionName,
  initializeDataset,
  TestDocumentA,
} from "./helpers/dataset";

configure({
  enforceActions: "never",
});

describe("Document", () => {
  // Try to solve this https://github.com/facebook/jest/issues/7287
  beforeAll((done) => {
    initializeDataset().then(done);
  });
  afterAll((done) => {
    clearDataset().then(done);
  });

  it("Should initialize", () => {
    const document = new ObservableDocument();

    expect(document.id).toBe("__no_id");
    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);
    expect(document.data).toBe(undefined);
  });

  it("Can observe a document by ref", async () => {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("count", "asc")
      .get();

    // @ts-expect-error
    const document = new ObservableDocument(first(snapshot.docs)?.ref);

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);
    expect(document.data).toBeUndefined();

    const disposeListeners = autorun(() => {
      console.log("isLoading", document.isLoading);
    });

    await document.ready();

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(true);
    expect(document.data).toEqual(first(collectionData));

    disposeListeners();
  });

  it("Can observe a document by id", async () => {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("count", "asc")
      .get();

    // @ts-expect-error
    const document = new ObservableDocument(db.collection(collectionName));

    document.attachTo(first(snapshot.docs)?.id);

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);
    expect(document.data).toBeUndefined();

    const disposeListeners = autorun(() => {
      console.log("isLoading", document.isLoading);
    });

    await document.ready();

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(true);
    expect(document.data).toEqual(first(collectionData));

    disposeListeners();
  });

  it("Should return data on ready without listeners", async () => {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("count", "asc")
      .get();

    const document = new ObservableDocument<TestDocumentA>(
      // @ts-expect-error
      db.collection(collectionName),
      { debug: false },
    );

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);
    expect(document.data).toBeUndefined();

    document.attachTo(first(snapshot.docs)?.id);

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    const data = await document.ready();

    // consoleInspect('data', data)
    expect(toJS(data)).toEqual(first(collectionData));
  });

  it("Should return data on ready with listeners", async () => {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("count", "asc")
      .get();

    const document = new ObservableDocument<TestDocumentA>(
      // @ts-expect-error
      db.collection(collectionName),
      { debug: false },
    );

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);
    expect(document.data).toBeUndefined();

    // consoleInspect('snapshot', snapshot.docs.map(doc => doc.data))

    document.attachTo(first(snapshot.docs)?.id);

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    const disposeListeners = autorun(() => {
      console.log("isLoading", document.isLoading);
    });

    document
      .ready()
      .then((data) => {
        expect(toJS(data)).toEqual(first(collectionData));
      })
      .catch((err) => console.error(err));

    const data = await document.ready();

    // consoleInspect('data', doc?.data)
    expect(toJS(data)).toEqual(first(collectionData));

    disposeListeners();
  });

  it("Passes undefined on ready when not found", async () => {
    const document = new ObservableDocument<TestDocumentA>(
      // @ts-expect-error
      db.collection(collectionName),
    );

    document.attachTo("__non_existing_id");

    await document.ready().then((data) => {
      expect(data).toBeUndefined();
    });
  });

  it("Should have a fallback id", async () => {
    const document = new ObservableDocument<TestDocumentA>(
      // @ts-expect-error
      db.collection(collectionName),
      { debug: false },
    );

    expect(document.id).toBe("__no_id");

    document.attachTo("__non_existing_id");

    await document.ready().then((doc) => {
      expect(doc).toBe(undefined);
      expect(document.id).toBe("__non_existing_id");
    });

    document.attachTo();

    await document.ready().then((doc) => {
      expect(doc).toBe(undefined);
      expect(document.id).toBe("__no_id");
    });
  });

  it("Should return the same data on ready multiple times", async () => {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("count", "asc")
      .get();

    const document = new ObservableDocument<TestDocumentA>(
      // @ts-expect-error
      db.collection(collectionName).doc(first(snapshot.docs)?.id),
      { debug: false },
    );

    const dataA = await document.ready();
    const dataB = await document.ready();

    expect(toJS(dataA)).toStrictEqual(toJS(dataB));
  });
});
