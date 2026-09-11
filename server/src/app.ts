import "dotenv/config";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getDatabase } from "./config/database.js";
import { initSchema } from "./db/schema.js";
import { AuthService } from "./services/auth.service.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import guestRoutes from "./routes/guest.routes.js";
import hierarchyRoutes from "./routes/hierarchy.routes.js";
import levelRoutes from "./routes/level.routes.js";
import fieldRoutes from "./routes/field.routes.js";
import memberRoutes from "./routes/member.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import importExportRoutes from "./routes/import-export.routes.js";
import sqlRoutes from "./routes/sql.routes.js";
import { createAiRoutes } from "./routes/ai.routes.js";

dotenv.config();

export function createApp(dbPath?: string) {
  const app = express();
  const db = getDatabase(dbPath);

  // Initialize schema & system permissions/roles
  initSchema(db);
  const authService = new AuthService(db);
  authService.seedDefaultRolesAndPermissions();

  app.use(cors());
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));

  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/guest", guestRoutes);
  app.use("/api/hierarchies", hierarchyRoutes);
  app.use("/api", levelRoutes);
  app.use("/api", fieldRoutes);
  app.use("/api", memberRoutes);
  app.use("/api/audit-logs", auditRoutes);
  app.use("/api", importExportRoutes);
  app.use("/api", sqlRoutes);
  app.use("/api/ai", createAiRoutes(db));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Serve frontend build in production / deployment
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDistPath = path.resolve(__dirname, "../../client/dist");
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      res.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  return { app, db };
}

// Start server if directly executed
const isDirectRun = !process.env.VITEST && process.env.NODE_ENV !== "test";
if (isDirectRun) {
  const { app } = createApp();
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`?? Hierarchy Pyramid Server running on http://localhost:${PORT}`);
  });
}
