import { Router } from 'express';
import healthRoute from './health.route.js';
import usersRouteV1 from './v1/users.route.js';

const router = Router();

router.use('/health', healthRoute);
router.use('/v1/users', usersRouteV1);

export default router;
