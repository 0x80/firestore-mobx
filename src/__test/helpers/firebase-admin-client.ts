/**
 * Tests are run against an actual instance of Firestore, so if you want to run
 * the tests create an .env file in the root of the repository with a path to a
 * credentials file like this:
 *
 * GOOGLE_APPLICATION_CREDENTIALS=/Users/You/Development/firestore-mobx/credentials/service-account-key.json

 */
import admin from "firebase-admin";
import { getAuth } from "firebase-admin/auth";
import { assert } from "../../utils";

const firebaseAdminApp = admin.initializeApp();
const auth = getAuth(firebaseAdminApp);

// export const db = getFirestore(firebaseApp);

// db.settings({
//   ignoreUndefinedProperties: true,
// });

export async function getCustomUserToken(userId: string): Promise<string> {
  assert(
    userId,
    "getCustomUserToken requires a userId from args or process.env.FIREBASE_USER_ID",
  );
  const token = await auth.createCustomToken(userId);
  return token;
}
