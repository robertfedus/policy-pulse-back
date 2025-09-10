
import asyncHandler from "../utils/asyncHandler.js";
import { firestore } from "../config/firebase.js";
import * as PolicyService from "../services/policies.service.js";

const USERS = "users"; 
const POLICIES = "policies";

// helper: pull "policies/<id>" -> "<id>"
function extractPolicyId(refLike) {
  if (!refLike) return null;

  // Firestore DocumentReference support (in case it's not a string)
  if (typeof refLike === "object" && refLike.path) {
    const parts = String(refLike.path).split("/");
    return parts[0] === POLICIES && parts[1] ? parts[1] : null;
  }

  // String path "policies/<id>"
  const s = String(refLike);
  const m = s.match(/^policies\/([^/]+)$/);
  return m ? m[1] : null;
}

// helper: decide current policy id
function resolveCurrentPolicyId(user, overrideId) {
  if (overrideId) return overrideId;

  // explicit field on user (if you store it)
  if (user.currentPolicyId) return String(user.currentPolicyId);

  // from insuredAt array (take the last one as "current")
  const arr = Array.isArray(user.insuredAt) ? user.insuredAt : [];
  if (arr.length) {
    const last = arr[arr.length - 1];
    return extractPolicyId(last);
  }
  return null;
}

export const recommendBetterThanCurrent = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const minImprovement = Math.max(0, Number(req.query.minImprovement ?? 0));
  const overrideCurrentId = req.query.currentPolicyId;

  // 1) Load user
  const userRef = firestore.collection(USERS).doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return res.status(404).json({ error: "User not found" });

  const user = userSnap.data() || {};
  if (user.role !== "patient") {
    return res.status(400).json({ error: "User is not a patient" });
  }

  // 2) Collect medications from illnesses
  const illnesses = Array.isArray(user.illnesses) ? user.illnesses : [];
  const medications = illnesses.flatMap(i => Array.isArray(i.medications) ? i.medications : []);

  // 3) Resolve current policy id (override -> currentPolicyId -> insuredAt[last])
  const currentPolicyId = resolveCurrentPolicyId(user, overrideCurrentId);
  if (!currentPolicyId) {
    return res.status(400).json({ error: "Cannot determine current policy id (pass ?currentPolicyId=... or set user.currentPolicyId / user.insuredAt[])" });
  }

  // 4) Load & score current policy
  const curSnap = await firestore.collection(POLICIES).doc(currentPolicyId).get();
  if (!curSnap.exists) return res.status(404).json({ error: "Current policy not found" });
  const currentPolicy = { id: curSnap.id, ...curSnap.data() };
  const currentScore = PolicyService.scorePolicyForMeds(currentPolicy, medications);
  const current = {
    id: currentPolicy.id,
    name: currentPolicy.name,
    insuranceCompanyRef: currentPolicy.insuranceCompanyRef,
    version: Number(currentPolicy.version ?? 0) || 0,
    ...currentScore
  };

  // 5) Compare with latest version of all other policies
  const latest = await PolicyService.getLatestPolicies();
  const better = latest
    .filter(p => p.id !== currentPolicy.id)
    .map(p => {
      const s = PolicyService.scorePolicyForMeds(p, medications);
      const delta = s.score - current.score;
      const pctImprovement = current.score > 0 ? delta / current.score : (s.score > 0 ? 1 : 0);
      return {
        id: p.id,
        name: p.name,
        insuranceCompanyRef: p.insuranceCompanyRef,
        version: p.version,
        beFileName: p.beFileName || null,
        ...s,
        deltaScore: delta,
        pctImprovement
      };
    })
    .filter(x => x.deltaScore > 0 && x.pctImprovement >= minImprovement)
    .sort((a, b) =>
      b.deltaScore - a.deltaScore ||
      b.score - a.score ||
      b.coveredRatio - a.coveredRatio ||
      (a.name || "").localeCompare(b.name || "")
    );

  return res.json({
    userId,
    medications,
    minImprovement,
    resolvedCurrentPolicyId: currentPolicyId,
    current,
    count: better.length,
    betterOptions: better
  });
});