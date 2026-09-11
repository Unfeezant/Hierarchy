import { Router } from "express";
import { AuditService } from "../services/audit.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";

const router = Router();

router.get("/", authMiddleware, requirePermission("audit:view"), (req, res) => {
  const { hierarchy_id, entity_type, entity_id, user_id, limit, offset } = req.query;
  const db = getDatabase();
  const auditService = new AuditService(db);

  const result = auditService.query({
    hierarchyId: hierarchy_id as string,
    entityType: entity_type as string,
    entityId: entity_id as string,
    userId: user_id as string,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0
  });

  res.json(result);
});

export default router;
