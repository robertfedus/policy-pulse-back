// src/server.js
// No need for `import dotenv` because nodemon runs: `node --env-file .env …`
// IMPORTANT: load pdfjs polyfills BEFORE anything that might import pdfjs-dist
import './polyfills/pdfjs-node.js';

import http from 'http';
import app from './app.js';
import logger from './utils/logger.js';

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info(`API listening on http://localhost:${PORT}`);
});

// Tweak timeouts to avoid Node 18+/24 header/keep-alive edge cases
server.keepAliveTimeout = 65_000; // 65s
server.headersTimeout = 66_000;   // 66s

// Graceful shutdown
const shutdown = (sig) => {
  logger.info(`${sig} received. Shutting down...`);
  server.close((err) => {
    if (err) {
      logger.error(`server.close error: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  });
};
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => shutdown(sig)));

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack || err.message}`);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});
