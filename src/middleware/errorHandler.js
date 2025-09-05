import createError from 'http-errors';
import logger from '../utils/logger.js';

export const errorHandler = (err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (status >= 500) {
    logger.error(err.stack || err);
  } else {
    logger.warn(message);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

// Helper to convert 404
export function toHttpError(status, message) {
  return createError(status, message);
}
