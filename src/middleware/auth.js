/**
 * Auth middlewares (JWT-based)
 *
 * What it does:
 * - Extracts a Bearer token, validates it via `verifyToken`, and attaches claims to `req.auth`.
 * - Provides:
 *    - `authenticate`   → requires a valid token (401 if missing/invalid)
 *    - `optionalAuth`   → tries to auth, falls back to anonymous (req.auth = null)
 *    - `requireRole(...roles)` → requires auth AND one of the allowed roles (403 otherwise)
 *    - `ownOrRole(selectUserId, ...roles)` → owner-or-role check for resource access
 *    - `requireAuth(requiredRole?)` → drop-in helper for routes (compatible with `requireAuth('hospital')`)
 *
 * Expected token claims from verifyToken():
 *   { sub: <userId>, email: <string>, role: 'hospital'|'patient'|..., iat, exp }
 *
 * Usage examples:
 *   import requireAuth, { authenticate, requireRole, ownOrRole } from '../middlewares/auth.js';
 *
 *   router.post('/secure', requireAuth('hospital'), handler);
 *   router.get('/me', authenticate, handler);
 *   router.patch('/users/:id', ownOrRole(req => req.params.id, 'hospital'), handler);
 */

import { verifyToken } from '../services/users.service.js';

// Small helper to extract a Bearer token safely
function getTokenFromHeader(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

/**
 * authenticate
 * - Requires a valid JWT
 * - Attaches { userId, email, role, token, iat, exp } to req.auth
 * - 401 on missing/invalid/expired token
 */
export function authenticate(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const { sub: userId, email, role, iat, exp } = verifyToken(token);
    req.auth = { userId, email, role, token, iat, exp };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * optionalAuth
 * - Tries to authenticate; if no/invalid token, continues as anonymous (req.auth = null)
 * - Useful for routes that may personalize if logged in but still work when anonymous
 */
export function optionalAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) {
    req.auth = null;
    return next();
  }
  try {
    const { sub: userId, email, role, iat, exp } = verifyToken(token);
    req.auth = { userId, email, role, token, iat, exp };
  } catch {
    req.auth = null; // treat as anonymous if token is bad
  }
  next();
}

/**
 * requireRole(...roles)
 * - Ensures req.auth exists and role is in allowed list
 * - 401 if not authenticated, 403 if role not allowed
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Unauthorized' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

/**
 * ownOrRole(selectUserId, ...roles)
 * - Authorize if the authenticated user "owns" the resource OR has one of the given roles.
 * - `selectUserId` can be:
 *    - a function (req) => userIdFromParams
 *    - a direct string userId
 * - Example: ownOrRole(req => req.params.id, 'hospital')
 */
export function ownOrRole(selectUserId, ...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: 'Unauthorized' });

    const resourceUserId =
      typeof selectUserId === 'function' ? selectUserId(req) : selectUserId;

    if (req.auth.userId === resourceUserId || roles.includes(req.auth.role)) {
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  };
}

/**
 * requireAuth(requiredRole?)
 * - Convenience middleware: verifies token and (optionally) enforces a single role.
 * - Compatible with usage like: `router.post('/x', requireAuth('hospital'), handler)`
 */
export function requireAuth(requiredRole) {
  return (req, res, next) => {
    const devBypass = process.env.DEV_ALLOW_INSECURE_NOTIFICATIONS === 'true';

    // Allow calls without token in dev
    const token = (req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : null;

    if (!token) {
      if (devBypass) {
        // Fake auth identity for local testing
        req.auth = {
          userId: 'dev-hospital',
          email: 'dev@example.com',
          role: requiredRole || 'hospital',
          token: 'DEV',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        };
        return next();
      }
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const { sub: userId, email, role, iat, exp } = verifyToken(token);
      req.auth = { userId, email, role, token, iat, exp };

      if (requiredRole && role !== requiredRole) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      next();
    } catch {
      if (devBypass) {
        req.auth = {
          userId: 'dev-hospital',
          email: 'dev@example.com',
          role: requiredRole || 'hospital',
          token: 'DEV',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        };
        return next();
      }
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}

// Default export so you can `import requireAuth from '../middlewares/auth.js'`
export default requireAuth;
