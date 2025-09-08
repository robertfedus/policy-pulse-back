import { Router } from 'express';
import * as PolicyHistoriesController from '../../controllers/policy_histories.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

// Public placeholder route
router.get('/',PolicyHistoriesController.listPolicyHistories);
router.post('/', PolicyHistoriesController.createPolicyHistory);
// Example protected routes (uncomment when ready)

// router.get('/:id', requireAuth, usersController.getUserById);
// router.patch('/:id', requireAuth, usersController.updateUser);
// router.delete('/:id', requireAuth, usersController.deleteUser);

export default router;
