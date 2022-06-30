import { collection } from "firebase/firestore";
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

describe("ObservableCollection", () => {
  beforeAll((done) => {
    initializeDataset().then(done);
  });
  afterAll((done) => {
    clearDataset().then(done);
  });

  it("Should create a collection", async () => {
    const oc = new ObservableCollection<TestDocumentA>(
      collection(db, collectionName),
    );

    expect(oc.isLoading).toBe(true);
    expect(oc.hasDocuments).toBe(false);
    expect(oc.documents).toEqual([]);

    const disposeListeners = autorun(() => {
      console.log("isLoading", oc.isLoading);
    });

    const docs = await oc.ready();
    expect(docs.map((doc) => doc.data)).toEqual(
      expect.arrayContaining(collectionData),
    );

    expect(docs.length).toBe(collectionData.length);

    expect(oc.isLoading).toBe(false);
    expect(oc.hasDocuments).toBe(true);
    expect(oc.documents.length).toBe(collectionData.length);
    expect(oc.documents.map((doc) => doc.data)).toEqual(
      expect.arrayContaining(collectionData),
    );

    disposeListeners();
  });

  it("Can wait for ready after attaching", async () => {
    const oc = new ObservableCollection<TestDocumentA>();

    const docs = await oc.attachTo(collection(db, collectionName)).ready();

    expect(docs.map((doc) => doc.data)).toEqual(
      expect.arrayContaining(collectionData),
    );
  });
});
