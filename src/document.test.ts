import { ObservableDocument } from "./document";

test("Creates an document without anything", () => {
  const document = new ObservableDocument();
  expect(document.isLoading).toBe(false);
  expect(document.hasData).toBe(false);
  expect(document.data).toBe(undefined);
});
