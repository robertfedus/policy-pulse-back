// services/user.service.js
import { firestore } from '../config/firebase.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserCreateSchema } from '../models/user.model.js';
import { flattenUserMeds } from '../utils/meds.js';

const COLLECTION = 'users';
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '14d';

// ---------- helpers ----------
function signToken({ id, email, role }) {
  if (!jwtSecret) throw new Error('Missing JWT_SECRET');
  return jwt.sign({ sub: id, email, role }, jwtSecret, { expiresIn: jwtExpiresIn });
}

export function verifyToken(token) {
  if (!jwtSecret) throw new Error('Missing JWT_SECRET');
  return jwt.verify(token, jwtSecret);
}

function sanitize(user) {
  if (!user) return user;
  const { password, ...rest } = user;
  return rest;
}

async function findUserByEmail(email) {
  const snap = await firestore.collection(COLLECTION).where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ---------- public API ----------

export async function listUsers(auth /* { userId, role } */) {
  // Only 'hospital' can list everyone; patients can only list themselves (returns 1)
  if (!auth || auth.role !== 'hospital') {
    if (!auth?.userId) return [];
    const me = await getUserById(auth.userId);
    return me ? [me] : [];
  }

  const snapshot = await firestore.collection(COLLECTION).get();
  if (snapshot.empty) return [];
  return snapshot.docs.map(d => sanitize({ id: d.id, ...d.data() }));
}

export async function addIllnessToPatient(patientId, illnessName) {
  // 1) Validate input
  const name =
    typeof illnessName === "string" ? illnessName.trim() : "";
  if (!name) {
    const err = new Error("Illness name is required");
    err.status = 400;
    throw err;
  }

  const patientRef = firestore.collection(COLLECTION).doc(patientId);

  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(patientRef);
    if (!snap.exists) {
      const err = new Error("Patient not found");
      err.status = 404;
      throw err;
    }

    const data = snap.data() || {};
    if (data.role !== "patient") {
      const err = new Error("User is not a patient");
      err.status = 400;
      throw err;
    }

    // 2) Handle legacy field name ("ilnesses") and normalize to "illnesses"
    const legacy = Array.isArray(data.ilnesses) ? data.ilnesses : [];
    const current = Array.isArray(data.illnesses) ? data.illnesses : [];

    // migrate legacy into current if needed
    const merged = [...current];
    if (legacy.length && !current.length) {
      for (const it of legacy) merged.push(it);
    }
    console.log("Merged illnesses:", merged);

    // 3) Build the new illness object
    const newIllness = { name };
    newIllness.medications = []; // start with empty medications array

    // 4) Idempotent: skip if already present (case-insensitive match)
    const exists = merged.some(
      (i) => i && typeof i.name === "string" && i.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (!exists) merged.push(newIllness);

    // 5) Write back only the normalized "illnesses" field
    tx.update(patientRef, {
      illnesses: merged,
      updatedAt: new Date(),
    
    });

    return { id: snap.id, ...data, illnesses: merged };
  });
}

export async function addMedication(patientId,illness ,medication) {
  const patientRef = firestore.collection(COLLECTION).doc(patientId);
  const patientSnap = await patientRef.get();
  if (!patientSnap.exists) {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }
  const patientData = patientSnap.data();
  if (patientData.role !== 'patient') {
    const err = new Error('User is not a patient');
    err.status = 400;
    throw err;
  }
  console.log(patientData);
  const illnesses = Array.isArray(patientData.illnesses) ? patientData.illnesses : [];
  console.log(illnesses);
  const illnessIndex = illnesses.findIndex(i => i.name === illness)||illnesses.findIndex(i => i === illness.name);
  if (illnessIndex === -1) {
    const err = new Error('Illness not found for this patient');
    err.status = 404;
    throw err;
  }
  const illnessObj = illnesses[illnessIndex];
  const medications = Array.isArray(illnessObj.medications) ? illnessObj.medications : [];
  medications.push(medication);
  illnessObj.medications = medications;
  illnesses[illnessIndex] = illnessObj;
  await patientRef.update({ illnesses, updatedAt: new Date() });
  const updatedSnap = await patientRef.get();
  return sanitize({ id: updatedSnap.id, ...updatedSnap.data() });
  
}


export async function createUser(payload /* req.body */) {
  // Validate
  const data = UserCreateSchema.parse(payload);

  // Uniqueness check (Firestore has no unique constraints)
  const existing = await findUserByEmail(data.email);
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  // Hash password
  const hashed = await bcrypt.hash(data.password, 12);

  const toSave = {
    ...data,
    password: hashed,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const ref = await firestore.collection(COLLECTION).add(toSave);
  const doc = await ref.get();
  const user = { id: ref.id, ...doc.data() };

  // Issue JWT on register
  const token = signToken({ id: user.id, email: user.email, role: user.role });

  return { user: sanitize(user), token };
}

export async function authenticateUser(credentials /* { email, password } */) {
  // Simple login endpoint
  const { email, password } = credentials || {};
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.status = 400;
    throw err;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return { user: sanitize(user), token };
}

export async function findPatientsByHospital(hospitalId) {
  const hospSnap = await firestore.collection(COLLECTION).doc(hospitalId).get();
  if (!hospSnap.exists) return [];

  const hosp = hospSnap.data();
  if (hosp.role !== "hospital") return [];

  const list = Array.isArray(hosp.patients) ? hosp.patients : [];
  if (!list.length) return [];

  const ids = list.map(x => (typeof x === "string" && x.startsWith("users/") ? x.split("/")[1] : x));

  const refs = ids.map(id => firestore.collection(COLLECTION).doc(id));
  const snaps = await firestore.getAll(...refs);

  return snaps
    .filter(s => s.exists)
    .map(s => ({ id: s.id, ...s.data() }))
    .filter(u => u.role === "patient");
}


export async function getUserById(id) {
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return sanitize({ id: doc.id, ...doc.data() });
}

export async function updateUser(id, payload, auth /* { userId, role } */) {
  // Only owner or 'hospital' can update
  if (!auth || (auth.userId !== id && auth.role !== 'hospital')) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const data = UserUpdateSchema.parse(payload || {});
  const patch = { ...data, updatedAt: new Date() };

  // If updating email, enforce uniqueness
  if (data.email) {
    const existing = await findUserByEmail(data.email);
    if (existing && existing.id !== id) {
      const err = new Error('Email already in use');
      err.status = 409;
      throw err;
    }
  }

  // If updating password, hash it
  if (data.password) {
    patch.password = await bcrypt.hash(data.password, 12);
  }

  await firestore.collection(COLLECTION).doc(id).set(patch, { merge: true });
  const doc = await firestore.collection(COLLECTION).doc(id).get();
  return sanitize({ id: doc.id, ...doc.data() });
}

export async function deleteUser(id, auth /* { userId, role } */) {
  // Only owner or 'hospital' can delete
  if (!auth || (auth.userId !== id && auth.role !== 'hospital')) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  await firestore.collection(COLLECTION).doc(id).delete();
}

export async function getAllPatients() {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("role", "==", "patient")
    .get();

  if (snapshot.empty) return [];
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUsersInsuredOnAny(policyPaths) {
  const seen = new Set();
  const docs = [];

  const snaps = await Promise.all(
    policyPaths.map((path) =>
      firestore.collection(COLLECTION).where("insuredAt", "array-contains", path).get()
    )
  );

  snaps.forEach((snap) => {
    snap.forEach((doc) => {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        docs.push(doc);
      }
    });
  });

  return docs;
}

export function extractUserMeds(doc) {
  const data = doc.data();
  if (Array.isArray(data.medicationsFlat) && data.medicationsFlat.length) {
    return data.medicationsFlat.map((m) => String(m).toLowerCase());
  }
  return flattenUserMeds(data);
}
