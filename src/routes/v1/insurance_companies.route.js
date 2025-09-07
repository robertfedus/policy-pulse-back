import { Router } from 'express';
import * as InsuranceCompaniesController from '../../controllers/insurance_companies.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

// Public placeholder route
router.get('/', InsuranceCompaniesController.listInsuranceCompanies);
router.post('/', InsuranceCompaniesController.createInsuranceCompanies);
// Example protected routes (uncomment when ready)

// router.get('/:id', requireAuth, usersController.getUserById);
// router.patch('/:id', requireAuth, usersController.updateUser);
// router.delete('/:id', requireAuth, usersController.deleteUser);

export default router;
