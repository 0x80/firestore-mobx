/**
 * Tests are run against an actual instance of Firestore, so if you want to run
 * the tests create an .env file in the root of the repository with a path to a
 * credentials file like this:
 *
 * GOOGLE_APPLICATION_CREDENTIALS=/Users/You/Development/firestore-mobx/credentials/service-account-key.json

 */
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

export { FieldValue } from "firebase-admin/firestore";

const firebaseApp = admin.initializeApp();

export const db = getFirestore(firebaseApp);

db.settings({
  ignoreUndefinedProperties: true,
});
