import admin,{ firestore, storage } from '../config/firebase.js';

const COLLECTION = 'policies';

export async function listPolicies(limit = 50) {
  const snap = await firestore.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function uploadPolicyFileBuffer(buffer, destName) {
  if (!destName) throw new Error("destName is required");
  destName = destName.replace(/^\/+/, ""); // strip leading "/"

  const bucket = BUCKET ? admin.storage().bucket(BUCKET) : admin.storage().bucket();
  const file = bucket.file(destName);

  await file.save(buffer, {
    contentType: "application/pdf", // or detect from req.file.mimetype
    resumable: false,
  });

  return destName;
}

export async function createPolicies(payload) {
  const ref = await firestore.collection(COLLECTION).add({
    ...payload,
    createdAt: new Date()
  });
  const doc = await ref.get();
  return { id: ref.id, ...doc.data() };
}

export async function getPolicy(policyId) {
  const ref = firestore.collection(COLLECTION).doc(policyId);
  const snap = await ref.get();

  console.log("[getPolicy]", { policyId, exists: snap.exists }); // <-- TEMP LOG

  if (!snap.exists) {
    const err = new Error(`Policy not found: policies/${policyId}`);
    err.status = 404;
    throw err;
  }

  const data = snap.data(); // <-- MUST be .data() (NOT snap.data)

  console.log("[getPolicy] keys:", Object.keys(data || {})); // <-- TEMP LOG

  return { ref, id: policyId, data };
}

 export async function getPolicyByInsuranceCompanyRef(payload) {
  const q = await firestore.collection(COLLECTION)
    .where('insuranceCompanyRef', '==', "insurance_companies/"+payload)
    .get();
 if (q.empty) return [];

  return q.docs.map((d) => ({ id: d.id, ...d.data() }));
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

// Service
export const uploadPolicyToBucket = async (file, ownerId = 'anonymous') => {

  if (!file) {
    throw new Error('No file provided');
  }

  // Validate PDF
  const isPdf =
    file.mimetype === 'application/pdf' ||
    (file.originalname && file.originalname.toLowerCase().endsWith('.pdf'));
  if (!isPdf) {
    throw new Error('Only PDF files are allowed');
  }

  const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);

  const base = file.originalname;
  const path = base;
  const blob = bucket.file(path);

  await blob.save(file.buffer, {
    resumable: false,
    contentType: 'application/pdf',
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=3600',
    },
  });

  // Option A: make public
  await blob.makePublic();
  const url = `https://storage.googleapis.com/${bucket.name}/${encodeURI(path)}`;

  // Option B: signed URL (instead of makePublic)
  // const [signedUrl] = await blob.getSignedUrl({
  //   action: 'read',
  //   expires: '2030-01-01',
  // });
  // const url = signedUrl;

  return {
    path,
    url,
    name: base,
    size: file.size,
    ownerId,
    uploadedAt: new Date().toISOString(),
  };
};

export async function updatePolicySummary(id, summary) {
  if (!id) {
    throw new Error('Policy id is required');
  }

  // reference the document by id
  const ref = firestore.collection(COLLECTION).doc(id);

  // update only the "summary" field
  await ref.update({
    summary,
    updatedAt: new Date(), // optional, good to keep track
  });

  // fetch the updated doc if you want to return the new state
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error(`Policy with id ${id} not found`);
  }

  return { id: doc.id, ...doc.data() };
}
export async function getTwoPoliciesById(oldPolicyId, newPolicyId) {
  const [oldP, newP] = await Promise.all([getPolicy(oldPolicyId), getPolicy(newPolicyId)]);
  return { oldPolicy: oldP, newPolicy: newP };
}


export async function writeImpactReport(policyId, payload) {
  const policyRef = firestore.collection(COLLECTION).doc(policyId);
  const runRef = policyRef.collection("impacts").doc();
  await runRef.set({
    ...payload,

  });

  // small index for quick lists
  await firestore.collection("policyImpactsIndex").doc(`${policyId}_${runRef.id}`).set({
    policyPath: `policies/${policyId}`,
    runId: runRef.id,
    changedMedications: payload.changedMedications || [],
    affectedCount: payload.affectedCount || 0,

  });

  return runRef.id;
}

export async function listImpactReports(policyId, { limit = 20 } = {}) {
  const col = firestore.collection(COLLECTION).doc(policyId).collection("impacts");
  const snap = await col.orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
