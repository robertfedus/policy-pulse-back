export function normalizeMedName(name) {
  return String(name || "").trim().toLowerCase();
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return { type: "not_covered" };
  const type = entry.type || "not_covered";
  const percent = typeof entry.percent === "number" ? entry.percent : null;
  const copay = typeof entry.copay === "number" ? entry.copay : null;
  return { type, percent, copay };
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

export function diffCoverageMaps(oldMap = {}, newMap = {}) {
  const changed = new Set();
  const details = {};

  Object.keys(oldMap).forEach((raw) => {
    const med = normalizeMedName(raw);
    const was = oldMap[raw];
    const now = newMap[raw] ?? newMap[med];
    if (now === undefined) {
      changed.add(med);
      details[med] = { old: was, next: null };
    } else if (coverageChanged(was, now)) {
      changed.add(med);
      details[med] = { old: was, next: now };
    }
  });

  Object.keys(newMap).forEach((raw) => {
    const med = normalizeMedName(raw);
    const now = newMap[raw];
    const was = oldMap[raw] ?? oldMap[med];
    if (was === undefined) {
      changed.add(med);
      details[med] = { old: null, next: now };
    }
  });

  return { changedMeds: Array.from(changed), details };
}

