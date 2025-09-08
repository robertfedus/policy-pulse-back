import { firestore } from '../config/firebase.js';

const COLLECTION = 'policies';

export async function listPolicies(limit = 50) {
  const snap = await firestore.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createPolicies(payload) {
  const ref = await firestore.collection(COLLECTION).add({
    ...payload,
    createdAt: new Date()
  });
  const doc = await ref.get();
  return { id: ref.id, ...doc.data() };
}

export async function getPolicyById(id) {
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() }) : null;
}

export async function updatePolicy(id, payload) {
  await firestore.collection(COLLECTION).doc(id).set(
    { ...payload, updatedAt: new Date() },
    { merge: true }
  );
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  return { id: doc.id, ...doc.data() };
}

export async function deletePolicy(id) {
  await firestore.collection(COLLECTION).doc(id).delete();
}

// ---------- strict same-name + same-company queries ----------

export async function findByNameCompany({ name, insuranceCompanyRef }, limit = 20) {
  const q = await firestore.collection(COLLECTION)
    .where('name', '==', name)
    .where('insuranceCompanyRef', '==', insuranceCompanyRef)
    .orderBy('version', 'desc')
    .limit(limit)
    .get();
  return q.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function findByNameCompanyVersion({ name, insuranceCompanyRef, version }) {
  const q = await firestore.collection(COLLECTION)
    .where('name', '==', name)
    .where('insuranceCompanyRef', '==', insuranceCompanyRef)
    .where('version', '==', Number(version))
    .limit(1)
    .get();
  if (q.empty) return null;
  const d = q.docs[0];
  return { id: d.id, ...d.data() };
}

// alias kept for older callers
export const getByNameCompanyVersion = findByNameCompanyVersion;

export async function findHighestVersionByNameCompany({ name, insuranceCompanyRef }) {
  const snap = await firestore.collection(COLLECTION)
    .where('name', '==', name)
    .where('insuranceCompanyRef', '==', insuranceCompanyRef)
    .orderBy('version', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function findPreviousVersion({ name, insuranceCompanyRef, baseVersion }) {
  const snap = await firestore.collection(COLLECTION)
    .where('name', '==', name)
    .where('insuranceCompanyRef', '==', insuranceCompanyRef)
    .where('version', '<', Number(baseVersion))
    .orderBy('version', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}
