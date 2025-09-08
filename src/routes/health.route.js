import { Router } from 'express';
import * as healthController from '../controllers/health.controller.js';
import { authenticate } from './../middleware/auth.js';

const router = Router();

router.get('/', healthController.getHealth);

export default router;
