import { Router } from "express";
import fs from "fs";
import { getDatabase, getActiveDbPath, checkpointDatabase } from "../config/database.js";
import { getRealtimeGenerator } from "../services/realtime-generator.service.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Live SQL Database Stats
router.get("/sql/stats", authMiddleware, (req, res) => {
  const db = getDatabase();
  const dbPath = getActiveDbPath() || ":memory:";

  let fileSize = 0;
  let walSize = 0;

  if (dbPath !== ":memory:" && fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    fileSize = stats.size;
    const walPath = `${dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      walSize = fs.statSync(walPath).size;
    }
  }

  // Count records in core tables
  const memberCount = (db.prepare("SELECT COUNT(*) as cnt FROM members").get() as any)?.cnt || 0;
  const auditCount = (db.prepare("SELECT COUNT(*) as cnt FROM audit_logs").get() as any)?.cnt || 0;
  const levelCount = (db.prepare("SELECT COUNT(*) as cnt FROM levels").get() as any)?.cnt || 0;
  const fieldCount = (db.prepare("SELECT COUNT(*) as cnt FROM field_definitions").get() as any)?.cnt || 0;

  res.json({
    engine: "SQLite (Write-Ahead Logging / WAL Mode)",
    database_file: dbPath,
    file_size_bytes: fileSize,
    file_size_formatted: `${(fileSize / 1024).toFixed(2)} KB`,
    wal_size_formatted: `${(walSize / 1024).toFixed(2)} KB`,
    total_records: memberCount,
    total_audit_events: auditCount,
    total_levels: levelCount,
    total_fields: fieldCount,
    persisted_in_real_time: true
  });
});

// Live SQL Tables Metadata
router.get("/sql/tables", authMiddleware, (req, res) => {
  const db = getDatabase();
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `).all() as Array<{ name: string }>;

  const result = tables.map(t => {
    const count = (db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get() as any)?.cnt || 0;
    const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    return {
      table_name: t.name,
      row_count: count,
      columns: cols.map(c => ({
        name: c.name,
        type: c.type,
        not_null: Boolean(c.notnull),
        is_pk: Boolean(c.pk)
      }))
    };
  });

  res.json(result);
});

// Direct Live SQL Query Runner (Read-only SELECT queries)
router.post("/sql/query", authMiddleware, (req, res) => {
  const { sql } = req.body;
  if (!sql || !sql.trim()) {
    return res.status(400).json({ error: "SQL query string is required" });
  }

  const cleanSql = sql.trim();

  // Safety check: Only permit SELECT / PRAGMA / EXPLAIN queries
  if (!/^(SELECT|PRAGMA|EXPLAIN)\b/i.test(cleanSql)) {
    return res.status(400).json({
      error: "For data safety, only read-only queries (SELECT, PRAGMA, EXPLAIN) are permitted in this runner."
    });
  }

  const db = getDatabase();
  const startTime = performance.now();

  try {
    const stmt = db.prepare(cleanSql);
    const rows = stmt.all();
    const durationMs = performance.now() - startTime;

    const columns = rows.length > 0 ? Object.keys(rows[0] as any) : [];

    res.json({
      columns,
      rows: rows.slice(0, 100), // top 100 rows
      total_returned: rows.length,
      duration_ms: Math.round(durationMs * 100) / 100,
      sql: cleanSql
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Real-Time SQL Streamer: Start
router.post("/realtime/start", authMiddleware, (req, res) => {
  const { interval_ms, hierarchy_id } = req.body;
  const db = getDatabase();
  const generator = getRealtimeGenerator(db);
  generator.start(interval_ms || 2000, hierarchy_id);

  res.json({
    message: "Real-time SQL generator started",
    ...generator.getStatus()
  });
});

// Real-Time SQL Streamer: Stop
router.post("/realtime/stop", authMiddleware, (req, res) => {
  const db = getDatabase();
  const generator = getRealtimeGenerator(db);
  generator.stop();

  res.json({
    message: "Real-time SQL generator stopped",
    ...generator.getStatus()
  });
});

// Real-Time SQL Streamer: Generate single or batch immediately
router.post("/realtime/generate", authMiddleware, async (req, res) => {
  const { count = 1, hierarchy_id } = req.body;
  const db = getDatabase();
  const generator = getRealtimeGenerator(db);

  try {
    const events = await generator.generateBatch(Number(count) || 1, hierarchy_id);
    res.json({
      generated_count: events.length,
      events,
      status: generator.getStatus()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real-Time SQL Streamer: Status
router.get("/realtime/status", authMiddleware, (req, res) => {
  const db = getDatabase();
  const generator = getRealtimeGenerator(db);
  res.json(generator.getStatus());
});

export default router;
