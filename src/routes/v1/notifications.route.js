import { Router } from 'express';
import { sendPlanChangeEmails } from '../../controllers/planNotifications.controller.js';

const router = Router();

// Example: allow only hospitals to trigger bulk sends
router.post('/plan-changes/bulk', sendPlanChangeEmails);

export default router;