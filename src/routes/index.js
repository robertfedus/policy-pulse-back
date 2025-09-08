import { Router } from 'express';
import healthRoute from './health.route.js';
import usersRouteV1 from './v1/users.route.js';
import insuranceCompaniesRoute from './v1/insurance_companies.route.js';
import policiesRoute from './v1/policies.route.js';

import aiRoute from './v1/ai.route.js';

const router = Router();

router.use('/health', healthRoute);
router.use('/v1/users', usersRouteV1);
router.use('/v1/insurance_companies', insuranceCompaniesRoute);
router.use('/v1/policies', policiesRoute);

router.use('/v1/ai', aiRoute);


export default router;
