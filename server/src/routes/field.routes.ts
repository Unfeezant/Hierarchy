import { Router } from "express";
import { FieldService } from "../services/field.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";

const router = Router();

router.get("/levels/:levelId/fields", authMiddleware, requirePermission("field:view"), (req, res) => {
  const db = getDatabase();
  const fieldService = new FieldService(db);
  const fields = fieldService.getFieldsByLevel(req.params.levelId);
  res.json(fields);
});

router.get("/fields/:id", authMiddleware, requirePermission("field:view"), (req, res) => {
  const db = getDatabase();
  const fieldService = new FieldService(db);
  const field = fieldService.getField(req.params.id);
  if (!field) return res.status(404).json({ error: "Field not found" });
  res.json(field);
});

router.post("/levels/:levelId/fields", authMiddleware, requirePermission("field:manage"), (req, res) => {
  const { name, key, field_type, is_required, default_value, is_visible_default, options, validation_rules, calculation_formula, order_index } = req.body;
  if (!name || !field_type) {
    return res.status(400).json({ error: "Field name and field_type are required" });
  }

  try {
    const db = getDatabase();
    const fieldService = new FieldService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const field = fieldService.createField(
      req.params.levelId,
      {
        name,
        key,
        field_type,
        is_required,
        default_value,
        is_visible_default,
        options,
        validation_rules,
        calculation_formula,
        order_index
      },
      actor
    );
    res.status(201).json(field);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/fields/:id", authMiddleware, requirePermission("field:manage"), (req, res) => {
  try {
    const db = getDatabase();
    const fieldService = new FieldService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const updated = fieldService.updateField(req.params.id, req.body, actor);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/fields/:id", authMiddleware, requirePermission("field:manage"), (req, res) => {
  try {
    const db = getDatabase();
    const fieldService = new FieldService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    fieldService.deleteField(req.params.id, actor);
    res.json({ message: "Field deleted successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
