import { Database } from "better-sqlite3";
import crypto from "crypto";
import { Hierarchy, Level } from "../types/index.js";
import { AuditService } from "./audit.service.js";
import { LevelService } from "./level.service.js";

export interface PyramidTierSummary {
  level: Level;
  member_count: number;
  percentage: number;
}

export class HierarchyService {
  private auditService: AuditService;
  private levelService: LevelService;

  constructor(private db: Database) {
    this.auditService = new AuditService(db);
    this.levelService = new LevelService(db);
  }

  getHierarchies(): Hierarchy[] {
    return this.db.prepare("SELECT * FROM hierarchies ORDER BY name ASC").all() as Hierarchy[];
  }

  getHierarchy(id: string): Hierarchy | null {
    const row = this.db.prepare("SELECT * FROM hierarchies WHERE id = ?").get(id) as any;
    return row || null;
  }

  createHierarchy(
    data: { name: string; description?: string },
    actor: { id: string; name: string }
  ): Hierarchy {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO hierarchies (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, data.name.trim(), data.description || null, now, now);

    const created = this.getHierarchy(id)!;

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "CREATE",
      entityType: "hierarchy",
      entityId: id,
      hierarchyId: id,
      newState: created as any
    });

    return created;
  }

  updateHierarchy(
    id: string,
    data: { name?: string; description?: string },
    actor: { id: string; name: string }
  ): Hierarchy {
    const prev = this.getHierarchy(id);
    if (!prev) throw new Error("Hierarchy not found");

    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name.trim() : prev.name;
    const description = data.description !== undefined ? data.description : prev.description;

    this.db.prepare(`
      UPDATE hierarchies
      SET name = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, now, id);

    const updated = this.getHierarchy(id)!;

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "UPDATE",
      entityType: "hierarchy",
      entityId: id,
      hierarchyId: id,
      previousState: prev as any,
      newState: updated as any
    });

    return updated;
  }

  deleteHierarchy(id: string, actor: { id: string; name: string }): void {
    const prev = this.getHierarchy(id);
    if (!prev) throw new Error("Hierarchy not found");

    this.db.prepare("DELETE FROM hierarchies WHERE id = ?").run(id);

    this.auditService.log({
      userId: actor.id,
      userName: actor.name,
      action: "DELETE",
      entityType: "hierarchy",
      entityId: id,
      hierarchyId: id,
      previousState: prev as any
    });
  }

  getPyramidSummary(hierarchyId: string, scopeMemberId?: string | null): { tiers: PyramidTierSummary[]; totalMembers: number } {
    const levels = this.levelService.getLevels(hierarchyId);
    let totalMembers = 0;
    const tierCounts: { level: Level; count: number }[] = [];

    for (const level of levels) {
      let sql = `SELECT COUNT(*) as count FROM members WHERE level_id = ?`;
      const params: any[] = [level.id];

      if (scopeMemberId) {
        sql += ` AND (id = ? OR path LIKE ?)`;
        params.push(scopeMemberId, `%/${scopeMemberId}/%`);
      }

      const row = this.db.prepare(sql).get(...params) as { count: number };
      const count = Number(row?.count || 0);
      totalMembers += count;
      tierCounts.push({ level, count });
    }

    const tiers: PyramidTierSummary[] = tierCounts.map(tc => ({
      level: tc.level,
      member_count: tc.count,
      percentage: totalMembers > 0 ? Math.round((tc.count / totalMembers) * 100) : 0
    }));

    return { tiers, totalMembers };
  }
}
