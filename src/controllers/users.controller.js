import * as usersService from '../services/users.service.js';
import asyncHandler from '../utils/asyncHandler.js';

export const listUsers = asyncHandler(async (req, res) => {
  // Empty example — returns zero items by default
  const users = await usersService.listUsers();
  res.json({ data: users });
});


export const createUser = asyncHandler(async (req, res) => {
  const created = await usersService.createUser(req.body);
  res.status(201).json({ data: created });
});

export const addIllnessToPatient = asyncHandler(async (req, res) => {
  const updated = await usersService.addIllnessToPatient(req.params.id, req.body.illness);
  res.json({ data: updated });
});

export const addMedication = asyncHandler(async (req, res) => {
  const updated = await usersService.addMedication(req.params.id, req.body.illness, req.body.medication);
  res.json({ data: updated });
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.params.id);
  res.json({ data: user });
});

export const findPatientsByHospital = asyncHandler(async (req, res) => {
  const patients = await usersService.findPatientsByHospital(req.params.id);
  res.json({ data: patients });
});


export const updateUser = asyncHandler(async (req, res) => {
  const auth = {
    userId: req.user?.id
      || req.get('x-user-id')
      || req.get('user-id')
      || req.body.userId,
    role:  req.user?.role || 'patient',
  };

  const updated = await usersService.updateUser(req.params.id, req.body, auth);
  res.json({ data: updated });
});

export const deleteUser = asyncHandler(async (req, res) => {
  await usersService.deleteUser(req.params.id);
  res.status(204).send();
});

export const getAllPatients = asyncHandler(async (req, res) => {
  const patients = await usersService.getAllPatients();
  res.json({ data: patients });
});


/**
 * Extract auth info from the "Authorization: Bearer <jwt>" header.
 * - Returns { userId, role } if the token is valid
 * - Returns null if there's no token or the token is invalid/expired
 * This is intentionally a tiny helper instead of full middleware to keep the example simple.
 */
function extractAuth(req) {
  // Grab the Authorization header (could be undefined)
  const header = req.headers.authorization || '';
  // Expect a "Bearer <token>" format
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    // verifyToken() throws if the token is invalid/expired or secret is missing
    const { sub: userId, role } = verifyToken(token);
    return { userId, role };
  } catch {
    // If verification fails, treat as unauthenticated
    return null;
  }
}

/**
 * POST /auth/register
 * Creates a user (validates + hashes password) and returns { user, token }
 * 201 Created on success
 */
export async function register(req, res, next) {
  try {
    // req.body is validated inside createUser via Zod; it also issues a JWT
    const result = await usersService.createUser(req.body);
    // Include both sanitized user and access token for immediate login
    res.status(201).json(result); // { user, token }
  } catch (e) {
    // Pass errors to your Express error handler middleware
    next(e);
  }
}

/**
 * POST /auth/login
 * Expects { email, password } in req.body
 * Returns { user, token } on success
 */
export async function login(req, res, next) {
  try {
    const result = await usersService.authenticateUser(req.body); // service throws 400/401 on bad input/creds
    res.json(result); // { user, token }
  } catch (e) {
    next(e);
  }
}

/**
 * GET /auth/me
 * Returns the current authenticated user's profile (sanitized).
 * 401 if no/invalid token.
 */
export async function me(req, res, next) {
  try {
    const auth = extractAuth(req);
    if (!auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    // Load the user document by the ID baked into the JWT's `sub` claim
    const user = await getUserById(auth.userId);
    // getUserById() already strips the password via sanitize()
    res.json({ user });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /users
 * Lists users.
 * - 'hospital' role: returns everyone
 * - others: returns just themselves (array with a single item)
 * Note: Authorization is optional here; unauthenticated requests get an empty array.
 * Adjust to your needs (you might want to force 401 instead).
 */
export async function index(req, res, next) {
  try {
    const auth = extractAuth(req);
    const users = await listUsers(auth);
    res.json({ users });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /users/:id
 * Fetches a user by ID. This example allows public reads.
 * If you need privacy, enforce auth/role checks here or move them into the service.
 */
export async function show(req, res, next) {
  try {
    const user = await getUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Not found' });
    }
    res.json({ user });
  } catch (e) {
    next(e);
  }
}

/**
 * PATCH /users/:id
 * Updates a user. Authorization rules live in the service:
 * - Only the owner or 'hospital' can update
 * Zod validates the payload; passwords are rehashed if present.
 */
export async function patch(req, res, next) {
  try {
    const auth = extractAuth(req);
    const user = await updateUser(req.params.id, req.body, auth);
    res.json({ user });
  } catch (e) {
    next(e);
  }
}

/**
 * DELETE /users/:id
 * Deletes a user. Service enforces:
 * - Only the owner or 'hospital' can delete
 * Responds 204 No Content on success.
 */
export async function destroy(req, res, next) {
  try {
    const auth = extractAuth(req);
    await deleteUser(req.params.id, auth);
    res.status(204).send(); // no response body
  } catch (e) {
    next(e);
  }
}
