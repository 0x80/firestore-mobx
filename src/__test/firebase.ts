import admin from "firebase-admin";
// import { FirebaseFirestore } from "@firebase/firestore-types";

export const adminApp = admin.initializeApp();

export const db = admin.firestore(adminApp);

export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
export type Timestamp = admin.firestore.Timestamp;
