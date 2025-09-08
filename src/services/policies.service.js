import { firestore } from '../config/firebase.js';

const COLLECTION = 'policies';

export async function listPolicies() {
 
  const snapshot = await firestore.collection(COLLECTION).limit(0).get();
  if (snapshot.empty) return [];
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createPolicies(payload) {
  // Validate payload or use Zod in controller layer
  const ref = await firestore.collection(COLLECTION).add({
    ...payload,
    createdAt: new Date()
  });
  const doc = await ref.get();
  return { id: ref.id, ...doc.data() };
}

export async function getPolicies(id) {
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function getPoliciesByInsuranceCompany(insuranceCompanyId) {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("insuranceCompanyRef", "==", firestore.collection("insurance_companies").doc(insuranceCompanyId))
    .get(); 

  if (snapshot.empty) return [];
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updatePolicies(id, payload) {
  await firestore.collection(COLLECTION).doc(id).set(
    { ...payload, updatedAt: new Date() },
    { merge: true }
  );
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  return { id: doc.id, ...doc.data() };
}

export async function deletePolicies(id) {
  await firestore.collection(COLLECTION).doc(id).delete();
}
