// middlewares/auth.js
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
