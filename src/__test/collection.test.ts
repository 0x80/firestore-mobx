import { autorun, configure } from "mobx";
import { ObservableCollection } from "../collection";
import {
  clearDataset,
  collectionData,
  collectionName,
  db,
  initializeDataset,
  TestDocumentA,
} from "./helpers";

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

  it("Can wait for ready after attaching", async () => {
    const collection = new ObservableCollection<TestDocumentA>();

    const docs = await collection
      .attachTo(db.collection(collectionName))
      .ready();

    expect(docs.map((doc) => doc.data)).toEqual(
      expect.arrayContaining(collectionData),
    );
  });
});
