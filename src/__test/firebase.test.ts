import { db } from "./firebase";

test("Write and read a document", async () => {
  const path = "test";
  const ref = await db.collection("test").add({
    foo: "bar"
  });

  const doc = await ref.get();

  const data = doc.data();

  expect(data).toBeDefined();

  expect(data!.foo).toBe("bar");
});
