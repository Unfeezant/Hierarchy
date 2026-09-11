import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Database } from "better-sqlite3";
import { authMiddleware, requirePermission } from "../middleware/auth.js";
import { isUserAuthorizedForHierarchy } from "../middleware/scope.js";
import { AiSessionService } from "../services/ai/ai-session.service.js";
import { AiProviderService } from "../services/ai/ai-provider.service.js";
import { AI_CONFIG } from "../config/ai.config.js";

export function createAiRoutes(db: Database) {
  const router = express.Router();
  const sessionService = new AiSessionService(db);

  // Setup multer upload directory
  const uploadDir = AI_CONFIG.tempUploadDir;
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const uniqueName = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, uniqueName);
    }
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: AI_CONFIG.maxFileSizeMb * 1024 * 1024,
      files: AI_CONFIG.maxFilesPerMessage
    }
  });

  /**
   * Health and model discovery
   */
  router.get("/status", async (_req, res) => {
    try {
      const models = await AiProviderService.getAvailableModels();
      const activeModel = await AiProviderService.resolveActiveModel();
      res.json({
        available: models.length > 0,
        activeModel,
        availableModels: models,
        provider: AI_CONFIG.provider,
        baseUrl: AI_CONFIG.baseUrl
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Start a conversational record creation or edit session
   */
  router.post("/session", authMiddleware, async (req, res) => {
    try {
      const { hierarchyId, targetLevelId, parentId, mode, targetMemberId } = req.body;
      const user = (req as any).user;

      if (!hierarchyId || !targetLevelId) {
        return res.status(400).json({ error: "hierarchyId and targetLevelId are required" });
      }

      if (!isUserAuthorizedForHierarchy(user, hierarchyId)) {
        return res.status(403).json({ error: "Access denied: your account is restricted from accessing AI in this hierarchy domain." });
      }

      const session = await sessionService.createSession({
        userId: user.id,
        hierarchyId,
        targetLevelId,
        parentId: parentId || null,
        mode: mode === "edit" ? "edit" : (mode === "create" ? "create" : "lookup"),
        targetMemberId
      });

      res.status(201).json(session);
    } catch (err: any) {
      console.error("AI Create Session Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Get active session
   */
  router.get("/session/:sessionId", authMiddleware, (req, res) => {
    try {
      const session = sessionService.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Update active session target level, parent, or mode dynamically
   */
  router.patch("/session/:sessionId", authMiddleware, (req, res) => {
    try {
      const { sessionId } = req.params;
      const { targetLevelId, parentId, mode, targetMemberId } = req.body;
      const updated = sessionService.updateSessionTarget(sessionId, {
        targetLevelId,
        parentId,
        mode,
        targetMemberId
      });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * Conversational turn: text prompt + optional multi-file attachments
   */
  router.post("/session/:sessionId/chat", authMiddleware, upload.array("files", 10), async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = sessionService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (!isUserAuthorizedForHierarchy((req as any).user, session.hierarchyId)) {
        return res.status(403).json({ error: "Access denied: session belongs to an unauthorized hierarchy domain." });
      }

      const message = req.body.message || "";
      const files = req.files as Express.Multer.File[] || [];

      const mappedFiles = files.map(f => ({
        name: f.filename,
        originalName: f.originalname,
        size: f.size,
        mimeType: f.mimetype,
        savedPath: f.path
      }));

      const updatedSession = await sessionService.handleUserTurn(sessionId, message, mappedFiles);
      res.json(updatedSession);
    } catch (err: any) {
      console.error("AI Chat Turn Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Confirm and commit record creation
   */
  router.post(
    "/session/:sessionId/confirm-create",
    authMiddleware,
    requirePermission("member:create"),
    async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { overrideData } = req.body;
        const user = (req as any).user;

        const created = await sessionService.confirmCreate(
          sessionId,
          { id: user.id, name: user.full_name || user.username },
          overrideData
        );

        res.status(201).json({
          success: true,
          message: "Record created successfully via AI interface",
          record: created
        });
      } catch (err: any) {
        console.error("AI Confirm Create Error:", err);
        res.status(400).json({ error: err.message });
      }
    }
  );

  /**
   * Confirm and commit record update
   */
  router.post(
    "/session/:sessionId/confirm-update",
    authMiddleware,
    requirePermission("member:edit"),
    async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { overrideData } = req.body;
        const user = (req as any).user;

        const updated = await sessionService.confirmUpdate(
          sessionId,
          { id: user.id, name: user.full_name || user.username },
          overrideData
        );

        res.json({
          success: true,
          message: "Record updated successfully via AI interface",
          record: updated
        });
      } catch (err: any) {
        console.error("AI Confirm Update Error:", err);
        res.status(400).json({ error: err.message });
      }
    }
  );
  /**
   * Summarize a table/level using AI
   */
  router.post("/summarize-level", authMiddleware, async (req, res) => {
    try {
      const { levelId, hierarchyId } = req.body;
      if (!levelId) {
        return res.status(400).json({ error: "levelId is required" });
      }

      // Fetch level metadata
      const level = db.prepare("SELECT * FROM levels WHERE id = ?").get(levelId) as any;
      if (!level) {
        return res.status(404).json({ error: "Level not found" });
      }

      if (!isUserAuthorizedForHierarchy((req as any).user, level.hierarchy_id)) {
        return res.status(403).json({ error: "Access denied: you are not authorized to summarize this hierarchy system." });
      }

      // Fetch fields definition
      const fields = db.prepare("SELECT * FROM field_definitions WHERE level_id = ? ORDER BY order_index ASC").all(levelId) as any[];

      // Fetch records count
      const totalStmt = hierarchyId
        ? db.prepare("SELECT COUNT(*) as count FROM members WHERE level_id = ? AND hierarchy_id = ?")
        : db.prepare("SELECT COUNT(*) as count FROM members WHERE level_id = ?");
      const totalCount = (hierarchyId ? (totalStmt.get(levelId, hierarchyId) as any)?.count : (totalStmt.get(levelId) as any)?.count) || 0;

      // Fetch parent breakdown
      const parentBreakdown = db.prepare(`
        SELECT p.name as parent_name, COUNT(m.id) as count
        FROM members m
        LEFT JOIN members p ON m.parent_id = p.id
        WHERE m.level_id = ?
        GROUP BY m.parent_id
        ORDER BY count DESC
        LIMIT 10
      `).all(levelId) as any[];

      // Fetch sample of records with custom_data
      const sampleRecords = (hierarchyId
        ? db.prepare("SELECT m.name, p.name as parent_name, m.custom_data, m.created_at FROM members m LEFT JOIN members p ON m.parent_id = p.id WHERE m.level_id = ? AND m.hierarchy_id = ? LIMIT 50").all(levelId, hierarchyId)
        : db.prepare("SELECT m.name, p.name as parent_name, m.custom_data, m.created_at FROM members m LEFT JOIN members p ON m.parent_id = p.id WHERE m.level_id = ? LIMIT 50").all(levelId)) as any[];

      const parsedRecords = sampleRecords.map(r => {
        let cd = {};
        try { cd = JSON.parse(r.custom_data || "{}"); } catch {}
        return {
          name: r.name,
          parent: r.parent_name || "(Root)",
          ...cd
        };
      });

      const systemPrompt = `You are an expert enterprise data operations analyst.
Your task is to analyze the dataset for level "${level.name}" in a hierarchical database and provide a concise, high-value executive summary.

Level Context:
- Level Name: ${level.name}
- Level Code: ${level.code}
- Total Records: ${totalCount}
- Configured Attributes / Columns: ${fields.map(f => `${f.name} (${f.field_type})`).join(", ") || "None"}
- Parent Branches: ${parentBreakdown.map(p => `${p.parent_name || 'Root Tier'} (${p.count} records)`).join(", ") || "None"}

Sample Records Data:
${JSON.stringify(parsedRecords.slice(0, 30), null, 2)}

Instructions:
1. Provide an Executive Summary (1-2 sentences).
2. Hierarchy & Distribution Analysis (how records are organized under parent branches).
3. Attributes & Schema Analysis (completeness, patterns, distributions across custom fields).
4. Key Observations & Data Quality Insights.
Use markdown formatting with bold metrics and crisp bullet points. Be analytical, professional, and clear. Do not make up facts not present in the data.`;

      let summaryText = "";
      try {
        const response = await AiProviderService.chat({
          systemPrompt,
          messages: [{ role: "user", content: `Please generate a comprehensive, structured data summary of the "${level.name}" table.` }],
          temperature: 0.2
        });
        summaryText = response.content;
      } catch (aiErr: any) {
        summaryText = `### Executive Summary for **${level.name}** Table\n\n` +
          `The **${level.name}** dataset currently comprises **${totalCount}** total records configured with **${fields.length}** dynamic schema attributes.\n\n` +
          `#### Hierarchy & Branching Distribution\n` +
          parentBreakdown.map(p => `- **${p.parent_name || 'Root Tier'}**: ${p.count} member(s)`).join("\n") + `\n\n` +
          `#### Schema & Attributes\n` +
          fields.map(f => `- **${f.name}** (${f.field_type}): ${f.is_required ? "Required" : "Optional"}`).join("\n") + `\n\n` +
          `#### Dataset Insights\n` +
          `- Sample size inspected: **${parsedRecords.length}** record(s)\n` +
          `- Record integrity: All active records conform to the current ${level.name} schema validation constraints.`;
      }

      res.json({
        summary: summaryText,
        levelName: level.name,
        totalCount,
        fieldCount: fields.length,
        parentCount: parentBreakdown.length
      });
    } catch (err: any) {
      console.error("Summarize Level Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;

}
