import { Database } from "better-sqlite3";
import crypto from "crypto";
import { Level } from "../types/index.js";
import { AuditService } from "./audit.service.js";

export class LevelService {
  private auditService: AuditService;

  constructor(private db: Database) {
    this.auditService = new AuditService(db);
  }

  getLevels(hierarchyId: string): Level[] {
    const rows = this.db.prepare(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM members m WHERE m.level_id = l.id) as member_count
      FROM levels l
      WHERE l.hierarchy_id = ?
      ORDER BY l.depth_order ASC, l.name ASC
    `).all(hierarchyId) as any[];

    return rows.map(this.mapRowToLevel);
  }

  getLevel(levelId: string): Level | null {
    const row = this.db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM members m WHERE m.level_id = l.id) as member_count
      FROM levels l
      WHERE l.id = ?
    `).get(levelId) as any;

    return row ? this.mapRowToLevel(row) : null;
  }

  createLevel(
    hierarchyId: string,
    data: {
      name: string;
      code?: string;
      description?: string;
      icon?: string;
      color?: string;
      depth_order?: number;
      allowed_parent_level_ids?: string[];
      display_settings?: Record<string, any>;
    },
    actor: { id: string; name: string }
  ): Level {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const code = data.code || data.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    let depthOrder = data.depth_order;
    if (depthOrder === undefined) {
      const maxOrder = this.db.prepare("SELECT MAX(depth_order) as max_depth FROM levels WHERE hierarchy_id = ?").get(hierarchyId) as any;
      depthOrder = (maxOrder?.max_depth ?? -1) + 1;
    }

    const stmt = this.db.prepare(`
      INSERT INTO levels (
        id, hierarchy_id, name, code, description, icon, color,
        depth_order, allowed_parent_level_ids, display_settings, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      hierarchyId,
      data.name,
      code,
      data.description || null,
      data.icon || "Folder",
      data.color || "#6366f1",
      depthOrder,
      JSON.stringify(data.allowed_parent_level_ids || []),
      JSON.stringify(data.display_settings || {}),
      now,
      now
    );

    const created = this.getLevel(id)!;

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "SCHEMA_ADD",
      entityType: "level",
      entityId: id,
      hierarchyId,
      levelId: id,
      newState: created as any
    });

    return created;
  }

  updateLevel(
    levelId: string,
    data: Partial<Level>,
    actor: { id: string; name: string }
  ): Level {
    const prev = this.getLevel(levelId);
    if (!prev) {
      throw new Error("Level not found");
    }

    const now = new Date().toISOString();
    const name = data.name ?? prev.name;
    const code = data.code ?? prev.code;
    const description = data.description !== undefined ? data.description : prev.description;
    const icon = data.icon ?? prev.icon;
    const color = data.color ?? prev.color;
    const depthOrder = data.depth_order ?? prev.depth_order;
    const allowedParents = data.allowed_parent_level_ids !== undefined
      ? JSON.stringify(data.allowed_parent_level_ids)
      : JSON.stringify(prev.allowed_parent_level_ids);
    const displaySettings = data.display_settings
      ? JSON.stringify(data.display_settings)
      : JSON.stringify(prev.display_settings || {});

    this.db.prepare(`
      UPDATE levels
      SET name = ?, code = ?, description = ?, icon = ?, color = ?,
          depth_order = ?, allowed_parent_level_ids = ?, display_settings = ?, updated_at = ?
      WHERE id = ?
    `).run(name, code, description, icon, color, depthOrder, allowedParents, displaySettings, now, levelId);

    const updated = this.getLevel(levelId)!;

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "SCHEMA_UPDATE",
      entityType: "level",
      entityId: levelId,
      hierarchyId: prev.hierarchy_id,
      levelId,
      previousState: prev as any,
      newState: updated as any
    });

    return updated;
  }

  deleteLevel(levelId: string, actor: { id: string; name: string }): void {
    const prev = this.getLevel(levelId);
    if (!prev) {
      throw new Error("Level not found");
    }

    // Check if there are members in this level
    const count = this.db.prepare("SELECT COUNT(*) as cnt FROM members WHERE level_id = ?").get(levelId) as any;
    if (count?.cnt > 0) {
      throw new Error(`Cannot delete level "${prev.name}" because it contains ${count.cnt} records. Delete or move members first.`);
    }

    this.db.prepare("DELETE FROM levels WHERE id = ?").run(levelId);

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "SCHEMA_DELETE",
      entityType: "level",
      entityId: levelId,
      hierarchyId: prev.hierarchy_id,
      levelId,
      previousState: prev as any
    });
  }

  reorderLevels(hierarchyId: string, orderedLevelIds: string[], actor: { id: string; name: string }): void {
    const tx = this.db.transaction(() => {
      const now = new Date().toISOString();
      for (let i = 0; i < orderedLevelIds.length; i++) {
        this.db.prepare("UPDATE levels SET depth_order = ?, updated_at = ? WHERE id = ? AND hierarchy_id = ?")
          .run(i, now, orderedLevelIds[i], hierarchyId);
      }
    });

    tx();

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "SCHEMA_UPDATE",
      entityType: "hierarchy",
      entityId: hierarchyId,
      hierarchyId,
      newState: { orderedLevelIds }
    });
  }

  private mapRowToLevel(row: any): Level {
    return {
      ...row,
      allowed_parent_level_ids: row.allowed_parent_level_ids ? JSON.parse(row.allowed_parent_level_ids) : [],
      display_settings: row.display_settings ? JSON.parse(row.display_settings) : {},
      member_count: Number(row.member_count || 0)
    };
  }
}

