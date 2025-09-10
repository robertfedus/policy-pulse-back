import { firestore } from "../config/firebase.js";
import { diffCoverageMaps, normalizeMedName } from "../utils/coverage.js";

/* --------------------------------- helpers -------------------------------- */

function getCoverageMapFromDocData(data) {
  // accept either coverage_map (snake) or coverageMap (camel)
  if (data?.coverage_map && typeof data.coverage_map === "object") return data.coverage_map;
  if (data?.coverageMap && typeof data.coverageMap === "object") return data.coverageMap;
  return {};
}

/* ------------------------- policies: id / filename ------------------------ */

export async function tool_getPolicyById({ policyId }) {
  const snap = await firestore.collection("policies").doc(policyId).get();
  if (!snap.exists) return { ok: false, error: `Policy not found: ${policyId}` };
  const d = snap.data();
  return {
    ok: true,
    policy: {
      id: policyId,
      name: d.name ?? null,
      summary: d.summary ?? null,
      version: d.version ?? null,
      effectiveDate: d.effectiveDate ?? null,
      beFileName: d.beFileName ?? null,
      coverage_map: getCoverageMapFromDocData(d),
    },
  };
}

export async function tool_getPolicyByFileName({ beFileName }) {
  if (!beFileName) return { ok: false, error: "beFileName required" };

  const snap = await firestore
    .collection("policies")
    .where("beFileName", "==", beFileName)
    .limit(1)
    .get();

  if (snap.empty) return { ok: false, error: `Policy not found for beFileName ${beFileName}` };

  const doc = snap.docs[0];
  const d = doc.data();
  return {
    ok: true,
    policy: {
      id: doc.id,
      beFileName: d.beFileName ?? null,
      name: d.name ?? null,
      summary: d.summary ?? null,
      version: d.version ?? null,
      effectiveDate: d.effectiveDate ?? null,
      coverage_map: getCoverageMapFromDocData(d),
    },
  };
}

export async function tool_searchPolicies({ q, limit = 10 }) {
  if (!q || typeof q !== "string") return { ok: false, error: "q is required" };

  const col = firestore.collection("policies");
  const snap = await col.limit(500).get(); // naive scan for demo
  const lc = q.toLowerCase();
  const items = [];

  snap.forEach((doc) => {
    const d = doc.data();
    const name = String(d.name ?? "").toLowerCase();
    const file = String(d.beFileName ?? "").toLowerCase();
    const exact = file === lc;
    const fileContains = file.includes(lc);
    const nameContains = name.includes(lc);
    if (exact || fileContains || nameContains) {
      const _score = exact ? 100 : fileContains ? 80 : 60;
      items.push({
        id: doc.id,
        name: d.name ?? null,
        beFileName: d.beFileName ?? null,
        effectiveDate: d.effectiveDate ?? null,
        version: d.version ?? null,
        _score,
      });
    }
  });

  return {
    ok: true,
    results: items
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ _score, ...r }) => r),
  };
}

export async function tool_diffPoliciesByFileName({ oldFile, newFile }) {
  const [oldSnap, newSnap] = await Promise.all([
    firestore.collection("policies").where("beFileName", "==", oldFile).limit(1).get(),
    firestore.collection("policies").where("beFileName", "==", newFile).limit(1).get(),
  ]);

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
      effectiveDate: oldDoc.data().effectiveDate ?? null,
    },
    next: {
      id: newDoc.id,
      beFileName: newFile,
      version: newDoc.data().version ?? null,
      effectiveDate: newDoc.data().effectiveDate ?? null,
    },
  };
}

export async function tool_diffPolicies({ oldPolicyId, newPolicyId }) {
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
    next: { id: newPolicyId, version: newSnap.data().version ?? null },
  };
}

export async function tool_whoIsAffected({ policyId, beFileName, limit = 1 }) {
  try {
    let resolvedPolicyId = policyId;
    if (!resolvedPolicyId && beFileName) {
      const rs = await firestore
        .collection("policies")
        .where("beFileName", "==", beFileName)
        .limit(1)
        .get();
      if (rs.empty) return { ok: false, error: `Policy not found for beFileName ${beFileName}` };
      resolvedPolicyId = rs.docs[0].id;
    }

    if (!resolvedPolicyId) return { ok: false, error: "policyId or beFileName required" };

    const col = firestore.collection("policies").doc(resolvedPolicyId).collection("impacts");

    // Try simple fetch (no orderBy) first (works whether createdAt exists or not)
    const base = await col.limit(limit).get();
    if (!base.empty) {
      const items = base.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const A = a.createdAt?._seconds ?? (new Date(a.createdAt).getTime() / 1000) ?? 0;
          const B = b.createdAt?._seconds ?? (new Date(b.createdAt).getTime() / 1000) ?? 0;
          return B - A;
        })
        .slice(0, limit);
      return { ok: true, policyId: resolvedPolicyId, reports: items };
    }

    // Fallback with orderBy if field exists
    let snap;
    try {
      snap = await col.orderBy("createdAt", "desc").limit(limit).get();
    } catch (e) {
      return {
        ok: false,
        error: `Query failed (orderBy createdAt): ${e.message || e}`,
        debug: { policyId: resolvedPolicyId },
      };
    }

    if (snap.empty) {
      const exists = !(await col.limit(1).get()).empty;
      return {
        ok: false,
        error: `No impact reports for policy ${resolvedPolicyId}`,
        debug: { policyId: resolvedPolicyId, subcollection: "impacts", subcollectionHasAnyDocs: exists },
      };
    }

    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { ok: true, policyId: resolvedPolicyId, reports: items };
  } catch (err) {
    return { ok: false, error: err.message || String(err), debug: { policyId, beFileName } };
  }
}

/* ---------------------------------- users --------------------------------- */

export async function tool_getUserProfile({ userId }) {
  if (!userId) return { ok: false, error: "userId required" };

  const snap = await firestore.collection("users").doc(userId).get();
  if (!snap.exists) return { ok: false, error: `User not found: ${userId}` };

  const d = snap.data();
  const illnesses = d?.ilnesses || d?.illnesses || [];
  const meds = new Set();
  illnesses.forEach((i) => (i?.medications || []).forEach((m) => m && meds.add(normalizeMedName(m))));

  const insuredRefs = (d.insuredAt || []).map(String);
  const insured = await Promise.all(
    insuredRefs.map(async (path) => {
      const id = path.startsWith("policies/") ? path.split("/")[1] : path;
      const doc = await firestore.collection("policies").doc(id).get();
      if (!doc.exists) return { id, beFileName: null };
      const pd = doc.data();
      return {
        id,
        beFileName: pd.beFileName ?? null,
        version: pd.version ?? null,
        effectiveDate: pd.effectiveDate ?? null,
      };
    })
  );

  return {
    ok: true,
    user: { id: userId, name: d.name ?? null, email: d.email ?? null, role: d.role ?? "patient" },
    medications: Array.from(meds),
    insuredAtRefs: insuredRefs,
    insuredAt: insured,
  };
}

/* ----------------------- “for ME” helpers & tools ------------------------ */

async function _loadCurrentUser(context) {
  const { userId } = context || {};
  if (!userId) return { ok: false, error: "Missing userId in context" };

  const snap = await firestore.collection("users").doc(userId).get();
  if (!snap.exists) return { ok: false, error: `User not found: ${userId}` };

  const d = snap.data();
  const illnesses = d?.ilnesses || d?.illnesses || [];
  const meds = new Set();
  illnesses.forEach((i) => (i?.medications || []).forEach((m) => m && meds.add(normalizeMedName(m))));

  return {
    ok: true,
    user: { id: userId, name: d.name ?? null, email: d.email ?? null, role: d.role ?? "patient" },
    medications: Array.from(meds),
    insuredAt: (d.insuredAt || []).map(String),
  };
}

export async function tool_getMyProfile(_args, context) {
  return _loadCurrentUser(context);
}

/* --------------- Coverage-based recommendation (no prices) --------------- */

function isCovered(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.type === "covered") return true;
  if (entry.type === "percent") return Number(entry.percent || 0) > 0;
  return false;
}

function coveragePercent(entry) {
  if (!entry || typeof entry !== "object") return 0;
  if (entry.type === "covered") return 100;
  if (entry.type === "percent") return Number(entry.percent || 0);
  return 0;
}

async function _fetchPoliciesByFiles(candidateFiles) {
  if (Array.isArray(candidateFiles) && candidateFiles.length > 0) {
    const out = [];
    for (const file of candidateFiles) {
      const snap = await firestore
        .collection("policies")
        .where("beFileName", "==", file)
        .limit(1)
        .get();
      if (!snap.empty) out.push(snap.docs[0]);
    }
    return out;
  }
  const snap = await firestore.collection("policies").limit(500).get();
  return snap.docs;
}

export async function tool_bestPolicyByCoverage(
  { medications, userId, candidateFiles = [], topK = 5, preferLatest = true },
  context
) {
  try {
    // Resolve medications priority: explicit > userId > context.userId
    let meds = Array.isArray(medications) && medications.length > 0 ? medications : null;
    const uid = userId || context?.userId || null;

    if (!meds) {
      if (!uid) return { ok: false, error: "medications or userId (or context.userId) required" };
      const prof = await tool_getUserProfile({ userId: uid });
      if (!prof.ok) return prof;
      meds = prof.medications;
      if (!Array.isArray(meds) || meds.length === 0)
        return { ok: false, error: `No medications found for user ${uid}` };
    }

    const normMeds = meds.map(normalizeMedName);

    const docs = await _fetchPoliciesByFiles(candidateFiles);
    if (!docs || docs.length === 0) return { ok: false, error: "No policies found to evaluate" };

    const scored = [];
    for (const d of docs) {
      const pdata = d.data();
      const rawMap = getCoverageMapFromDocData(pdata);
      const cov = Object.fromEntries(Object.entries(rawMap).map(([k, v]) => [normalizeMedName(k), v]));

      const breakdown = [];
      let coveredCount = 0;
      let fullCoverageCount = 0;
      let percentSum = 0;

      for (const med of normMeds) {
        const entry = cov[med] || null;
        const covered = isCovered(entry);
        const pct = coveragePercent(entry);
        if (covered) coveredCount += 1;
        if (pct >= 100) fullCoverageCount += 1;
        percentSum += pct;
        breakdown.push({ medication: med, covered, percent: pct, coverage: entry || { type: "not_covered" } });
      }

      const total = normMeds.length;
      const coverageRate = total > 0 ? coveredCount / total : 0;
      const avgPercent = total > 0 ? percentSum / total : 0;

      scored.push({
        policy: {
          id: d.id,
          beFileName: pdata.beFileName ?? null,
          name: pdata.name ?? null,
          version: pdata.version ?? null,
          effectiveDate: pdata.effectiveDate ?? null,
        },
        score: { coveredCount, totalMeds: total, coverageRate, fullCoverageCount, avgPercent },
        breakdown,
      });
    }

    // Sort by: coveredCount desc, then avgPercent desc, then fullCoverageCount desc,
    // then (optionally) latest effectiveDate, then version desc
    scored.sort((a, b) => {
      if (b.score.coveredCount !== a.score.coveredCount) return b.score.coveredCount - a.score.coveredCount;
      if (b.score.avgPercent !== a.score.avgPercent) return b.score.avgPercent - a.score.avgPercent;
      if (b.score.fullCoverageCount !== a.score.fullCoverageCount)
        return b.score.fullCoverageCount - a.score.fullCoverageCount;

      if (preferLatest) {
        const ad = a.policy.effectiveDate || "";
        const bd = b.policy.effectiveDate || "";
        if (ad !== bd) return bd.localeCompare(ad); // newer first
        const av = Number(a.policy.version ?? 0);
        const bv = Number(b.policy.version ?? 0);
        if (av !== bv) return bv - av;
      }
      return String(a.policy.beFileName || "").localeCompare(String(b.policy.beFileName || ""));
    });

    return {
      ok: true,
      medications: normMeds,
      policiesEvaluated: scored.length,
      ranking: scored.slice(0, Math.max(1, Number(topK) || 5)),
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export async function tool_bestPolicyForMeByCoverage(
  { candidateFiles = [], topK = 5, preferLatest = true, userId },
  context
) {
  const uid = userId || context?.userId;
  if (!uid) return { ok: false, error: "Missing userId in context" };
  return tool_bestPolicyByCoverage({ userId: uid, candidateFiles, topK, preferLatest }, context);
}

/* --------------- Compute with user-provided prices (no DB) ---------------- */

function _applyCoverageForPrice(entry, unitPrice) {
  if (!entry || typeof entry !== "object" || entry.type === "not_covered") {
    return { rule: "not_covered", patientCost: Number(unitPrice) };
  }
  if (entry.type === "covered") {
    const copay = Number(entry.copay || 0);
    return { rule: "covered", patientCost: copay };
  }
  if (entry.type === "percent") {
    const pct = Number(entry.percent || 0);
    const copay = Number(entry.copay || 0);
    const coins = Math.max(0, (1 - pct / 100) * Number(unitPrice));
    return { rule: `percent_${pct}`, patientCost: Number((coins + copay).toFixed(2)) };
  }
  return { rule: "not_covered", patientCost: Number(unitPrice) };
}

async function _resolvePolicy({ beFileName, policyId, policyName }) {
  const col = firestore.collection("policies");

  const clean = (s) => String(s || "").trim().replace(/[?,;:]+$/g, "");

  if (policyId) {
    const snap = await col.doc(policyId).get();
    if (snap.exists) return { id: snap.id, data: snap.data() };
  }

  if (beFileName) {
    beFileName = clean(beFileName);
    const q = await col.where("beFileName", "==", beFileName).limit(1).get();
    if (!q.empty) return { id: q.docs[0].id, data: q.docs[0].data() };
  }

  if (policyName) {
    policyName = clean(policyName);
    const q = await col.where("name", "==", policyName).limit(1).get();
    if (!q.empty) return { id: q.docs[0].id, data: q.docs[0].data() };

    const all = await col.limit(500).get();
    const lc = policyName.toLowerCase();
    for (const d of all.docs) {
      const name = String(d.data().name || "").toLowerCase();
      if (name === lc || name.includes(lc)) return { id: d.id, data: d.data() };
    }
  }

  return null;
}

function baseMedKey(s) {
  const str = String(s || "").toLowerCase().trim();
  const noParens = str.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const noStrength = noParens.replace(/\b\d+(\.\d+)?\s*(mcg|mg|g|ml|iu)\b/g, "").replace(/\s+/g, " ").trim();
  return noStrength;
}

function buildCoverageIndex(rawMap) {
  const byExact = new Map();
  const byBase  = new Map();
  const keys    = [];

  for (const [k, v] of Object.entries(rawMap)) {
    const norm = normalizeMedName(k);
    const base = baseMedKey(norm);

    if (!byExact.has(norm)) byExact.set(norm, v);
    if (base && !byBase.has(base)) byBase.set(base, v);
    keys.push(norm);
  }

  return { byExact, byBase, keys };
}

function resolveCoverageForMed(med, index) {
  const norm = normalizeMedName(med);
  const base = baseMedKey(norm);

  if (index.byExact.has(norm)) return index.byExact.get(norm);
  if (base && index.byBase.has(base)) return index.byBase.get(base);

  const pref = index.keys.find(k => k.startsWith(norm) || norm.startsWith(k));
  if (pref) return index.byExact.get(pref);

  const cont = index.keys.find(k => k.includes(norm) || norm.includes(k));
  if (cont) return index.byExact.get(cont);

  return null;
}


export async function tool_computeCostWithProvidedPrices({ beFileName, policyId, policyName, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "items required: [{ medication, price }]" };
  }

  const resolved = await _resolvePolicy({ beFileName, policyId, policyName });
  if (!resolved) return { ok: false, error: "Policy not found via beFileName/policyId/policyName" };

  const pdata = resolved.data;
  const rawMap = getCoverageMapFromDocData(pdata);
  const index = buildCoverageIndex(rawMap);

  const lineItems = [];
  let total = 0;

  for (const it of items) {
    const medLabel = it.medication;
    const price = Number(it.price);
    if (!medLabel || Number.isNaN(price)) {
      lineItems.push({ medication: medLabel, inputPrice: it.price, error: "missing/invalid medication or price" });
      continue;
    }

    const entry = resolveCoverageForMed(medLabel, index);
    const { rule, patientCost } = _applyCoverageForPrice(entry, price);
    total += patientCost;

    lineItems.push({
      medication: normalizeMedName(medLabel),
      inputPrice: price,
      coverage: entry || { type: "not_covered" },
      rule,
      patientCost: Number(patientCost.toFixed(2)),
    });
  }

  return {
    ok: true,
    policy: {
      id: resolved.id,
      beFileName: pdata.beFileName ?? null,
      name: pdata.name ?? null,
      version: pdata.version ?? null,
      effectiveDate: pdata.effectiveDate ?? null,
    },
    items: lineItems,
    totalPatientCost: Number(total.toFixed(2)),
  };
}

