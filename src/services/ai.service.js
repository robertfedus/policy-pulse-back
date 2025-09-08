// src/services/ai.service.js
import OpenAI from 'openai';
import path from 'node:path';
import * as Diff from 'diff';                // robust for CJS
import { promises as fs } from 'node:fs';
import { storage } from '../config/firebase.js';

const { diffWords } = Diff;

// -------- OpenAI client (keep key in .env) --------
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------- Storage helpers --------
function getBucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET; // e.g. "your-project.appspot.com"
  return name ? storage.bucket(name) : storage.bucket();
}

async function downloadFromBucket(beFileName) {
  const file = getBucket().file(beFileName);
  const [buffer] = await file.download();
  return buffer;
}

// -------- Text extraction (PDF / DOCX / TXT) --------
const pdfParse = async (buffer) =>
  (await import('pdf-parse')).then(m => m.default(buffer));

const mammothExtract = async (buffer) =>
  (await import('mammoth')).then(m => m.extractRawText({ buffer }));

function isPdf(filename = '')  { return path.extname(filename).toLowerCase() === '.pdf'; }
function isDocx(filename = '') { return path.extname(filename).toLowerCase() === '.docx'; }

async function extractText(filename, buffer) {
  try {
    if (isPdf(filename))  { const r = await pdfParse(buffer);       return (r.text  || '').trim(); }
    if (isDocx(filename)) { const r = await mammothExtract(buffer); return (r.value || '').trim(); }
    return buffer.toString('utf8').trim(); // fallback: plaintext
  } catch {
    return buffer.toString('utf8').trim();
  }
}

function normalize(s = '') {
  return s
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// -------- Diff to HTML (red = removed in old, green = added in new) --------
function makeDiffHtml(oldText, newText) {
  const parts = diffWords(oldText || '', newText || '');
  const oldChunks = [];
  const newChunks = [];
  const preview = [];

  for (const p of parts) {
    if (p.removed) {
      oldChunks.push(`<span class="diff-del">${escapeHtml(p.value)}</span>`);
      preview.push(`- ${collapse(p.value)}`);
    } else if (p.added) {
      newChunks.push(`<span class="diff-add">${escapeHtml(p.value)}</span>`);
      preview.push(`+ ${collapse(p.value)}`);
    } else {
      const safe = escapeHtml(p.value);
      oldChunks.push(safe);
      newChunks.push(safe);
    }
  }

  const style = `
  <style>
    .diff-del { background:#ffe6e6; color:#9c1c1c; text-decoration:line-through; }
    .diff-add { background:#e6ffe9; color:#196c2e; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height:1.5; white-space:pre-wrap; }
  </style>`;

  return {
    oldHtml: style + `<div>${oldChunks.join('')}</div>`,
    newHtml: style + `<div>${newChunks.join('')}</div>`,
    changePreviewText: preview.slice(0, 200).join('\n')
  };
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
function collapse(s = '') {
  const oneline = s.replace(/\s+/g, ' ').trim();
  return oneline.length > 160 ? oneline.slice(0, 157) + '…' : oneline;
}

// -------- Public text helpers (these fix your error) --------
export async function extractTextFromPath(filePath) {
  const buffer = await fs.readFile(filePath);
  return extractText(path.basename(filePath), buffer);
}

export async function extractTextFromBuffer(filename, buffer) {
  return extractText(filename, buffer);
}

// -------- LLM summary (with safe fallback) --------
function fallbackSummary({ policyName, changePreviewText }) {
  const lines = (changePreviewText || '').split('\n').slice(0, 12).join('\n');
  return [
    `Automated summary for "${policyName || 'Policy'}" (LLM unavailable):`,
    '- Changes detected (first lines):',
    lines || '(no diff snippets found)'
  ].join('\n');
}

async function summarizeDiff({ policyName, oldText, newText, changePreviewText }) {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackSummary({ policyName, changePreviewText });
  }
  const maxChars = 40_000;
  const trim = (x) => (x || '').slice(0, maxChars);

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You compare insurance policy documents and produce a concise, accurate change summary. ' +
            'Organize by: Coverage, Exclusions, Limits, Premiums, Deductibles, Waiting periods, Administrative terms, Definitions. ' +
            'Call out breaking/risky changes explicitly. Avoid legalese.'
        },
        {
          role: 'user',
          content:
`POLICY: ${policyName || '(unknown)'}
Change snippets:
${changePreviewText || '(none)'}

OLD:
${trim(oldText)}

NEW:
${trim(newText)}

TASK:
1) Bullet summary of changes.
2) Highlight breaking/risky changes.
3) State uncertainties if any.`
        }
      ]
    });
    return res.choices?.[0]?.message?.content?.trim()
        || fallbackSummary({ policyName, changePreviewText });
  } catch {
    return fallbackSummary({ policyName, changePreviewText });
  }
}

// -------- Public compare helpers --------
export async function compareBuffers({ oldName, oldBuffer, newName, newBuffer, policyName }) {
  const oldText = normalize(await extractText(oldName, oldBuffer));
  const newText = normalize(await extractText(newName, newBuffer));
  const { oldHtml, newHtml, changePreviewText } = makeDiffHtml(oldText, newText);
  const summary = await summarizeDiff({ policyName, oldText, newText, changePreviewText });
  return { summary, oldHtml, newHtml };
}

export async function compareByBeFileNames({ oldBeFileName, newBeFileName, policyName }) {
  const oldBuffer = await downloadFromBucket(oldBeFileName);
  const newBuffer = await downloadFromBucket(newBeFileName);
  return compareBuffers({
    oldName: oldBeFileName, oldBuffer,
    newName: newBeFileName, newBuffer,
    policyName
  });
}

export async function comparePoliciesByPaths({ oldPath, newPath, policyName }) {
  const oldBuffer = await fs.readFile(oldPath);
  const newBuffer = await fs.readFile(newPath);
  return compareBuffers({
    oldName: path.basename(oldPath), oldBuffer,
    newName: path.basename(newPath), newBuffer,
    policyName
  });
}

// -------- Ingestion: extract fields from a single policy text --------
function guessFromFilename(filename = '') {
  const base = path.basename(filename, path.extname(filename));
  const mV = base.match(/[_-]v(\d+)\b/i);                  // e.g., *_v2
  const version = mV ? Number(mV[1]) : undefined;
  const mD = base.match(/\b(20\d{2}-\d{2}-\d{2})\b/);      // e.g., 2025-10-01
  const effectiveDate = mD ? mD[1] : undefined;
  const nameGuess = base
    .replace(/[_-]v\d+\b/i, '')
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return { version, effectiveDate, nameGuess };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

export async function extractPolicyFields({ filename, text, hints = {} }) {
  const { version: vGuess, effectiveDate: dGuess, nameGuess } = guessFromFilename(filename || '');
  const seed = {
    name: hints.name || nameGuess || null,
    version: hints.version ?? vGuess ?? null,
    effectiveDate: hints.effectiveDate || dGuess || null,
    beFileName: hints.beFileName || filename || null,
    insuranceCompanyRef: hints.insuranceCompanyRef || null,
  };

  if (!process.env.OPENAI_API_KEY) {
    return { ...seed, summary: null, coverage_map: {} };
  }

  const maxChars = 30_000;
  const sample = (text || '').slice(0, maxChars);

  const sys =
    'You are an assistant that extracts structured data from insurance policy PDFs. ' +
    'Return a SINGLE JSON object only. Keys: ' +
    'name (string), summary (string), effectiveDate (YYYY-MM-DD string or null), ' +
    'version (number), coverage_map (object of { item: { type: "covered"|"not_covered"|"percent", percent?: number, copay?: number } }). ' +
    'Keep it concise. Do NOT include extra commentary.';

  const user =
`FILENAME: ${filename}
HINTS (optional): ${JSON.stringify(seed)}

TEXT (truncated):
${sample}

RETURN: Strict JSON with keys: name, summary, effectiveDate, version, coverage_map`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    response_format: { type: 'json_object' }
  });

  const raw = res.choices?.[0]?.message?.content || '{}';
  const parsed = safeJsonParse(raw) || {};
  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : seed.name,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : null,
    effectiveDate: typeof parsed.effectiveDate === 'string' ? parsed.effectiveDate : seed.effectiveDate,
    version: Number.isFinite(Number(parsed.version)) ? Number(parsed.version) : (seed.version ?? 1),
    coverage_map: parsed.coverage_map && typeof parsed.coverage_map === 'object' ? parsed.coverage_map : {},
    beFileName: seed.beFileName,
    insuranceCompanyRef: seed.insuranceCompanyRef
  };
}
