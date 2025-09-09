import { getTwoPoliciesById, writeImpactReport } from "./policies.service.js";
import { getUsersInsuredOnAny, extractUserMeds } from "./users.service.js";
import { diffCoverageMaps, normalizeMedName } from "../utils/coverage.js";

/**
 * Compute affected patients by comparing two policies' coverage_map.
 * Params:
 *  - oldPolicyId (string) : required
 *  - newPolicyId (string) : required
 *  - insuredPolicyId? (string) : optional; if set, only users insured at this policy are considered & the report is indexed here
 *  - persist? (boolean) : default true; write report to Firestore
 */
export async function runAffectedMedsByPolicyIds({ oldPolicyId, newPolicyId, insuredPolicyId, persist = true }) {
  const { oldPolicy, newPolicy } = await getTwoPoliciesById(oldPolicyId, newPolicyId);

  const oldMap = oldPolicy.data.coverage_map || {};
  const newMap = newPolicy.data.coverage_map || {};

  const { changedMeds, details } = diffCoverageMaps(oldMap, newMap);

  if (changedMeds.length === 0) {
    const payload = {
      changedMedications: [],
      affectedCount: 0,
      affectedPatients: [],
      oldPolicy: { id: oldPolicy.id, version: oldPolicy.data.version ?? null },
      newPolicy: { id: newPolicy.id, version: newPolicy.data.version ?? null },
      comparedAt: new Date().toISOString(),
      note: "No coverage changes detected.",
    };
    let runId = null;
    if (persist) runId = await writeImpactReport(insuredPolicyId || newPolicyId, payload);
    return { runId, ...payload };
  }

  const policyPaths = insuredPolicyId
    ? [`policies/${insuredPolicyId}`]
    : [`policies/${oldPolicyId}`, `policies/${newPolicyId}`];

  const candidateDocs = await getUsersInsuredOnAny(policyPaths);

  const changedSet = new Set(changedMeds.map(normalizeMedName));
  const affected = [];

  for (const doc of candidateDocs) {
    const data = doc.data();
    const meds = extractUserMeds(doc);

    const impactedMeds = meds.filter((m) => changedSet.has(m));
    if (impactedMeds.length === 0) continue;

    const medicationsImpacted = impactedMeds.map((m) => {
      const d = details[m] || details[normalizeMedName(m)];
      const oldEntry = d ? d.old : oldMap[m] || oldMap[normalizeMedName(m)] || null;
      const newEntry = d ? d.next : newMap[m] || newMap[normalizeMedName(m)] || null;
      return { medication: m, old: oldEntry || null, next: newEntry || null };
    });

    affected.push({
      uid: doc.id,
      name: data.name,
      email: data.email,
      medicationsImpacted,
    });
  }

  const payload = {
    changedMedications: changedMeds,
    changeDetails: details,
    affectedCount: affected.length,
    affectedPatients: affected,
    oldPolicy: {
      id: oldPolicy.id,
      name: oldPolicy.data.name,
      version: oldPolicy.data.version ?? null,
      beFileName: oldPolicy.data.beFileName,
      effectiveDate: oldPolicy.data.effectiveDate,
    },
    newPolicy: {
      id: newPolicy.id,
      name: newPolicy.data.name,
      version: newPolicy.data.version ?? null,
      beFileName: newPolicy.data.beFileName,
      effectiveDate: newPolicy.data.effectiveDate,
    },
    comparedAt: new Date().toISOString(),
  };

  let runId = null;
  if (persist) runId = await writeImpactReport(insuredPolicyId || newPolicyId, payload);

  return { runId, ...payload };
}

