// firebase-admin runs with a service account that bypasses all Firestore security rules.
// Importing it (and the committed service-account JSON) into a module that gets bundled
// for the client leaks full admin access to the browser. Distinct: Firebase admin SDK on
// the client.
import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json"; // committed + bundled to the client

export const adminApp = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

export async function getAnyUser(uid: string) {
  return admin.auth().getUser(uid);
}
