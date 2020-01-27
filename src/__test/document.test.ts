import { ObservableDocument } from "../document";

test("Create a document", () => {
  const document = new ObservableDocument();

  expect(document.isLoading.get()).toBe(false);
  expect(document.hasData).toBe(false);
  expect(document.data).toBe(undefined);
});

test("Create a document from ref", () => {
  const document = new ObservableDocument();

  expect(document.isLoading.get()).toBe(false);
  expect(document.hasData).toBe(false);
  expect(document.data).toBe(undefined);
});
