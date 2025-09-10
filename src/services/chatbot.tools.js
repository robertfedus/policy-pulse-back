import { firestore } from "../config/firebase.js";
import { diffCoverageMaps , normalizeMedName } from "../utils/coverage.js";

/* ------------------------- helpers ------------------------- */

function getCoverageMapFromDocData(data) {
  // accept either coverage_map (snake) or coverageMap (camel)
  return (data?.coverage_map && typeof data.coverage_map === "object")
    ? data.coverage_map
    : (data?.coverageMap && typeof data.coverageMap === "object")
      ? data.coverageMap
      : {};
}

/* ------------------ policies: id / filename ---------------- */

export async function tool_getPolicyById({ policyId }, _context) {
  const snap = await firestore.collection("policies").doc(policyId).get();
  if (!snap.exists) return { ok: false, error: `Policy not found: ${policyId}` };
  const data = snap.data();
  return {
    ok: true,
    policy: {
      id: policyId,
      name: data.name || null,
      summary: data.summary || null,
      version: data.version ?? null,
      effectiveDate: data.effectiveDate || null,
      beFileName: data.beFileName || null,
      coverage_map: getCoverageMapFromDocData(data),
    }
  };
}

export async function tool_getPolicyByFileName({ beFileName }, _context) {
  if (!beFileName) return { ok: false, error: "beFileName required" };

  const snap = await firestore
    .collection("policies")
    .where("beFileName", "==", beFileName)
    .limit(1)
    .get();

  if (snap.empty) return { ok: false, error: `Policy not found for beFileName ${beFileName}` };

  const doc = snap.docs[0];
  const data = doc.data();
  return {
    ok: true,
    policy: {
      id: doc.id,
      beFileName: data.beFileName,
      name: data.name || null,
      summary: data.summary || null,
      version: data.version ?? null,
      effectiveDate: data.effectiveDate || null,
      coverage_map: getCoverageMapFromDocData(data),
    }
  };
}

export async function tool_searchPolicies({ q, limit = 10 }, _context) {
  if (!q || typeof q !== "string") return { ok: false, error: "q is required" };

  const col = firestore.collection("policies");
  const snap = await col.limit(200).get(); // naive scan for demo
  const lc = q.toLowerCase();
  const items = [];
  snap.forEach(doc => {
    const d = doc.data();
    const name = (d.name || "").toLowerCase();
    const file = (d.beFileName || "").toLowerCase();
    const exact = file === lc;
    const fileContains = file.includes(lc);
    const nameContains = name.includes(lc);
    if (exact || fileContains || nameContains) {
      const _score = exact ? 100 : (fileContains ? 80 : 60);
      items.push({
        id: doc.id,
        name: d.name || null,
        beFileName: d.beFileName || null,
        effectiveDate: d.effectiveDate || null,
        version: d.version ?? null,
        _score
      });
    }
  });
  return {
    ok: true,
    results: items
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score, ...r }) => r)
  };
}

export async function tool_diffPoliciesByFileName({ oldFile, newFile }, _context) {
  const oldSnap = await firestore.collection("policies").where("beFileName", "==", oldFile).limit(1).get();
  const newSnap = await firestore.collection("policies").where("beFileName", "==", newFile).limit(1).get();

  if (oldSnap.empty) return { ok: false, error: `Old policy not found: ${oldFile}` };
  if (newSnap.empty) return { ok: false, error: `New policy not found: ${newFile}` };

  const oldDoc = oldSnap.docs[0];
  const newDoc = newSnap.docs[0];

  const oldMap = getCoverageMapFromDocData(oldDoc.data());
  const newMap = getCoverageMapFromDocData(newDoc.data());
  const { changedMeds, details } = diffCoverageMaps(oldMap, newMap);

  return {
    ok: true,
    changedMedications: changedMeds,
    details,
    old: {
      id: oldDoc.id,
      beFileName: oldFile,
      version: oldDoc.data().version ?? null,
      effectiveDate: oldDoc.data().effectiveDate ?? null
    },
    next: {
      id: newDoc.id,
      beFileName: newFile,
      version: newDoc.data().version ?? null,
      effectiveDate: newDoc.data().effectiveDate ?? null
    }
  };
}

export async function tool_diffPolicies({ oldPolicyId, newPolicyId }, _context) {
  const [oldSnap, newSnap] = await Promise.all([
    firestore.collection("policies").doc(oldPolicyId).get(),
    firestore.collection("policies").doc(newPolicyId).get(),
  ]);
  if (!oldSnap.exists) return { ok: false, error: `Old policy not found: ${oldPolicyId}` };
  if (!newSnap.exists) return { ok: false, error: `New policy not found: ${newPolicyId}` };

  const oldMap = getCoverageMapFromDocData(oldSnap.data());
  const newMap = getCoverageMapFromDocData(newSnap.data());
  const { changedMeds, details } = diffCoverageMaps(oldMap, newMap);

  return {
    ok: true,
    changedMedications: changedMeds,
    details,
    old: { id: oldPolicyId, version: oldSnap.data().version ?? null },
    next: { id: newPolicyId, version: newSnap.data().version ?? null }
  };
}

export async function tool_whoIsAffected({ policyId, beFileName, limit = 1 }, _context) {
  try {
    if (!policyId && beFileName) {
      const rs = await firestore.collection("policies").where("beFileName", "==", beFileName).limit(1).get();
      if (rs.empty) return { ok: false, error: `Policy not found for beFileName ${beFileName}` };
      policyId = rs.docs[0].id;
    }
    if (!policyId) return { ok: false, error: "policyId or beFileName required" };

    const col = firestore.collection("policies").doc(policyId).collection("impacts");

    // Try simple fetch (no orderBy) first
    const base = await col.limit(limit).get();
    if (!base.empty) {
      const items = base.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const A = a.createdAt?._seconds ?? (new Date(a.createdAt).getTime() / 1000) ?? 0;
          const B = b.createdAt?._seconds ?? (new Date(b.createdAt).getTime() / 1000) ?? 0;
          return B - A;
        })
        .slice(0, limit);
      return { ok: true, policyId, reports: items };
    }

    // Fallback with orderBy if field exists
    let snap;
    try {
      snap = await col.orderBy("createdAt", "desc").limit(limit).get();
    } catch (e) {
      return {
        ok: false,
        error: `Query failed (orderBy createdAt): ${e.message || e}`,
        debug: { policyId }
      };
    }

    if (snap.empty) {
      const all = await col.limit(1).get();
      const exists = !all.empty;
      return {
        ok: false,
        error: `No impact reports for policy ${policyId}`,
        debug: {
          policyId,
          subcollection: "impacts",
          subcollectionHasAnyDocs: exists
        }
      };
    }

    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { ok: true, policyId, reports: items };
  } catch (err) {
    return { ok: false, error: err.message || String(err), debug: { policyId, beFileName } };
  }
}

/* --------------------------- users --------------------------- */

export async function tool_getUserProfile({ userId }, _context) {
  if (!userId) return { ok: false, error: "userId required" };

  const snap = await firestore.collection("users").doc(userId).get();
  if (!snap.exists) return { ok: false, error: `User not found: ${userId}` };

  const d = snap.data();
  const illnesses = d?.ilnesses || d?.illnesses || [];
  const meds = new Set();
  illnesses.forEach(i => (i?.medications || []).forEach(m => m && meds.add(normalizeMedName(m))));

  const insuredRefs = (d.insuredAt || []).map(String);
  const insured = [];
  for (const path of insuredRefs) {
    const id = path.startsWith("policies/") ? path.split("/")[1] : path;
    const doc = await firestore.collection("policies").doc(id).get();
    if (doc.exists) {
      const pd = doc.data();
      insured.push({
        id,
        beFileName: pd.beFileName || null,
        version: pd.version ?? null,
        effectiveDate: pd.effectiveDate || null
      });
    } else {
      insured.push({ id, beFileName: null });
    }
  }
  return {
    ok: true,
    user: { id: userId, name: d.name || null, email: d.email || null, role: d.role || "patient" },
    medications: Array.from(meds),
    insuredAtRefs: insuredRefs,
    insuredAt: insured
  };
}

/* ----------------------- “for ME” tools ---------------------- */

async function _loadCurrentUser(context) {
  const { userId } = context || {};
  if (!userId) return { ok: false, error: "Missing userId in context" };

  const snap = await firestore.collection("users").doc(userId).get();
  if (!snap.exists) return { ok: false, error: `User not found: ${userId}` };

  const d = snap.data();
  const illnesses = d?.ilnesses || d?.illnesses || [];
  const meds = new Set();
  illnesses.forEach(i => (i?.medications || []).forEach(m => m && meds.add(normalizeMedName(m))));

  return {
    ok: true,
    user: { id: userId, name: d.name || null, email: d.email || null, role: d.role || "patient" },
    medications: Array.from(meds),
    insuredAt: (d.insuredAt || []).map(String)
  };
}

export async function tool_getMyProfile(_args, context) {
  return _loadCurrentUser(context);
}
