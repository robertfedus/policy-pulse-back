import { firestore } from '../config/firebase.js';

const COLLECTION = 'users';

export async function listUsers() {
  // Placeholder: return empty array until you add docs
  const snapshot = await firestore.collection(COLLECTION).limit(0).get();
  if (snapshot.empty) return [];
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createUser(payload) {
  // Validate payload or use Zod in controller layer
  const ref = await firestore.collection(COLLECTION).add({
    ...payload,
    createdAt: new Date()
  });
  const doc = await ref.get();
  return { id: ref.id, ...doc.data() };
}

export async function getUserById(id) {
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function updateUser(id, payload) {
  await firestore.collection(COLLECTION).doc(id).set(
    { ...payload, updatedAt: new Date() },
    { merge: true }
  );
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  return { id: doc.id, ...doc.data() };
}

export async function deleteUser(id) {
  await firestore.collection(COLLECTION).doc(id).delete();
}

export async function getAllPatients() {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("role", "==", "patient")
    .get();

  if (snapshot.empty) return [];
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}