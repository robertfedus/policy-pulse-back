import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { sendPlanChangeEmails } from '../../controllers/planNotifications.controller.js';

const router = Router();

// Example: allow only hospitals to trigger bulk sends
router.post('/plan-changes/bulk', requireAuth('hospital'), sendPlanChangeEmails);

export default router;
