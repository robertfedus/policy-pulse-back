import { Router } from 'express';
import * as PoliciesController from '../../controllers/policies.controller.js';

const router = Router();

// CRUD
router.get('/', PoliciesController.listPolicies);
router.post('/', PoliciesController.createPolicies);

// Compare
router.post('/:id/compare', PoliciesController.comparePolicyById);
router.post('/compare', PoliciesController.comparePolicyByQuery);
router.post('/compare-files', PoliciesController.compareLocalFiles);

// NEW: ingest a single local file into Firestore
router.post('/ingest-file', PoliciesController.ingestPolicyFromFile);

export default router;
