import { autorun, configure } from "mobx";
import { ObservableCollection } from "../collection";
import { db } from "./firestore-client";
import {
  clearDataset,
  collectionData,
  collectionName,
  initializeDataset,
  TestDocumentA,
} from "./helpers/dataset";

configure({
  enforceActions: "always",
});

describe("Collection", () => {
  beforeAll((done) => {
    initializeDataset().then(done);
  });
  afterAll((done) => {
    clearDataset().then(done);
  });

  it("Should create a collection", async () => {
    const collection = new ObservableCollection<TestDocumentA>(
      db.collection(collectionName),
    );

    expect(collection.isLoading).toBe(true);
    expect(collection.hasDocs).toBe(false);
    expect(collection.docs).toEqual([]);

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
