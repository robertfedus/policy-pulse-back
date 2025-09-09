import { Router } from 'express';
import * as PoliciesController from '../../controllers/policies.controller.js';
import multer from 'multer';


const router = Router();

// CRUD
router.get('/', PoliciesController.listPolicies);
router.get('/:id', PoliciesController.getPoliciesById);
router.get('/insurance-company/:insuranceCompanyId', PoliciesController.getPoliciesByInsuranceCompany);  
router.post('/', PoliciesController.createPolicies);
router.get("/:id/pdf", PoliciesController.streamPolicyPdf);       
router.get("/:id/pdf-url", PoliciesController.policyPdfSignedUrl); 

// Summary
router.get('/summary/:id', PoliciesController.getPolicySummary);

// NEW: ingest a single local file into Firestore
router.post('/ingest-file', PoliciesController.ingestPolicyFromFile);

router.post('/ingest-policy', PoliciesController.ingestPolicyFromBucket);

const upload = multer({ storage: multer.memoryStorage() });
router.post('/upload', upload.single('file'), PoliciesController.uploadPolicy);

export default router;
