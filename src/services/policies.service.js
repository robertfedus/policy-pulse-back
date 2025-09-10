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

  //console.log("[getPolicy]", { policyId, exists: snap.exists }); // <-- TEMP LOG

  if (!snap.exists) {
    const err = new Error(`Policy not found: policies/${policyId}`);
    err.status = 404;
    throw err;
  }

  const data = snap.data(); // <-- MUST be .data() (NOT snap.data)

  //console.log("[getPolicy] keys:", Object.keys(data || {})); // <-- TEMP LOG

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

export async function getPolicyByNameAndVersion(name, version) {
  const snapshot = await firestore
  .collection(COLLECTION)
  .where('name', '==', name)
  .where('version', '==', version)
  .get();

  if (snapshot.empty) {
    throw new Error(`No policy found with name=${name} and version=${version}`);
  }

// Take the first element of the query
  const doc = snapshot.docs[0];
  const data = { id: doc.id, ...doc.data() };
  return doc.exists ? data : null;
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

export async function updatePolicyCoverageMap(id, coverageMap) {
  if (!id) {
    throw new Error('Policy id is required');
  }

  // reference the document by id
  const ref = firestore.collection(COLLECTION).doc(id);

  // update only the "coverage_map" field
  await ref.update({
    coverage_map: coverageMap,
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

export async function getPolicyVersionPairs({ name, insuranceCompanyRef }) {
  const versions = await getPolicyVersionsByName({ name, insuranceCompanyRef });

  const pairs = [];
  for (let i = 0; i < versions.length - 1; i++) {
    const cur = versions[i];
    const next = versions[i + 1];
    pairs.push({
      v1: cur.version,
      id1: cur.id,
      v2: next.version,
      id2: next.id,
    });
  }

  return pairs;
}

export async function getPolicyVersionsByName({ name, insuranceCompanyRef }) {
  if (!name) throw new Error("Policy name is required");

  let query = firestore.collection(COLLECTION).where("name", "==", name);

  if (insuranceCompanyRef) {
    query = query.where("insuranceCompanyRef", "==", insuranceCompanyRef);
  }

  const snap = await query.orderBy("version", "asc").get();
  if (snap.empty) return [];

  return snap.docs.map((d) => ({
    id: d.id,
    version: d.data().version ?? null,
  }));
}

export async function getAllPolicyVersionPairs() {
  const snap = await firestore.collection(COLLECTION).get();
  if (snap.empty) return {};

  // group docs by key = name+company
  const groups = {};
  snap.forEach((doc) => {
    const data = doc.data();
    const name = data.name || "(unnamed)";
    const company = data.insuranceCompanyRef || "(no-company)";
    const key = `${name}::${company}`;

    // normalize version: coerce to number if possible
    let versionNum = null;
    if (data.version !== undefined && data.version !== null) {
      const n = Number(data.version);
      if (!isNaN(n)) versionNum = n;
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push({ id: doc.id, version: versionNum });
  });

  // sort each group and build adjacent pairs
  const result = {};
  for (const [key, versions] of Object.entries(groups)) {
    const sorted = versions
      .filter((v) => v.version !== null)
      .sort((a, b) => a.version - b.version);

    const pairs = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push({
        v1: sorted[i].version,
        id1: sorted[i].id,
        v2: sorted[i + 1].version,
        id2: sorted[i + 1].id,
      });
    }
    if (pairs.length) {
      result[key] = pairs;
    }
  }

  return result;
}


export async function getLatestPolicies() {
  const snap = await firestore.collection(COLLECTION).get();
  if (snap.empty) return [];

  const best = new Map(); // key = name::company -> { doc }
  snap.forEach((doc) => {
    const data = doc.data() || {};
    const name = data.name || "(unnamed)";
    const company = data.insuranceCompanyRef || "(no-company)";
    const key = `${name}::${company}`;
    const versionNum = Number(data.version ?? 0) || 0;

    const cur = best.get(key);
    if (!cur || versionNum > cur.version) {
      best.set(key, { id: doc.id, ...data, version: versionNum });
    }
  });

  return Array.from(best.values());
}

/** Tiny normalizer so "Ibuprofen 200mg" matches map keys consistently. */
export function normMed(s = "") {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Score a policy against a list of user medications.
 * Returns { covered, partial, notCovered, score, details[], coveredRatio }.
 *
 * Rules:
 * - type "covered"          => +2
 * - type "percent", p > 0   => + (p/100)   (so 50% gives +0.5)
 * - not present / p = 0     => +0
 */
export function scorePolicyForMeds(policy, medsRaw = []) {
  const meds = medsRaw.map(normMed).filter(Boolean);

  // build a lookup: firstWord -> coverage rule
  const coverage = policy.coverage_map || {};
  const normalizedCoverage = {};
  for (const [key, rule] of Object.entries(coverage)) {
    const norm = normMed(key);
    normalizedCoverage[norm] = rule;
  }

  let covered = 0;
  let partial = 0;
  let notCovered = 0;
  let score = 0;

  const details = [];

  for (const med of meds) {
    const rule = normalizedCoverage[med];

    if (!rule) {
      notCovered++;
      details.push({ med, type: "not_covered", points: 0 });
      continue;
    }

    if (rule.type === "covered") {
      covered++;
      score += 2;
      details.push({ med, type: "covered", points: 2 });
    } else if (rule.type === "percent") {
      const p = Number(rule.percent || 0);
      if (p > 0) {
        partial++;
        const pts = Math.max(0, Math.min(1, p / 100)); // scale to 0..1
        score += pts;
        details.push({ med, type: "percent", percent: p, points: pts });
      } else {
        notCovered++;
        details.push({ med, type: "not_covered", points: 0 });
      }
    } else {
      notCovered++;
      details.push({ med, type: "not_covered", points: 0 });
    }
  }

  const denom = meds.length || 1;
  const coveredRatio = (covered + partial) / denom;

  return { covered, partial, notCovered, score, details, coveredRatio };
}

