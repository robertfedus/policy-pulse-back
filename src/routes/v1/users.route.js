import { Router } from 'express';
import * as usersController from '../../controllers/users.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

// Public placeholder route
router.get('/', usersController.listUsers);
router.get('/patients', usersController.getAllPatients);
router.get('/:id', usersController.getUserById);
router.post('/', usersController.createUser);
router.get('/hospital/:id/patients', usersController.findPatientsByHospital);
// Example protected routes (uncomment when ready)

//router.get('/:id', requireAuth, usersController.getUserById);
// router.patch('/:id', requireAuth, usersController.updateUser);
// router.delete('/:id', requireAuth, usersController.deleteUser);

export default router;
