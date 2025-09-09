import { normalizeMedName }  from "./coverage.js";

export function flattenUserMeds(userDoc) {
  const illnesses = userDoc?.ilnesses || userDoc?.illnesses || [];
  const set = new Set();
  illnesses.forEach(i => (i?.medications || []).forEach(m => {
    if (m && typeof m === "string") set.add(normalizeMedName(m));
  }));
  return Array.from(set);
}


