import { Router } from 'express';
import * as PoliciesController from '../../controllers/policies.controller.js';
import multer from 'multer';

import asyncHandler from "../../utils/asyncHandler.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
// CRUD
router.get('/', PoliciesController.listPolicies);
router.get('/:id', PoliciesController.getPoliciesById);
router.get('/insurance-company/:insuranceCompanyId', PoliciesController.getPoliciesByInsuranceCompany);  
router.post('/', PoliciesController.createPolicies);
router.get("/:id/pdf", PoliciesController.streamPolicyPdf);       
router.get("/:id/pdf-url", PoliciesController.policyPdfSignedUrl); 
router.get("/insuranceRef/:insuranceCompanyRef", PoliciesController.findPolicyByInsuranceCompany);
router.get("/changes/versions", PoliciesController.getAllVersionPairs);


// router.post('/:id/compare', PoliciesController.comparePolicyById);
// router.post('/compare', PoliciesController.comparePolicyByQuery);
// router.post('/compare-files', PoliciesController.compareLocalFiles);

router.get('/summary/:id', PoliciesController.getPolicySummary);



// NEW: ingest a single local file into Firestore
router.post('/ingest-file', PoliciesController.ingestPolicyFromFile);

router.post('/ingest-policy', PoliciesController.ingestPolicyFromBucket);

router.post('/upload', upload.single('file'), PoliciesController.uploadPolicy);

export default router;
