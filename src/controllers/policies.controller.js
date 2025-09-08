// src/controllers/policies.controller.js
import path from 'node:path';
import { promises as fs } from 'node:fs';
import asyncHandler from '../utils/asyncHandler.js';
import { firestore } from '../config/firebase.js';
import * as policiesService from '../services/policies.service.js';
import * as aiService from '../services/ai.service.js';

// Your PDFs live at policy-pulse-back/src/uploads on host,
// which is /usr/src/app/src/uploads inside the container.
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/usr/src/app/src/uploads';

// ---- path helpers ----
function resolveFilePath(beFileName = '') {
  return path.isAbsolute(beFileName) ? beFileName : path.join(UPLOAD_DIR, beFileName);
}

async function tryReadable(filePath) {
  try { await fs.access(filePath); return filePath; } catch { return null; }
}

// Reusable compare that tries local first, then Storage
async function compareUsingLocalOrBucket({ older, newer, label }) {
  const oldLocal = await tryReadable(resolveFilePath(older.beFileName));
  const newLocal = await tryReadable(resolveFilePath(newer.beFileName));

  if (oldLocal && newLocal) {
    return aiService.comparePoliciesByPaths({
      oldPath: oldLocal,
      newPath: newLocal,
      policyName: label,
    });
  }

  // Fallback to Firebase Storage
  return aiService.compareByBeFileNames({
    oldBeFileName: older.beFileName,
    newBeFileName: newer.beFileName,
    policyName: label,
  });
}

/**
 * Basic CRUD
 */
export const listPolicies = asyncHandler(async (_req, res) => {
  const data = await policiesService.listPolicies();
  res.json({ data });
});

export const createPolicies = asyncHandler(async (req, res) => {
  const created = await policiesService.createPolicies(req.body);
  res.status(201).json({ data: created });
});

export const getPolicyById = asyncHandler(async (req, res) => {
  const doc = await policiesService.getPolicyById(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Policy not found' });
  res.json({ data: doc });
});

export const updatePolicy = asyncHandler(async (req, res) => {
  const updated = await policiesService.updatePolicy(req.params.id, req.body);
  res.json({ data: updated });
});

export const deletePolicy = asyncHandler(async (_req, res) => {
  res.status(204).send();
});

// ---- helpers for comparisons (by name + company + version) ----
async function loadPolicyDocById(id) {
  const doc = await firestore.collection('policies').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function findPolicyByNameCompVersion({ name, insuranceCompanyRef, version }) {
  const q = await firestore
    .collection('policies')
    .where('name', '==', name)
    .where('insuranceCompanyRef', '==', insuranceCompanyRef)
    .where('version', '==', Number(version))
    .limit(1)
    .get();
  if (q.empty) return null;
  const d = q.docs[0];
  return { id: d.id, ...d.data() };
}

async function findPreviousVersion({ name, insuranceCompanyRef, baseVersion }) {
  const q = await firestore
    .collection('policies')
    .where('name', '==', name)
    .where('insuranceCompanyRef', '==', insuranceCompanyRef)
    .where('version', '<', Number(baseVersion))
    .orderBy('version', 'desc')
    .limit(1)
    .get();
  if (q.empty) return null;
  const d = q.docs[0];
  return { id: d.id, ...d.data() };
}

// ---- compare by base policy id ----
export const comparePolicyById = asyncHandler(async (req, res) => {
  const base = await loadPolicyDocById(req.params.id);
  if (!base) return res.status(404).json({ error: 'Base policy not found' });

  const { againstPolicyId, againstVersion, strategy = 'prev' } = req.body || {};
  let against = null;

  if (strategy === 'id' && againstPolicyId) {
    against = await loadPolicyDocById(againstPolicyId);
  } else if (strategy === 'version' && againstVersion != null) {
    against = await findPolicyByNameCompVersion({
      name: base.name,
      insuranceCompanyRef: base.insuranceCompanyRef,
      version: Number(againstVersion),
    });
  } else {
    against = await findPreviousVersion({
      name: base.name,
      insuranceCompanyRef: base.insuranceCompanyRef,
      baseVersion: base.version ?? 1,
    });
  }

  if (!against) {
    return res.status(404).json({ error: 'No counterpart policy found to compare against' });
  }

  const older = (against.version ?? 0) <= (base.version ?? 0) ? against : base;
  const newer = older.id === against.id ? base : against;

  if (!older.beFileName || !newer.beFileName) {
    return res.status(400).json({ error: 'Both policies must have beFileName set' });
  }

  const label = `${base.name} (v${older.version}→v${newer.version})`;
  const { summary, oldHtml, newHtml } = await compareUsingLocalOrBucket({ older, newer, label });

  res.status(201).json({
    data: {
      summary,
      oldHtml,
      newHtml,
      base: { id: base.id, version: base.version, beFileName: base.beFileName },
      against: { id: against.id, version: against.version, beFileName: against.beFileName },
    },
  });
});

// ---- compare by name+company (+versions) ----
export const comparePolicyByQuery = asyncHandler(async (req, res) => {
  const { name, insuranceCompanyRef, baseVersion, againstVersion } = req.body || {};
  if (!name || !insuranceCompanyRef || !baseVersion) {
    return res.status(400).json({ error: 'name, insuranceCompanyRef, baseVersion are required' });
  }

  const base = await findPolicyByNameCompVersion({
    name,
    insuranceCompanyRef,
    version: Number(baseVersion),
  });
  if (!base) return res.status(404).json({ error: 'Base policy not found' });

  let against = null;
  if (againstVersion != null) {
    against = await findPolicyByNameCompVersion({
      name,
      insuranceCompanyRef,
      version: Number(againstVersion),
    });
  } else {
    against = await findPreviousVersion({
      name,
      insuranceCompanyRef,
      baseVersion: Number(baseVersion),
    });
  }
  if (!against) return res.status(404).json({ error: 'No counterpart policy found to compare against' });

  const older = (against.version ?? 0) <= (base.version ?? 0) ? against : base;
  const newer = older.id === against.id ? base : against;

  if (!older.beFileName || !newer.beFileName) {
    return res.status(400).json({ error: 'Both policies must have beFileName set' });
  }

  const label = `${name} (v${older.version}→v${newer.version})`;
  const { summary, oldHtml, newHtml } = await compareUsingLocalOrBucket({ older, newer, label });

  res.status(201).json({
    data: {
      summary,
      oldHtml,
      newHtml,
      base: { id: base.id, version: base.version, beFileName: base.beFileName },
      against: { id: against.id, version: against.version, beFileName: against.beFileName },
    },
  });
});

// ---- NEW: compare two local files directly (no Firestore) ----
export const compareLocalFiles = asyncHandler(async (req, res) => {
  const { oldFile, newFile, policyName } = req.body || {};
  if (!oldFile || !newFile) {
    return res.status(400).json({ error: 'oldFile and newFile are required' });
  }

  const oldPath = path.isAbsolute(oldFile) ? oldFile : path.join(UPLOAD_DIR, oldFile);
  const newPath = path.isAbsolute(newFile) ? newFile : path.join(UPLOAD_DIR, newFile);

  await fs.access(oldPath);
  await fs.access(newPath);

  const { summary, oldHtml, newHtml } = await aiService.comparePoliciesByPaths({
    oldPath,
    newPath,
    policyName: policyName || `${path.basename(oldPath)} → ${path.basename(newPath)}`,
  });

  res.status(201).json({ data: { summary, oldHtml, newHtml } });
});

// ---- NEW: ingest a single LOCAL file -> extract fields -> upsert Firestore ----
export const ingestPolicyFromFile = asyncHandler(async (req, res) => {
  const { file, insuranceCompanyRef, name, version, effectiveDate } = req.body || {};
  if (!file || !insuranceCompanyRef) {
    return res.status(400).json({ error: 'file and insuranceCompanyRef are required' });
  }

  const absPath = path.isAbsolute(file) ? file : path.join(UPLOAD_DIR, file);
  await fs.access(absPath);

  const text = await aiService.extractTextFromPath(absPath);
  const beFileName = path.basename(absPath);

  const extracted = await aiService.extractPolicyFields({
    filename: beFileName,
    text,
    hints: { name, version, effectiveDate, beFileName, insuranceCompanyRef }
  });

  const doc = {
    name: extracted.name || name || beFileName,
    summary: extracted.summary || '',
    beFileName,
    effectiveDate: extracted.effectiveDate || effectiveDate || null,
    version: extracted.version || Number(version) || 1,
    coverage_map: extracted.coverage_map || {},
    insuranceCompanyRef,
  };

  // Upsert by (name + insuranceCompanyRef + version)
  const existing = await policiesService.findByNameCompanyVersion({
    name: doc.name,
    insuranceCompanyRef: doc.insuranceCompanyRef,
    version: doc.version
  });

  let out, operation;
  if (existing) {
    out = await policiesService.updatePolicy(existing.id, doc);
    operation = 'updated';
  } else {
    out = await policiesService.createPolicies(doc);
    operation = 'created';
  }

  res.status(201).json({ operation, data: out });
});
