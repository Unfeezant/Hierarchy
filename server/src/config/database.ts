import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let dbInstance: Database.Database | null = null;
let activeDbPath: string | null = null;

export function setDatabase(db: Database.Database | null): void {
  dbInstance = db;
}

export function getActiveDbPath(): string | null {
  return activeDbPath;
}

export function getDatabase(dbPath?: string): Database.Database {
  if (dbInstance && !dbPath) {
    return dbInstance;
  }

  let targetPath = dbPath || process.env.DATABASE_PATH;

  if (!targetPath) {
    // Check if running from root or server folder
    const serverPath = path.resolve(process.cwd(), "server/data/hierarchy.db");
    const localPath = path.resolve(process.cwd(), "data/hierarchy.db");

    if (fs.existsSync(serverPath)) {
      targetPath = serverPath;
    } else if (fs.existsSync(localPath)) {
      targetPath = localPath;
    } else if (path.basename(process.cwd()) === "server") {
      targetPath = localPath;
    } else {
      targetPath = serverPath;
    }
  }

  if (targetPath !== ":memory:") {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);
  
  // Real-time SQL reliability pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  
  activeDbPath = targetPath;
  dbInstance = db;
  
  return db;
}

export function checkpointDatabase(): void {
  if (dbInstance && activeDbPath !== ":memory:") {
    try {
      dbInstance.pragma("wal_checkpoint(PASSIVE)");
    } catch {
      // Ignore checkpoint error
    }
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma("wal_checkpoint(TRUNCATE)");
      dbInstance.close();
    } finally {
      dbInstance = null;
      activeDbPath = null;
    }
  }
}
