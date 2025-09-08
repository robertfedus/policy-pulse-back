import { Router } from 'express';
import * as PoliciesController from '../../controllers/policies.controller.js';
// import { requireAuth } from '../../middleware/auth.js';

const router = Router();

// Public placeholder route
router.get('/', PoliciesController.listPolicies);
router.get('/:id', PoliciesController.getPoliciesById);
router.get('/insurance-company/:insuranceCompanyId', PoliciesController.getPoliciesByInsuranceCompany);  
router.post('/', PoliciesController.createPolicies);
// Example protected routes (uncomment when ready)

// router.patch('/:id', requireAuth, usersController.updateUser);
// router.delete('/:id', requireAuth, usersController.deleteUser);

export default router;
