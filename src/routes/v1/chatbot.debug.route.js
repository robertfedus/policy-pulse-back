// src/routes/v1/ai.debug.route.js
import express from "express";
import { firestore } from "../../config/firebase.js";

const router = express.Router();

// GET /v1/ai/debug/me
router.get("/me", async (req, res) => {
  try {
    const headerUserId = req.get("x-user-id");
    const bodyUserId = req.query.userId || null;

    const userId = headerUserId || bodyUserId;
    if (!userId) return res.status(400).json({ ok:false, error:"Missing X-User-Id header (or ?userId=...)" });

    const snap = await firestore.collection("users").doc(userId).get();

    return res.json({
      ok: true,
      receivedHeader: headerUserId || null,
      receivedQuery: bodyUserId || null,
      resolvedUserId: userId,
      userExists: snap.exists,
      userKeys: snap.exists ? Object.keys(snap.data() || {}) : [],
      sample: snap.exists ? {
        name: snap.data().name || null,
        email: snap.data().email || null,
        role: snap.data().role || null,
        insuredAt: snap.data().insuredAt || [],
      } : null
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

export default router;
