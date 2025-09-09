// src/controllers/policies.controller.js
import path from 'node:path';
import { promises as fs } from 'node:fs';
import asyncHandler from '../utils/asyncHandler.js';
import admin,{ firestore } from '../config/firebase.js';
import * as policiesService from '../services/policies.service.js';
import * as aiService from '../services/ai.service.js';

const BUCKET=process.env.FIREBASE_STORAGE_BUCKET 
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

export const getPoliciesById = asyncHandler(async (req, res) => {
  const policy = await policiesService.getPolicies(req.params.id);
  res.json({ data: policy });
});

export const updatePolicies = asyncHandler(async (req, res) => {
  const updated = await policiesService.updatePolicies(req.params.id, req.body);
  res.json({ data: updated });
});

export const deletePolicies = asyncHandler(async (req, res) => {
  await policiesService.deletePolicies(req.params.id);
  res.status(204).send();
} );

export const getPoliciesByInsuranceCompany = asyncHandler(async (req, res) => {   
  const policies = await policiesService.getPoliciesByInsuranceCompany(req.params.insuranceCompanyId);
  res.json({ data: policies });
});

export const streamPolicyPdf = asyncHandler(async (req, res) => {
  const result = await policiesService.getPolicyPdfStream(req.params.id);
  if (!result.ok) return res.status(404).json(result);

  res.setHeader("Content-Type", result.contentType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

  result.stream.on("error", (err) => {
    console.error("GCS stream error", err);
    if (!res.headersSent) res.status(500).json({ error: "Storage stream failed" });
    else res.destroy(err);
  });

  result.stream.pipe(res);
});

export const policyPdfSignedUrl = asyncHandler(async (req, res) => {
  const result = await policiesService.getPolicySignedUrl(req.params.id);
  if (!result.ok) return res.status(404).json(result);
  res.json(result); // { url, objectName, ttlMinutes }
});


// ---- UNUSED: ingest from bucket (not local) ----
export const ingestPolicyFromBucket = asyncHandler(async (req, res) => {
  const { objectName: rawObject, beFileName: rawFile, insuranceCompanyRef, version, effectiveDate } = req.body || {};

  if (!insuranceCompanyRef) {
    return res.status(400).json({ error: "insuranceCompanyRef is required" });
  }
  if (!rawObject && !rawFile) {
    return res.status(400).json({ error: "Provide either objectName or beFileName" });
  }

  // 1) Resolve bucket object name
  let objectName = (rawObject || "").toString().trim();
  if (!objectName) {
    const base = path.basename((rawFile || "").toString().trim());
    objectName = `${base}`; // your bucket layout
  }
  objectName = objectName.replace(/^\/+/, ""); // strip accidental leading "/"
  const beFileName = path.basename(objectName);

  // 2) Get file from Storage
  const bucket = BUCKET ? admin.storage().bucket(BUCKET) : admin.storage().bucket();
  const file = bucket.file(objectName);

  const [exists] = await file.exists();
  if (!exists) {
    return res.status(404).json({ error: "missing_in_bucket", objectName });
  }

  const [pdfBuffer] = await file.download();

  // 3) Extract text with AI service (IMPORTANT: pass filename + buffer)
  const text = await aiService.extractTextFromBuffer(beFileName, pdfBuffer);

  // 4) Ask AI to lift fields (no "name" in hints—derive from LLM or filename)
  const extracted = await aiService.extractPolicyFields({
    filename: beFileName,
    text,
    hints: { version, effectiveDate, beFileName, insuranceCompanyRef }
  });

  // 5) Build policy doc
  const doc = {
    name: extracted.name || beFileName,
    summary: extracted.summary || "",
    beFileName,
    effectiveDate: extracted.effectiveDate || effectiveDate || null,
    version: Number(extracted.version) || Number(version) || 1,
    coverage_map: extracted.coverage_map || {},
    insuranceCompanyRef,
  };

  // 6) Upsert by (name + company + version)
  const existing = await policiesService.findByNameCompanyVersion({
    name: doc.name,
    insuranceCompanyRef: doc.insuranceCompanyRef,
    version: doc.version
  });

  let out, operation;
  if (existing) {
    out = await policiesService.updatePolicy(existing.id, doc);
    operation = "updated";
  } else {
    out = await policiesService.createPolicies(doc);
    operation = "created";
  }

  res.status(201).json({
    operation,
    data: out,
    source: { objectName }
  });
});

export const getPolicySummary = asyncHandler(async (req, res) => {
  const summary = await aiService.getPolicySummary(req.params.id);

  res.json({ summary });
});

export const uploadPolicy = asyncHandler(async (req, res) => {
  const file = req.file; // set by multer.single("file")
  if (!file) {
    return res.status(400).json({ message: 'No file uploaded. Expecting field "file".' });
  }

  const ownerId = (req.user && req.user.id) || req.body.userId || 'anonymous';

  try {
    const result = await policiesService.uploadPolicyToBucket(file, ownerId);
    req.body.beFileName = result.path;
    const created = await policiesService.createPolicies(req.body);
    const summary = await aiService.getPolicySummary(created.id);
    await policiesService.updatePolicySummary(created.id, summary);
    

    res.status(201).json({
      fileUploadResult: result,
      databaseResult: created,
      summary
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

