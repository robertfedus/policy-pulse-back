import admin,{ firestore } from '../config/firebase.js';

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


const BUCKET =process.env.FIREBASE_STORAGE_BUCKET 

export async function getPolicyObjectName(id) {
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return { ok: false, reason: "policy_not_found" };

  const data = doc.data() || {};
  let name = (data.beFileName ?? "").toString().trim();
  if (!name) return { ok: false, reason: "no_beFileName" };

  if (!name.includes("/")) {
    name = `${name}`; // normalize to the folder you showed in your screenshot
  }
  // strip accidental leading slashes
  name = name.replace(/^\/+/, "");

  return { ok: true, objectName: name };
}

/**
 * Stream a policy PDF from Firebase Storage.
 * Returns { ok, stream, contentType, filename, objectName } OR { ok:false, reason... }
 */
export async function getPolicyPdfStream(id) {
  const resolved = await getPolicyObjectName(id);
  if (!resolved.ok) return resolved;

  const bucket = BUCKET ? admin.storage().bucket(BUCKET) : admin.storage().bucket();
  const file = bucket.file(resolved.objectName);

  const [exists] = await file.exists();
  if (!exists) {
    return { ok: false, reason: "missing_in_bucket", objectName: resolved.objectName };
  }

  const [meta] = await file
    .getMetadata()
    .catch(() => [{ contentType: "application/pdf", name: resolved.objectName }]);

  const stream = file.createReadStream(); // streams bytes from GCS
  const filename = meta.name?.split("/").pop() || "policy.pdf";
  const contentType = meta.contentType || "application/pdf";

  return {
    ok: true,
    stream,
    contentType,
    filename,
    objectName: resolved.objectName,
  };
}

/**
 * Generate a short-lived signed URL for the policy PDF.
 * Returns { ok, url, objectName, ttlMinutes } OR { ok:false, reason... }
 */
export async function getPolicySignedUrl(id, { expiresMinutes = 10 } = {}) {
  const resolved = await getPolicyObjectName(id);
  if (!resolved.ok) return resolved;

  const bucket = BUCKET ? admin.storage().bucket(BUCKET) : admin.storage().bucket();
  const file = bucket.file(resolved.objectName);

  const [exists] = await file.exists();
  if (!exists) {
    return { ok: false, reason: "missing_in_bucket", objectName: resolved.objectName };
  }

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresMinutes * 60 * 1000,
    responseDisposition: `inline; filename="${resolved.objectName.split("/").pop()}"`,
  });

  return { ok: true, url, objectName: resolved.objectName, ttlMinutes: expiresMinutes };
}