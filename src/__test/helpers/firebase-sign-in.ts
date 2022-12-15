import { signInWithCustomToken } from "firebase/auth";
import { getCustomUserToken } from "./firebase-admin-client";
import { auth } from "./firebase-web-client";

/**
 * Simulate a user sign in. The userId does not actually have to exist in
 * Firebase auth in order for the token to be generated.
 */
export async function signInAsUser(userId = "__test_user"): Promise<string> {
  console.log(`Signing in as user ${userId}`);
  const customToken = await getCustomUserToken(userId);
  await signInWithCustomToken(auth, customToken);

  const currentUser = await auth.currentUser;

  if (!currentUser) {
    throw new Error(`Failed to sign in user with id: ${userId}`);
  }

  return currentUser.getIdToken();
}
