import { runAffectedMedsByPolicyIds } from "../services/affected_meds.service.js";

// POST /v1/affected-meds/run-by-id
// body: { oldPolicyId, newPolicyId, insuredPolicyId?, persist? }
export async function runByIds(req, res, next) {
  try {
    console.log("[affected_meds] body:", req.body);
    const { oldPolicyId, newPolicyId, insuredPolicyId, persist } = req.body || {};
    if (!oldPolicyId || !newPolicyId) {
      return res.status(400).json({ ok: false, error: "oldPolicyId and newPolicyId are required" });
    }
    const result = await runAffectedMedsByPolicyIds({
      oldPolicyId,
      newPolicyId,
      insuredPolicyId,
      persist: persist !== false,
    });
    res.status(200).json({ ok: true, ...result });
    // controllers/affected_meds.controller.js


  } catch (err) {
    next(err);
  }
}

