import { Router } from 'express';
import {chat} from '../../controllers/chatbot.controller.js';
const router = Router();

// Public placeholder route
//router.post('/', aiController.sendOpenAIPrompt);
// router.post('/', InsuranceCompaniesController.createInsuranceCompanies);
// Example protected routes (uncomment when ready)

// router.get('/:id', requireAuth, usersController.getUserById);
// router.patch('/:id', requireAuth, usersController.updateUser);
// router.delete('/:id', requireAuth, usersController.deleteUser);
router.post("/chat", chat);
export default router;
