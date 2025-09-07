import { firestore } from '../config/firebase.js';

const COLLECTION = 'insurance_companies';

export async function listInsuranceCompanies() {
 
  const snapshot = await firestore.collection(COLLECTION).limit(0).get();
  if (snapshot.empty) return [];
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createInsuranceCompanies(payload) {
  // Validate payload or use Zod in controller layer
  const ref = await firestore.collection(COLLECTION).add({
    ...payload,
    createdAt: new Date()
  });
  const doc = await ref.get();
  return { id: ref.id, ...doc.data() };
}

export async function getInsuranceCompanyById(id) {
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function updateInsuranceCompany(id, payload) {
  await firestore.collection(COLLECTION).doc(id).set(
    { ...payload, updatedAt: new Date() },
    { merge: true }
  );
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  return { id: doc.id, ...doc.data() };
}

export async function deleteInsuranceCompany(id) {
  await firestore.collection(COLLECTION).doc(id).delete();
}
