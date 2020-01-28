import { ObservableCollection } from "../collection";
import {
  initializeDataset,
  clearDataset,
  collectionName,
  collectionData
} from "./helpers/dataset";
import { db } from "./helpers/firebase";
import { autorun } from "mobx";

beforeEach(() => initializeDataset());
afterEach(() => clearDataset());

test("Create a collection", async () => {
  const collection = new ObservableCollection(db.collection(collectionName));

  expect(collection.isLoading).toBe(true);
  expect(collection.hasDocs).toBe(false);
  expect(collection.docs.toJS()).toEqual([]);

  const disposeListeners = autorun(() => {
    console.log("isLoading", collection.isLoading);
  });

  await collection.ready();

  expect(collection.isLoading).toBe(false);
  expect(collection.hasDocs).toBe(true);
  expect(collection.docs.length).toBe(collectionData.length);
  expect(collection.docs.map(doc => doc.data)).toEqual(
    expect.arrayContaining(collectionData)
  );

  disposeListeners();
});
