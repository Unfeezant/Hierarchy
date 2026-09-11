import { Router } from "express";
import { HierarchyService } from "../services/hierarchy.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";
import { getUserScopeMemberId, isUserAuthorizedForHierarchy } from "../middleware/scope.js";

const router = Router();

router.get("/", authMiddleware, requirePermission("hierarchy:view"), (req, res) => {
  const db = getDatabase();
  const hierarchyService = new HierarchyService(db);
  const hierarchies = hierarchyService.getHierarchies();
  const filtered = hierarchies.filter(h => isUserAuthorizedForHierarchy(req.user, h.id));
  res.json(filtered);
});

router.get("/:id", authMiddleware, requirePermission("hierarchy:view"), (req, res) => {
  if (!isUserAuthorizedForHierarchy(req.user, req.params.id)) {
    return res.status(403).json({ error: "Access denied: you are not authorized to view this hierarchy system." });
  }
  const db = getDatabase();
  const hierarchyService = new HierarchyService(db);
  const hierarchy = hierarchyService.getHierarchy(req.params.id);
  if (!hierarchy) return res.status(404).json({ error: "Hierarchy not found" });
  res.json(hierarchy);
});

router.post("/", authMiddleware, requirePermission("hierarchy:manage"), (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Hierarchy name is required" });

  try {
    const db = getDatabase();
    const hierarchyService = new HierarchyService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const created = hierarchyService.createHierarchy({ name, description }, actor);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", authMiddleware, requirePermission("hierarchy:manage"), (req, res) => {
  const { name, description } = req.body;
  try {
    const db = getDatabase();
    const hierarchyService = new HierarchyService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const updated = hierarchyService.updateHierarchy(req.params.id, { name, description }, actor);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", authMiddleware, requirePermission("hierarchy:manage"), (req, res) => {
  try {
    const db = getDatabase();
    const hierarchyService = new HierarchyService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    hierarchyService.deleteHierarchy(req.params.id, actor);
    res.json({ message: "Hierarchy deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id/pyramid", authMiddleware, requirePermission("hierarchy:view"), (req, res) => {
  if (!isUserAuthorizedForHierarchy(req.user, req.params.id)) {
    return res.status(403).json({ error: "Access denied: you are not authorized to view this hierarchy system." });
  }
  const db = getDatabase();
  const hierarchyService = new HierarchyService(db);
  const scopeMemberId = getUserScopeMemberId(req.user, req.params.id);
  const summary = hierarchyService.getPyramidSummary(req.params.id, scopeMemberId);
  res.json(summary);
});

export default router;
