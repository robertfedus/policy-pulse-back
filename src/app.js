// app.js
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import compression from 'compression';

import routes from './routes/index.js';
import notFound from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

const corsOptions = {
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
};

app.use(cors(corsOptions));

// Security & middleware
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Logging
app.use(morgan('dev'));

// Routes
app.use('/api', routes);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'express-firebase-template' });
});

// 404 + errors
app.use(notFound);
app.use(errorHandler);

export default app;
 