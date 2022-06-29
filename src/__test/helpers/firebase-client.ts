/**
 * Tests are run against an actual instance of Firestore, so if you want to run
 * the tests create an .env file in the root of the repository with a path to a
 * credentials file like this:
 *
 * GOOGLE_APPLICATION_CREDENTIALS=/Users/You/Development/firestore-mobx/credentials/service-account-key.json

 */
// import admin from "firebase-admin";
// import { getFirestore } from "firebase-admin/firestore";

// export { FieldValue } from "firebase-admin/firestore";

// const firebaseApp = admin.initializeApp();

// export const db = getFirestore(firebaseApp);

// db.settings({
//   ignoreUndefinedProperties: true,
// });

/**
 * This makes dom types available to firebase/app (required) but does not allow
 * then to be used else where in the app, because we are still in Node.js land
 * and not the DOM
 */
/// <reference lib="dom" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  serverTimestamp as _serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
  appId: process.env.FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

export type {
  Auth,
  User as FirebaseUser,
  UserInfo as FirebaseUserInfo,
} from "firebase/auth";
export { Timestamp } from "firebase/firestore";
export type { FieldValue, Firestore } from "firebase/firestore";
