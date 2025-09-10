import { Router } from "express";
import * as RecommendationsController from  "../../controllers/recommendations.controller.js";

const router = Router();

router.get("/:userId", RecommendationsController.recommendBetterThanCurrent);

export default router;
