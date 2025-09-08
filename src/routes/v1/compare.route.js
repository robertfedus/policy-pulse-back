// src/routes/v1/compare.route.js
import express from "express";
import multer from "multer";
import { comparePdfTexts, comparePdfUnified, comparePdfInline, comparePdfTables } from "../../services/compare.service.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /pdf/compare?format=json|unified|inline|table&context=3&section=coverage|oop
 * form-data: oldPdf (file), newPdf (file)
 */
router.post(
  "/",
  upload.fields([{ name: "oldPdf", maxCount: 1 }, { name: "newPdf", maxCount: 1 }]),
  async (req, res) => {
    try {
      const mode = (req.query.format || "json").toLowerCase();
      const section = (req.query.section || "coverage").toLowerCase();
      const context = Number.isFinite(+req.query.context) ? +req.query.context : 3;

      const oldFile = req.files?.oldPdf?.[0];
      const newFile = req.files?.newPdf?.[0];
      if (!oldFile || !newFile) {
        return res.status(400).json({ error: "Upload oldPdf and newPdf files." });
      }

      if (mode === "unified") {
        const { patch } = await comparePdfUnified(oldFile.buffer, newFile.buffer, {
          oldName: oldFile.originalname,
          newName: newFile.originalname,
          context,
        });
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.send(patch);
      }

      if (mode === "inline") {
        const text = await comparePdfInline(oldFile.buffer, newFile.buffer);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.send(text);
      }

      if (mode === "table") {
        const result = await comparePdfTables(oldFile.buffer, newFile.buffer, { section });
        return res.json({
          meta: {
            oldFilename: oldFile.originalname,
            newFilename: newFile.originalname,
            section,
          },
          ...result,
        });
      }

      // default json (full text diff)
      const result = await comparePdfTexts(oldFile.buffer, newFile.buffer);
      return res.json({
        meta: {
          oldFilename: oldFile.originalname,
          newFilename: newFile.originalname,
          oldBytes: oldFile.size,
          newBytes: newFile.size,
        },
        summary: result.summary,
        diff: result.diff,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Comparison failed", detail: String(e.message || e) });
    }
  }
);

export default router;
