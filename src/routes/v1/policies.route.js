import { Router } from 'express';
import * as PoliciesController from '../../controllers/policies.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

// Public placeholder route
router.get('/', PoliciesController.listPolicies);
router.post('/', PoliciesController.createPolicies);
// Example protected routes (uncomment when ready)

// router.get('/:id', requireAuth, usersController.getUserById);
// router.patch('/:id', requireAuth, usersController.updateUser);
// router.delete('/:id', requireAuth, usersController.deleteUser);

export default router;
