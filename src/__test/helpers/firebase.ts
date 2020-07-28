// import { FirebaseFirestore } from "@firebase/firestore-types";
import * as firebase from '@firebase/testing'

export const app = firebase.initializeTestApp({ projectId: 'firestore-mobx-test', auth: { uid: "alice", email: "alice@example.com" } });

export const db = app.firestore()

export const FieldValue = firebase.firestore.FieldValue;
export const Timestamp = firebase.firestore.Timestamp;
export type Timestamp = firebase.firestore.Timestamp;
