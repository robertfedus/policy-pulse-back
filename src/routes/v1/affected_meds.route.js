import express from "express";
const router = express.Router();

import { runByIds} from "../../controllers/affected_meds.controller.js";

// POST /v1/affected-meds/run-by-id
router.post("/run-by-id", runByIds);

export default router;