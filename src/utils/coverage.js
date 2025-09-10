export function normalizeMedName(name) {
  return String(name || "").trim().toLowerCase();
}
 
/** Accepts number, typed object, or null → normalized entry */
function normalizeEntry(entry) {
  // New format: number means percent
  if (typeof entry === "number") {
    return { type: "percent", percent: entry, copay: null };
  }
  // Old format: typed object
  if (entry && typeof entry === "object") {
    const type = entry.type || "not_covered";
    const percent = typeof entry.percent === "number" ? entry.percent : null;
    const copay = typeof entry.copay === "number" ? entry.copay : null;
    return { type, percent, copay };
  }
  // Missing/unknown → not covered
  return { type: "not_covered", percent: null, copay: null };
}
 
/** Convert any coverage_map shape to { [normalizedMed]: normalizedEntry } */
function normalizeCoverageMap(anyMap) {
  const out = {};
 
  if (!anyMap) return out;
 
  // Case A: new array format → [{ "med": number }, ...]
  if (Array.isArray(anyMap)) {
    for (const item of anyMap) {
      if (item && typeof item === "object") {
        for (const [rawMed, val] of Object.entries(item)) {
          const med = normalizeMedName(rawMed);
          out[med] = normalizeEntry(val);
        }
      }
    }
    return out;
  }
 
  // Case B: object with numbers → { "med": 100, ... }
  // or old typed object → { "med": { type, percent, ... }, ... }
  if (typeof anyMap === "object") {
    for (const [rawMed, val] of Object.entries(anyMap)) {
      const med = normalizeMedName(rawMed);
      out[med] = normalizeEntry(val);
    }
    return out;
  }
 
  return out;
}
 
function coverageChanged(a, b) {
  const A = normalizeEntry(a);
  const B = normalizeEntry(b);
  if (A.type !== B.type) return true;
  if (A.type === "percent") {
    if ((A.percent ?? null) !== (B.percent ?? null)) return true;
    if ((A.copay ?? null) !== (B.copay ?? null)) return true;
  }
  return false;
}
 
export function diffCoverageMaps(oldMapRaw = {}, newMapRaw = {}) {
  // Normalize both shapes first
  const oldMap = normalizeCoverageMap(oldMapRaw);
  const newMap = normalizeCoverageMap(newMapRaw);
 
  const changed = new Set();
  const details = {};
 
  // meds present in old map
  Object.keys(oldMap).forEach((med) => {
    const was = oldMap[med];
    const now = newMap[med]; // keys already normalized
    if (now === undefined) {
      changed.add(med);
      details[med] = { old: was, next: null };
    } else if (coverageChanged(was, now)) {
      changed.add(med);
      details[med] = { old: was, next: now };
    }
  });
 
  // meds newly added in new map
  Object.keys(newMap).forEach((med) => {
    const now = newMap[med];
    const was = oldMap[med];
    if (was === undefined) {
      changed.add(med);
      details[med] = { old: null, next: now };
    }
  });
 
  return { changedMeds: Array.from(changed), details };
}