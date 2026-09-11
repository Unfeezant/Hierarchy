import { Router } from "express";
import { ImportExportService } from "../services/import-export.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";
import { getUserScopeMemberId } from "../middleware/scope.js";

const router = Router();

router.post("/levels/:levelId/import/preview", authMiddleware, requirePermission("data:import"), (req, res) => {
  const { hierarchy_id, rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array" });

  try {
    const db = getDatabase();
    const service = new ImportExportService(db);
    const preview = service.previewImport(hierarchy_id, req.params.levelId, rows);
    res.json(preview);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/levels/:levelId/import/commit", authMiddleware, requirePermission("data:import"), (req, res) => {
  const { hierarchy_id, rows, default_parent_id } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "No records to import" });
  }

  try {
    const db = getDatabase();
    const service = new ImportExportService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const result = service.commitImport(hierarchy_id, req.params.levelId, rows, default_parent_id || null, actor);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/levels/:levelId/export", authMiddleware, requirePermission("data:export"), (req, res) => {
  const { format, hierarchy_id } = req.query;
  const exportFormat = (format as string)?.toLowerCase() === "json" ? "json" : "csv";

  try {
    const db = getDatabase();
    const service = new ImportExportService(db);
    const scopeMemberId = getUserScopeMemberId(req.user, hierarchy_id as string);

    const result = service.exportLevel(req.params.levelId, exportFormat, {
      hierarchyId: hierarchy_id as string,
      scopeMemberId
    });

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
