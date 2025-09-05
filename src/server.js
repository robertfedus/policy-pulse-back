import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 3000;

const server = createServer(app);

server.listen(PORT, () => {
  logger.info(`Server listening on http://localhost:${PORT}`);
});
