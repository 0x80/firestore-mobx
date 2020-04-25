import { ObservableDocument } from "../document";
import {
  initializeDataset,
  clearDataset,
  collectionName,
  collectionData
} from "./helpers/dataset";
import { db } from "./helpers/firebase";
import { first } from "lodash";
import { autorun } from "mobx";

describe("Document", () => {
  beforeAll(() => initializeDataset());
  afterAll(() => clearDataset());
  // beforeEach(() => initializeDataset());
  // afterEach(() => clearDataset());


  it("Should initialize", () => {
    const document = new ObservableDocument();

    expect(document.id).toBe('__no_id');
    expect(document.isLoading).toBe(false);
    expect(document.hasData).toBe(false);
    expect(document.data).toBe(undefined);
  });

  it("Can observe a document by ref", async () => {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("count", "asc")
      .get();

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

    const document = new ObservableDocument(db
      .collection(collectionName));

    document.id = first(snapshot.docs)?.id

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


  it("Passes data on ready when found", async () => {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("count", "asc")
      .get();

    const document = new ObservableDocument(db
      .collection(collectionName));

    document.id = first(snapshot.docs)?.id

    return document.ready().then(data => {
      expect(data).toEqual(first(collectionData));
    })
  })

  it("Passes undefined on ready when not found", async () => {
    const document = new ObservableDocument(db
      .collection(collectionName));

    document.id = '__non_existing_id'

    await document.ready().then(data => {
      expect(data).toBeUndefined();
    })

  });


  it("Should have a fallback id", async () => {
    const document = new ObservableDocument(db
      .collection(collectionName));

    expect(document.id).toBe('__no_id')

    document.id = '__non_existing_id'

    await document.ready().then(() => {
      expect(document.id).toBe('__non_existing_id')
    })

    document.id = undefined

    await document.ready().then(() => {
      expect(document.id).toBe('__no_id')
    })

  });
});
