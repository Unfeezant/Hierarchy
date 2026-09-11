import { Database } from "better-sqlite3";
import crypto from "crypto";
import { AuditLog } from "../types/index.js";

export class AuditService {
  constructor(private db: Database) {}

  log(entry: {
    userId?: string | null;
    userName: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "MOVE" | "SCHEMA_ADD" | "SCHEMA_UPDATE" | "SCHEMA_DELETE" | "IMPORT";
    entityType: "member" | "level" | "field" | "user" | "role" | "hierarchy";
    entityId: string;
    hierarchyId?: string;
    levelId?: string;
    memberId?: string;
    previousState?: Record<string, any> | null;
    newState?: Record<string, any> | null;
    ipAddress?: string;
  }): AuditLog {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, user_id, user_name, action, entity_type, entity_id,
        hierarchy_id, level_id, member_id, previous_state, new_state,
        ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entry.userId || null,
      entry.userName,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.hierarchyId || null,
      entry.levelId || null,
      entry.memberId || null,
      entry.previousState ? JSON.stringify(entry.previousState) : null,
      entry.newState ? JSON.stringify(entry.newState) : null,
      entry.ipAddress || null,
      now
    );

    return {
      id,
      user_id: entry.userId || null,
      user_name: entry.userName,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      hierarchy_id: entry.hierarchyId,
      level_id: entry.levelId,
      member_id: entry.memberId,
      previous_state: entry.previousState,
      new_state: entry.newState,
      ip_address: entry.ipAddress,
      created_at: now
    };
  }

  query(filters: {
    hierarchyId?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): { items: AuditLog[]; total: number } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.hierarchyId) {
      conditions.push("hierarchy_id = ?");
      params.push(filters.hierarchyId);
    }
    if (filters.entityType) {
      conditions.push("entity_type = ?");
      params.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push("entity_id = ?");
      params.push(filters.entityId);
    }
    if (filters.userId) {
      conditions.push("user_id = ?");
      params.push(filters.userId);
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
    
    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`).get(...params) as { count: number };
    
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const rows = this.db.prepare(`
      SELECT * FROM audit_logs ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    const items: AuditLog[] = rows.map(r => ({
      ...r,
      previous_state: r.previous_state ? JSON.parse(r.previous_state) : null,
      new_state: r.new_state ? JSON.parse(r.new_state) : null,
    }));

    return { items, total: countRow.count };
  }
}

