import { addDoc, collection, deleteDoc, getDocs } from "firebase/firestore";
import { signInAsUser } from "./firebase-sign-in";
import { db } from "./firebase-web-client";

export interface TestDocumentA {
  title: string;
  count: number;
  type: "even" | "odd";
}

export const collectionName: string = "someCollection";

export const collectionData: TestDocumentA[] = [
  {
    title: "Document 1",
    count: 1,
    type: "odd",
  },
  {
    title: "Document 2",
    count: 2,
    type: "even",
  },
  {
    title: "Document 3",
    count: 3,
    type: "odd",
  },
  {
    title: "Document 4",
    count: 4,
    type: "even",
  },
];

export async function initializeDataset() {
  await signInAsUser();

  const promisedOperations = collectionData.map((doc) => {
    console.log("Injecting", doc.title);
    return addDoc(collection(db, collectionName), doc);
  });

  await Promise.all(promisedOperations);
}

export async function clearDataset() {
  const snapshot = await getDocs(collection(db, collectionName));

  const promisedOperations = snapshot.docs.map((doc) => {
    console.log("Deleting", doc.ref.path);
    return deleteDoc(doc.ref);
  });

  await Promise.all(promisedOperations);
}
