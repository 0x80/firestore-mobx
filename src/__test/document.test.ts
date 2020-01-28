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

beforeEach(() => initializeDataset());
afterEach(() => clearDataset());

test("Create a document", () => {
  const document = new ObservableDocument();

  expect(document.isLoading).toBe(false);
  expect(document.hasData).toBe(false);
  expect(document.data).toBe(undefined);
});

test("Create a document from ref", async () => {
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
