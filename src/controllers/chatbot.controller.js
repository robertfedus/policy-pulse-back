import { chatWithTools } from "../services/chatbot.service.js";

export async function chat(req, res, next) {
  try {
    const { messages, userId: bodyUserId } = req.body || {};
    const headerUserId = req.get("X-User-Id");
    const userId = bodyUserId || headerUserId;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: "messages array required" });
    }
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId required (header X-User-Id or body.userId)" });
    }

    const result = await chatWithTools({ messages, context: { userId } });
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
}
