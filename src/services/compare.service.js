// src/services/compare.service.js
import { diffLines, createTwoFilesPatch } from "diff";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// Heuristic helpers
function squashSpaces(s) {
  return s.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ");
}
function normalize(txt = "") {
  // keep line breaks; just tidy them
  return String(txt)
    .split("\n")
    .map(l => squashSpaces(l).replace(/[ \t]+$/g, "")) // trim right
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build stable, line-broken text from a PDF page.
 * - Sort by Y (descending), then X (ascending)
 * - New line when Y jumps more than yTol OR item.hasEOL
 */
function pageItemsToText(items, { yTol = 2.0 } = {}) {
  // Map items to x/y
  const mapped = items
    .map(it => {
      const t = it.transform || [1, 0, 0, 1, 0, 0];
      return {
        str: it.str || "",
        x: t[4] || 0,
        y: t[5] || 0,
        hasEOL: !!it.hasEOL,
      };
    })
    .filter(it => it.str && it.str.trim().length);

  // Stable order
  mapped.sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  let curY = null;
  let buf = [];

  const flush = () => {
    if (!buf.length) return;
    // Ensure left-to-right within the line
    buf.sort((a, b) => a.x - b.x);
    lines.push(squashSpaces(buf.map(t => t.str).join(" ")).trim());
    buf = [];
  };

  for (const it of mapped) {
    if (curY === null) {
      curY = it.y;
      buf.push(it);
      if (it.hasEOL) { flush(); curY = null; }
      continue;
    }

    const sameLine = Math.abs(it.y - curY) <= yTol;
    if (!sameLine) {
      flush();
      curY = it.y;
      buf.push(it);
    } else {
      buf.push(it);
    }

    if (it.hasEOL) {
      flush();
      curY = null;
    }
  }
  flush();

  // Remove accidental empty lines in a row
  return lines.filter(l => l.length).join("\n");
}

async function extractTextFromBuffer(buf) {
  const data = new Uint8Array(buf);
  const pdf = await pdfjs.getDocument({ data }).promise;

  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ normalizeWhitespace: true });
    const pageText = pageItemsToText(content.items);
    out += (p > 1 ? "\n" : "") + `\n<<< Page ${p} >>>\n` + pageText;
  }
  return normalize(out);
}

/** JSON diff (unchanged) + fallback if "everything changed" */
export async function comparePdfTexts(oldBuffer, newBuffer) {
  const [oldTxt, newTxt] = await Promise.all([
    extractTextFromBuffer(oldBuffer),
    extractTextFromBuffer(newBuffer),
  ]);

  let parts = diffLines(oldTxt, newTxt);

  // If there are no "equal" segments, try a gentler alignment pass on words.
  if (parts.every(p => p.added || p.removed)) {
    const { diffWords } = await import("diff");
    parts = diffWords(oldTxt, newTxt).map(p => {
      // Repackage into the same shape you already return
      return {
        added: !!p.added,
        removed: !!p.removed,
        value: p.value,
      };
    });
  }

  return {
    summary: {
      added: parts.filter(p => p.added).length,
      removed: parts.filter(p => p.removed).length,
      totalSegments: parts.length,
    },
    diff: parts.map(p => ({
      type: p.added ? "added" : p.removed ? "removed" : "equal",
      text: p.value,
    })),
    _internal: { oldTxt: oldTxt, newTxt: newTxt },
  };
}

/** Unified diff (git-style) — unchanged interface */
export async function comparePdfUnified(oldBuffer, newBuffer, opts = {}) {
  const { oldName = "MockPolicy_HealthyCare_Basic_v1.pdf", newName = "MockPolicy_HealthyCare_Basic_v2.pdf", context = 3 } = opts;
  const [oldTxt, newTxt] = await Promise.all([
    extractTextFromBuffer(oldBuffer),
    extractTextFromBuffer(newBuffer),
  ]);
  const patch = createTwoFilesPatch(oldName, newName, oldTxt, newTxt, "", "", { context });
  return { patch, oldLength: oldTxt.length, newLength: newTxt.length };
}

/** Inline view — now benefits from the stabler lines */
export async function comparePdfInline(oldBuffer, newBuffer, opts = {}) {
  const { maxEqualChunkLines = 6 } = opts;
  const [oldTxt, newTxt] = await Promise.all([
    extractTextFromBuffer(oldBuffer),
    extractTextFromBuffer(newBuffer),
  ]);
  const parts = diffLines(oldTxt, newTxt);
  const lines = [];
  for (const part of parts) {
    const prefix = part.added ? "+" : part.removed ? "-" : " ";
    const block = part.value.split("\n");
    if (!part.added && !part.removed && block.length > maxEqualChunkLines) {
      lines.push(" … … (unchanged block collapsed) … … ");
    } else {
      for (const l of block) {
        if (l === "" && prefix !== " ") continue;
        lines.push(`${prefix} ${l}`);
      }
    }
  }
  return lines.join("\n");
}
// ------------------------------
// TABLE PARSERS & DIFF
// ------------------------------

function sliceBetween(text, startMarker, endMarker) {
  const s = text.indexOf(startMarker);
  if (s === -1) return "";
  const e = text.indexOf(endMarker, s + startMarker.length);
  return text.slice(s + startMarker.length, e === -1 ? undefined : e).trim();
}

// Robust split by 2+ spaces OR tabs to approximate columns
function splitCols(line) {
  return line.trim().split(/[ \t]{2,}/).map(s => s.trim()).filter(Boolean);
}

// ---- Coverage table ----
// Expected header:
// Medication | Coverage Type | Percent | Copay (USD) | Notes
// Rows examples:
// "paracetamol 500mg | covered"
// "ibuprofen 200mg | percent | 50"
// "paracetamol 500mg | percent | 100 | 2.0"
function parseCoverageTable(block) {
  const lines = block
    .split("\n")
    // drop empty + page markers
    .map(l => l.trim())
    .filter(l => l && !/^<<< Page \d+ >>>$/.test(l));
  
  // Remove the header line (begins with 'Medication' and contains 'Coverage Type')
  const headerIdx = lines.findIndex(l => /Medication/i.test(l) && /Coverage\s*Type/i.test(l));
  const rows = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

  const data = [];
  for (const rawLine of rows) {
    // stop if next section header is reached accidentally
    if (/^Illustrative Out-of-Pocket/i.test(rawLine)) break;

    // Prefer column split; if it fails, fall back to heuristic
    let cols = splitCols(rawLine);

    // If we only got 1 column (because the extractor used single spaces), try a heuristic:
    if (cols.length === 1) {
      const l = rawLine;
      // Look for keywords to break med vs the rest
      const m = l.match(/\b(covered|not_covered|percent)\b/i);
      if (!m) continue;
      const med = l.slice(0, m.index).trim();
      const rest = l.slice(m.index).trim();
      cols = [med].concat(rest.split(/[ \t]+/));
    }

    if (!cols.length) continue;

    // Normalize to fields
    // cols could be:
    // [med, covered]
    // [med, percent, 50]          -> percent 50
    // [med, percent, 100, 2.0]    -> percent 100 + copay 2.0
    // [med, not_covered]
    const med = cols[0];
    let coverageType = cols[1] || "";
    let percent = null;
    let copay = null;
    let notes = null;

    if (/^percent$/i.test(coverageType)) {
      if (cols[2] && /^\d+(\.\d+)?$/.test(cols[2])) {
        percent = Number(cols[2]);
      }
      // Optional copay may appear as a numeric or like "copay 2.0"
      if (cols[3]) {
        if (/^\d+(\.\d+)?$/.test(cols[3])) copay = Number(cols[3]);
        else if (/^copay$/i.test(cols[3]) && cols[4] && /^\d+(\.\d+)?$/.test(cols[4])) {
          copay = Number(cols[4]);
        }
      }
    } else if (/^covered$/i.test(coverageType)) {
      // covered: percent/copay remain null
    } else if (/^not_covered$/i.test(coverageType)) {
      // not_covered
    } else {
      // Sometimes extractor glues more into second col; try to recover:
      // e.g., ["paracetamol 500mg", "percent 100 2.0"]
      const parts = (cols[1] || "").split(/[ \t]+/).filter(Boolean);
      if (parts[0] && /^percent$/i.test(parts[0])) {
        coverageType = "percent";
        if (parts[1] && /^\d+(\.\d+)?$/.test(parts[1])) percent = Number(parts[1]);
        if (parts[2] && /^\d+(\.\d+)?$/.test(parts[2])) copay = Number(parts[2]);
      } else if (parts[0]) {
        coverageType = parts[0];
      }
      // Append remaining cols for copay/notes if any
      for (let i = 2; i < cols.length; i++) {
        if (/^\d+(\.\d+)?$/.test(cols[i]) && copay == null && coverageType.toLowerCase() !== "percent") {
          copay = Number(cols[i]);
        }
      }
    }

    // Notes column (if present) may be trailing
    // Try to detect a trailing notes column in the original split
    if (cols.length >= 5) {
      notes = cols.slice(4).join(" ");
    }

    data.push({
      med,
      coverageType: (coverageType || "").toLowerCase(),
      percent,
      copay,
      notes: notes || undefined,
    });
  }

  return data;
}

// ---- OOP table ----
// Header:
// Medication | Retail Price (USD) | Coverage Rule | Estimated Patient Pays (USD)
// Rows example:
// "paracetamol 500mg | $4.00 | covered | $0.00"
function parseOOPTable(block) {
  const lines = block
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !/^<<< Page \d+ >>>$/.test(l));

  const headerIdx = lines.findIndex(
    l => /Medication/i.test(l) && /Retail Price/i.test(l) && /Coverage Rule/i.test(l)
  );
  const rows = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

  const data = [];
  for (const rawLine of rows) {
    // stop if “Notes” section reached
    if (/^Notes$/i.test(rawLine)) break;

    let cols = splitCols(rawLine);
    if (cols.length < 3) {
      // heuristic fallback: try pipe or single-space splits
      cols = rawLine.split(/\s+\|\s+| \| /g).map(s => s.trim());
    }
    if (cols.length < 3) continue;

    // Normalize money to numbers where safe
    const money = s => {
      const m = (s || "").replace(/[, ]/g, "").match(/\$?(-?\d+(\.\d+)?)/);
      return m ? Number(m[1]) : null;
    };

    const med = cols[0];
    const retail = money(cols[1]);
    const coverageRule = cols[2];
    const patientPays = money(cols[3] || "");

    data.push({
      med,
      retail,
      coverageRule,
      patientPays,
    });
  }

  return data;
}

function indexByMed(rows) {
  const map = new Map();
  for (const r of rows) map.set(r.med.toLowerCase(), r);
  return map;
}

function diffCoverage(oldRows, newRows) {
  const a = indexByMed(oldRows);
  const b = indexByMed(newRows);

  const added = [];
  const removed = [];
  const changed = [];

  // added or changed
  for (const [k, nv] of b) {
    const ov = a.get(k);
    if (!ov) {
      added.push(nv);
    } else {
      const delta = {};
      if (ov.coverageType !== nv.coverageType) delta.coverageType = [ov.coverageType, nv.coverageType];
      if ((ov.percent ?? null) !== (nv.percent ?? null)) delta.percent = [ov.percent ?? null, nv.percent ?? null];
      if ((ov.copay ?? null) !== (nv.copay ?? null)) delta.copay = [ov.copay ?? null, nv.copay ?? null];
      if (Object.keys(delta).length) {
        changed.push({ med: nv.med, changes: delta, old: ov, new: nv });
      }
    }
  }
  // removed
  for (const [k, ov] of a) {
    if (!b.has(k)) removed.push(ov);
  }

  return { added, removed, changed };
}

function diffOOP(oldRows, newRows) {
  const a = indexByMed(oldRows);
  const b = indexByMed(newRows);

  const added = [];
  const removed = [];
  const changed = [];

  for (const [k, nv] of b) {
    const ov = a.get(k);
    if (!ov) {
      added.push(nv);
    } else {
      const delta = {};
      if ((ov.retail ?? null) !== (nv.retail ?? null)) delta.retail = [ov.retail ?? null, nv.retail ?? null];
      if ((ov.coverageRule || "") !== (nv.coverageRule || "")) delta.coverageRule = [ov.coverageRule || "", nv.coverageRule || ""];
      if ((ov.patientPays ?? null) !== (nv.patientPays ?? null)) delta.patientPays = [ov.patientPays ?? null, nv.patientPays ?? null];
      if (Object.keys(delta).length) {
        changed.push({ med: nv.med, changes: delta, old: ov, new: nv });
      }
    }
  }
  for (const [k, ov] of a) {
    if (!b.has(k)) removed.push(ov);
  }
  return { added, removed, changed };
}

// Extract the two table blocks from full doc text
function extractCoverageBlock(fullText) {
  return sliceBetween(
    fullText,
    "Simplified Medication Coverage Map",
    "Illustrative Out-of-Pocket"
  );
}
function extractOOPBlock(fullText) {
  // from "Illustrative..." to "Notes" (exclusive)
  return sliceBetween(
    fullText,
    "Illustrative Out-of-Pocket (OOP) Examples",
    "Notes"
  );
}

export async function comparePdfTables(oldBuffer, newBuffer, { section = "coverage" } = {}) {
  // Reuse your existing extractTextFromBuffer
  const [oldTxt, newTxt] = await Promise.all([
    extractTextFromBuffer(oldBuffer),
    extractTextFromBuffer(newBuffer),
  ]);

  if (section === "coverage") {
    const oldBlock = extractCoverageBlock(oldTxt);
    const newBlock = extractCoverageBlock(newTxt);
    const oldRows = parseCoverageTable(oldBlock);
    const newRows = parseCoverageTable(newBlock);
    const diff = diffCoverage(oldRows, newRows);
    return {
      section: "coverage",
      oldCount: oldRows.length,
      newCount: newRows.length,
      ...diff,
    };
  }

  if (section === "oop") {
    const oldBlock = extractOOPBlock(oldTxt);
    const newBlock = extractOOPBlock(newTxt);
    const oldRows = parseOOPTable(oldBlock);
    const newRows = parseOOPTable(newBlock);
    const diff = diffOOP(oldRows, newRows);
    return {
      section: "oop",
      oldCount: oldRows.length,
      newCount: newRows.length,
      ...diff,
    };
  }

  throw new Error(`Unknown table section: ${section}`);
}

/**
 * Turn table diff into a simplified list with new coverage + new patient price.
 * Requires both coverage diff (like you pasted) and new OOP table parsed.
 */
export function transformCoverageDiffWithPrices(diffCoverage, newOOPRows) {
  const indexOOP = new Map(
    newOOPRows.map(r => [r.med.toLowerCase(), r])
  );

  const out = [];

  // Added
  for (const row of diffCoverage.added) {
    const oop = indexOOP.get(row.med.toLowerCase());
    out.push({
      med: row.med,
      status: "added",
      newCoverage: row.coverageType,
      newPercent: row.percent,
      newCopay: row.copay,
      newPatientPays: oop ? oop.patientPays : null,
    });
  }

  // Changed
  for (const ch of diffCoverage.changed) {
    const oop = indexOOP.get(ch.med.toLowerCase());
    out.push({
      med: ch.med,
      status: "changed",
      changes: ch.changes,
      newCoverage: ch.new.coverageType,
      newPercent: ch.new.percent,
      newCopay: ch.new.copay,
      newPatientPays: oop ? oop.patientPays : null,
    });
  }

  // Removed (optional, but here for completeness)
  for (const row of diffCoverage.removed) {
    out.push({
      med: row.med,
      status: "removed",
    });
  }

  return out;
}

