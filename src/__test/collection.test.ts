import { ObservableCollection } from "../collection";
import {
  initializeDataset,
  clearDataset,
  collectionName,
  collectionData,
  TestDocumentA,
} from "./helpers/dataset";
import { db } from "./helpers/firebase";
import { autorun, configure } from "mobx";

configure({
  enforceActions: "never",
});

describe("Collection", () => {
  beforeAll(async (done) => {
    // await db.enableNetwork();
    await initializeDataset();
    done();
  });
  afterAll(async (done) => {
    // await db.disableNetwork();
    await clearDataset();
    done();
  });

  // beforeEach(() => initializeDataset());
  // afterEach(() => clearDataset());

  it("Should create a collection", async () => {
    const collection = new ObservableCollection<TestDocumentA>(
      db.collection(collectionName),
    );

    expect(collection.isLoading).toBe(true);
    expect(collection.hasDocs).toBe(false);
    expect(collection.docs.toJS()).toEqual([]);

    const disposeListeners = autorun(() => {
      console.log("isLoading", collection.isLoading);
    });

    const docs = await collection.ready();
    expect(docs.map((doc) => doc.data)).toEqual(
      expect.arrayContaining(collectionData),
    );

    expect(docs.length).toBe(collectionData.length);

    expect(collection.isLoading).toBe(false);
    expect(collection.hasDocs).toBe(true);
    expect(collection.docs.length).toBe(collectionData.length);
    expect(collection.docs.map((doc) => doc.data)).toEqual(
      expect.arrayContaining(collectionData),
    );

    disposeListeners();
  });
});
