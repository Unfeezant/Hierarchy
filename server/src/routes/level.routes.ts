import { Router } from "express";
import { LevelService } from "../services/level.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";
import { isUserAuthorizedForHierarchy } from "../middleware/scope.js";

const router = Router();

router.get("/hierarchies/:hierarchyId/levels", authMiddleware, requirePermission("level:view"), (req, res) => {
  if (!isUserAuthorizedForHierarchy(req.user, req.params.hierarchyId)) {
    return res.status(403).json({ error: "Access denied: you are not authorized to view levels in this hierarchy system." });
  }
  const db = getDatabase();
  const levelService = new LevelService(db);
  const levels = levelService.getLevels(req.params.hierarchyId);
  res.json(levels);
});

router.get("/levels/:id", authMiddleware, requirePermission("level:view"), (req, res) => {
  const db = getDatabase();
  const levelService = new LevelService(db);
  const level = levelService.getLevel(req.params.id);
  if (!level) return res.status(404).json({ error: "Level not found" });
  if (!isUserAuthorizedForHierarchy(req.user, level.hierarchy_id)) {
    return res.status(403).json({ error: "Access denied: you are not authorized to view this level." });
  }
  res.json(level);
});

router.post("/hierarchies/:hierarchyId/levels", authMiddleware, requirePermission("level:manage"), (req, res) => {
  const { name, code, description, icon, color, depth_order, allowed_parent_level_ids, display_settings } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Level name is required" });

  try {
    const db = getDatabase();
    const levelService = new LevelService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const level = levelService.createLevel(
      req.params.hierarchyId,
      {
        name,
        code,
        description,
        icon,
        color,
        depth_order,
        allowed_parent_level_ids,
        display_settings
      },
      actor
    );
    res.status(201).json(level);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/levels/:id", authMiddleware, requirePermission("level:manage"), (req, res) => {
  try {
    const db = getDatabase();
    const levelService = new LevelService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const updated = levelService.updateLevel(req.params.id, req.body, actor);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/levels/:id", authMiddleware, requirePermission("level:manage"), (req, res) => {
  try {
    const db = getDatabase();
    const levelService = new LevelService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    levelService.deleteLevel(req.params.id, actor);
    res.json({ message: "Level deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/hierarchies/:hierarchyId/levels/reorder", authMiddleware, requirePermission("level:manage"), (req, res) => {
  const { levelIds } = req.body;
  if (!Array.isArray(levelIds)) return res.status(400).json({ error: "levelIds must be an array" });

  try {
    const db = getDatabase();
    const levelService = new LevelService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    levelService.reorderLevels(req.params.hierarchyId, levelIds, actor);
    res.json({ message: "Levels reordered successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
