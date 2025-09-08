import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import compression from 'compression';

import routes from './routes/index.js';
import notFound from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';


const app = express();

// Basic hardening & common middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Request logging
app.use(morgan('dev'));

// API routes
app.use('/api', routes);

// Health root (optional)
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'express-firebase-template' });
});

// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

export default app;
