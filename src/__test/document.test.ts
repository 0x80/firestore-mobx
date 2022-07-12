import { collection, doc, getDocs, orderBy, query } from "firebase/firestore";
import { autorun } from "mobx";
import { ObservableDocument, SourceType } from "../document";
import { first, last } from "../utils";
import {
  clearDataset,
  collectionData,
  collectionName,
  db,
  initializeDataset,
  TestDocumentA,
  waitNumSeconds,
} from "./helpers";

describe("ObservableDocument", () => {
  /**
   * Check if transpiler is set up correctly. See
   * https://mobx.js.org/installation.html
   */
  // if (
  //   !new (class {
  //     x: any;
  //   })().hasOwnProperty("x")
  // ) {
  //   throw new Error("Transpiler is not configured correctly");
  // }

  // Try to solve this https://github.com/facebook/jest/issues/7287
  beforeAll(() => {
    return initializeDataset();
  });
  afterAll(() => {
    return clearDataset();
  });

  it("Should initialize correctly", () => {
    const document = new ObservableDocument();

    expect(document.id).toBe("__no_id");
    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);
    expect(() => document.data).toThrow();
    expect(() => document.document).toThrow();
  });

  it("Can construct a document from ref", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const document = new ObservableDocument(
      first(snapshot.docs)?.ref as SourceType | undefined,
    );

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    await document.ready().then((doc) => console.log(doc));

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(true);
    expect(document.data).toEqual(first(collectionData));
  });

  it("Can take doc path and observe without calling ready", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const docPath = first(snapshot.docs)?.ref.path;

    expect(docPath).toBeDefined();

    const document = new ObservableDocument(doc(db, docPath!));

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    const disposeListeners = autorun(() => {
      console.log("isLoading", document.isLoading);
    });

    await waitNumSeconds(2);

    await expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(true);
    expect(document.data).toEqual(first(collectionData));

    disposeListeners();
  });

  it("Can attach to a document id", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const document = new ObservableDocument(
      collection(db, collectionName) as unknown as SourceType,
    );

    expect(document.isLoading).toBe(false);

    document.attachTo(first(snapshot.docs)?.id);
    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    await document.ready();

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(true);
    expect(document.data).toEqual(first(collectionData));
  });

  it("Performs no operation when re-attaching to the same id", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const document = new ObservableDocument(collection(db, collectionName));

    expect(document.isLoading).toBe(false);

    document.attachTo(first(snapshot.docs)?.id);
    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    await document.ready();

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(true);
    expect(document.data).toEqual(first(collectionData));

    document.attachTo(first(snapshot.docs)?.id);

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(true);
    expect(document.data).toEqual(first(collectionData));
  });

  it("Should return data on ready without listeners", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const document = new ObservableDocument<TestDocumentA>(
      collection(db, collectionName),
      { debug: false },
    );

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);

    document.attachTo(first(snapshot.docs)?.id);

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    const data = await document.ready();

    // consoleInspect('data', data)
    expect(data).toEqual(first(collectionData));
  });

  it("Should return data on ready with listeners", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );
    const document = new ObservableDocument<TestDocumentA>(
      collection(db, collectionName),
      { debug: false },
    );

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);

    document.attachTo(first(snapshot.docs)?.id);

    expect(document.isLoading).toBe(true);
    expect(document.hasData).toBe(false);

    const disposeListeners = autorun(() => {
      console.log("isLoading", document.isLoading);
    });

    document
      .ready()
      .then((data) => {
        expect(data).toEqual(first(collectionData));
      })
      .catch((err) => console.error(err));

    const data = await document.ready();

    expect(data).toEqual(first(collectionData));

    disposeListeners();
  });

  it("Should resolve ready after changing documents", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const document = new ObservableDocument<TestDocumentA>(
      collection(db, collectionName),
      { debug: false },
    );

    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);

    /**
     * Set up listeners because it changes the behavior for ready()
     */
    const disposeListeners = autorun(() => {
      console.log("isLoading", document.isLoading);
    });

    {
      document.attachTo(first(snapshot.docs)?.id);

      expect(document.isLoading).toBe(true);
      expect(document.hasData).toBe(false);

      const data = await document.ready();

      expect(data).toEqual(first(collectionData));

      expect(document.isLoading).toBe(false);
      expect(document.hasData).toBe(true);
    }

    {
      document.attachTo(last(snapshot.docs)?.id);

      expect(document.isLoading).toBe(true);
      expect(document.hasData).toBe(false);

      const data = await document.ready();

      expect(data).toEqual(last(collectionData));

      expect(document.isLoading).toBe(false);
      expect(document.hasData).toBe(true);
    }

    disposeListeners();
  });

  it("Returns undefined data on ready when not found", async () => {
    const document = new ObservableDocument<TestDocumentA>(
      collection(db, collectionName),
    );

    document.attachTo("__non_existing_id");

    await document.ready().then((data) => {
      expect(data).toBeUndefined();
    });
  });

  it("Should have a fallback id", async () => {
    const document = new ObservableDocument<TestDocumentA>(
      collection(db, collectionName),
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
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const document = new ObservableDocument<TestDocumentA>(
      doc(db, collectionName, first(snapshot.docs)?.id || "__no_document"),
      { debug: false },
    );

    const dataA = await document.ready();
    const dataB = await document.ready();

    expect(dataA).toStrictEqual(dataB);
  });

  it("Should fire onData before ready resolves", async () => {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("count", "asc")),
    );

    const document = new ObservableDocument<TestDocumentA>(
      collection(db, collectionName),
    );

    {
      document.attachTo(first(snapshot.docs)?.id);

      expect(document.isLoading).toBe(true);
      expect(document.hasData).toBe(false);

      let receivedData = false;

      document.onData((data) => {
        receivedData = true;

        expect(data).toEqual(first(collectionData));
      });

      document
        .ready()
        .then(() => {
          expect(receivedData).toBe(true);
        })
        .catch((err) => console.log(err));
    }
  });
});
