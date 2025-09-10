import { Router } from 'express';
import healthRoute from './health.route.js';
import usersRouteV1 from './v1/users.route.js';
import insuranceCompaniesRoute from './v1/insurance_companies.route.js';
import policiesRoute from './v1/policies.route.js';
import compareRoute from './v1/compare.route.js';
import recommendationsRoute from './v1/recommendations.route.js';

import aiRoute from './v1/ai.route.js';
import affectedMedsRoute from './v1/affected_meds.route.js';
import aiDebugRoute from './v1/chatbot.debug.route.js';

const router = Router();

router.use('/health', healthRoute);
router.use('/v1/auth', usersRouteV1);
router.use('/v1/insurance_companies', insuranceCompaniesRoute);
router.use('/v1/policies', policiesRoute);
router.use('/v1/compare', compareRoute);
router.use('/v1/recommendations', recommendationsRoute);

router.use('/v1/ai', aiRoute);
router.use('/v1/affected_meds', affectedMedsRoute);

router.use('/v1/ai/debug', aiDebugRoute);

export default router;
