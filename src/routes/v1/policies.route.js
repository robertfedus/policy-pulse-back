import { Router } from 'express';
import * as PoliciesController from '../../controllers/policies.controller.js';


const router = Router();

// CRUD
router.get('/', PoliciesController.listPolicies);
router.get('/:id', PoliciesController.getPoliciesById);
router.get('/insurance-company/:insuranceCompanyId', PoliciesController.getPoliciesByInsuranceCompany);  
router.post('/', PoliciesController.createPolicies);
router.get("/:id/pdf", PoliciesController.streamPolicyPdf);       
router.get("/:id/pdf-url", PoliciesController.policyPdfSignedUrl); 
router.get("/insuranceRef/:insuranceCompanyRef", PoliciesController.findPolicyByInsuranceCompany);

// Compare
router.post('/:id/compare', PoliciesController.comparePolicyById);
router.post('/compare', PoliciesController.comparePolicyByQuery);
router.post('/compare-files', PoliciesController.compareLocalFiles);

// NEW: ingest a single local file into Firestore
router.post('/ingest-file', PoliciesController.ingestPolicyFromFile);

router.post('/ingest-policy', PoliciesController.ingestPolicyFromBucket);

export default router;
