import { Database } from "better-sqlite3";
import crypto from "crypto";
import { Member } from "../types/index.js";
import { FieldService } from "./field.service.js";
import { AuditService } from "./audit.service.js";

export interface RecordQueryOptions {
  page?: number;
  limit?: number;
  sortKey?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  filters?: Record<string, any>;
  scopeMemberId?: string | null; // null for global
  hierarchyId?: string;
}

export class MemberService {
  private fieldService: FieldService;
  private auditService: AuditService;

  constructor(private db: Database) {
    this.fieldService = new FieldService(db);
    this.auditService = new AuditService(db);
  }

  // Canonical: getRecord(recordId)
  getRecord(memberId: string): Member | null {
    const row = this.db.prepare(`
      SELECT m.*,
        l.name as level_name,
        l.code as level_code,
        l.color as level_color,
        p.name as parent_name,
        (SELECT COUNT(*) FROM members c WHERE c.parent_id = m.id) as children_count
      FROM members m
      JOIN levels l ON m.level_id = l.id
      LEFT JOIN members p ON m.parent_id = p.id
      WHERE m.id = ?
    `).get(memberId) as any;

    return row ? this.mapRowToMember(row) : null;
  }

  // Canonical alias
  getMember(memberId: string): Member | null {
    return this.getRecord(memberId);
  }

  // Canonical: getParent(recordId)
  getParent(memberId: string): Member | null {
    const current = this.getRecord(memberId);
    if (!current || !current.parent_id) return null;
    return this.getRecord(current.parent_id);
  }

  // Canonical: getChildren(recordId, options)
  getChildren(memberId: string | null, hierarchyId?: string, scopeMemberId?: string | null): Member[] {
    let sql: string;
    const params: any[] = [];

    if (memberId === null) {
      // Root level records (parent_id IS NULL)
      sql = `
        SELECT m.*,
          l.name as level_name,
          l.code as level_code,
          l.color as level_color,
          NULL as parent_name,
          (SELECT COUNT(*) FROM members c WHERE c.parent_id = m.id) as children_count
        FROM members m
        JOIN levels l ON m.level_id = l.id
        WHERE m.parent_id IS NULL
      `;
      if (hierarchyId) {
        sql += ` AND m.hierarchy_id = ?`;
        params.push(hierarchyId);
      }
    } else {
      sql = `
        SELECT m.*,
          l.name as level_name,
          l.code as level_code,
          l.color as level_color,
          p.name as parent_name,
          (SELECT COUNT(*) FROM members c WHERE c.parent_id = m.id) as children_count
        FROM members m
        JOIN levels l ON m.level_id = l.id
        LEFT JOIN members p ON m.parent_id = p.id
        WHERE m.parent_id = ?
      `;
      params.push(memberId);
    }

    // Apply branch scope if user is restricted
    if (scopeMemberId) {
      sql += ` AND (m.id = ? OR m.path LIKE ? OR ? LIKE "%" || m.id || "%")`;
      params.push(scopeMemberId, `%/${scopeMemberId}/%`, scopeMemberId);
    }

    sql += ` ORDER BY m.name ASC`;

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(this.mapRowToMember);
  }

  // Canonical: getAncestors(recordId)
  getAncestors(memberId: string): Member[] {
    const current = this.getRecord(memberId);
    if (!current) return [];

    // Extract path segment IDs: e.g. "/id1/id2/id3/" -> ["id1", "id2", "id3"]
    const ids = current.path.split("/").filter(Boolean);
    if (ids.length <= 1) return []; // Only current node or none

    const ancestorIds = ids.filter(id => id !== memberId);
    if (ancestorIds.length === 0) return [];

    const placeholders = ancestorIds.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT m.*,
        l.name as level_name,
        l.code as level_code,
        l.color as level_color,
        p.name as parent_name,
        (SELECT COUNT(*) FROM members c WHERE c.parent_id = m.id) as children_count
      FROM members m
      JOIN levels l ON m.level_id = l.id
      LEFT JOIN members p ON m.parent_id = p.id
      WHERE m.id IN (${placeholders})
      ORDER BY m.depth ASC
    `).all(...ancestorIds) as any[];

    return rows.map(this.mapRowToMember);
  }

  // Canonical: getDescendants(recordId, options)
  getDescendants(memberId: string, limit = 1000): Member[] {
    const current = this.getRecord(memberId);
    if (!current) return [];

    const rows = this.db.prepare(`
      SELECT m.*,
        l.name as level_name,
        l.code as level_code,
        l.color as level_color,
        p.name as parent_name,
        (SELECT COUNT(*) FROM members c WHERE c.parent_id = m.id) as children_count
      FROM members m
      JOIN levels l ON m.level_id = l.id
      LEFT JOIN members p ON m.parent_id = p.id
      WHERE m.path LIKE ? AND m.id != ?
      ORDER BY m.depth ASC, m.name ASC
      LIMIT ?
    `).all(`${current.path}%`, memberId, limit) as any[];

    return rows.map(this.mapRowToMember);
  }

  // Canonical: getRecords(levelId) & filterRecords & sortRecords (Level-Wide View)
  getRecords(levelId: string, options: RecordQueryOptions = {}): { items: Member[]; total: number } {
    const conditions: string[] = ["m.level_id = ?"];
    const params: any[] = [levelId];

    if (options.hierarchyId) {
      conditions.push("m.hierarchy_id = ?");
      params.push(options.hierarchyId);
    }

    // Branch-scoped filter
    if (options.scopeMemberId) {
      conditions.push(`(m.id = ? OR m.path LIKE ?)`);
      params.push(options.scopeMemberId, `%/${options.scopeMemberId}/%`);
    }

    // General text search
    if (options.search && options.search.trim()) {
      conditions.push(`(m.name LIKE ? OR m.custom_data LIKE ?)`);
      const term = `%${options.search.trim()}%`;
      params.push(term, term);
    }

    // Custom field filters: { "department": "Science", "status": "Active" }
    if (options.filters && Object.keys(options.filters).length > 0) {
      for (const [key, val] of Object.entries(options.filters)) {
        if (val !== undefined && val !== null && val !== "") {
          conditions.push(`json_extract(m.custom_data, '$.' || ?) LIKE ?`);
          params.push(key, `%${val}%`);
        }
      }
    }

    const whereClause = "WHERE " + conditions.join(" AND ");

    // Count total records matching criteria
    const countRow = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM members m
      ${whereClause}
    `).get(...params) as { count: number };

    // Sorting
    let orderBy = "m.name ASC";
    if (options.sortKey) {
      const order = options.sortOrder?.toLowerCase() === "desc" ? "DESC" : "ASC";
      if (options.sortKey === "name" || options.sortKey === "created_at" || options.sortKey === "updated_at") {
        orderBy = `m.${options.sortKey} ${order}`;
      } else {
        // Sort by dynamic json field
        orderBy = `json_extract(m.custom_data, '$.' || '${options.sortKey.replace(/[^a-zA-Z0-9_]/g, "")}') ${order}`;
      }
    }

    const limit = options.limit ?? 50;
    const offset = ((options.page ?? 1) - 1) * limit;

    const rows = this.db.prepare(`
      SELECT m.*,
        l.name as level_name,
        l.code as level_code,
        l.color as level_color,
        p.name as parent_name,
        (SELECT COUNT(*) FROM members c WHERE c.parent_id = m.id) as children_count
      FROM members m
      JOIN levels l ON m.level_id = l.id
      LEFT JOIN members p ON m.parent_id = p.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    return {
      items: rows.map(this.mapRowToMember),
      total: countRow.count
    };
  }

  // Canonical: searchRecords()
  searchRecords(
    query: string,
    options: { hierarchyId?: string; levelId?: string; scopeMemberId?: string | null; limit?: number } = {}
  ): Array<Member & { ancestors: Array<{ id: string; name: string; level_name: string }> }> {
    if (!query || !query.trim()) return [];

    const conditions: string[] = ["(m.name LIKE ? OR m.custom_data LIKE ?)"];
    const term = `%${query.trim()}%`;
    const params: any[] = [term, term];

    if (options.hierarchyId) {
      conditions.push("m.hierarchy_id = ?");
      params.push(options.hierarchyId);
    }
    if (options.levelId) {
      conditions.push("m.level_id = ?");
      params.push(options.levelId);
    }
    if (options.scopeMemberId) {
      conditions.push(`(m.id = ? OR m.path LIKE ?)`);
      params.push(options.scopeMemberId, `%/${options.scopeMemberId}/%`);
    }

    const limit = options.limit || 20;

    const rows = this.db.prepare(`
      SELECT m.*,
        l.name as level_name,
        l.code as level_code,
        l.color as level_color,
        p.name as parent_name,
        (SELECT COUNT(*) FROM members c WHERE c.parent_id = m.id) as children_count
      FROM members m
      JOIN levels l ON m.level_id = l.id
      LEFT JOIN members p ON m.parent_id = p.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY m.depth ASC, m.name ASC
      LIMIT ?
    `).all(...params, limit) as any[];

    return rows.map(row => {
      const member = this.mapRowToMember(row);
      const ancestors = this.getAncestors(member.id).map(a => ({
        id: a.id,
        name: a.name,
        level_name: a.level_name || ""
      }));
      return {
        ...member,
        ancestors
      };
    });
  }

  // Canonical: createRecord(data)
  createRecord(
    data: {
      hierarchy_id: string;
      level_id: string;
      parent_id?: string | null;
      name: string;
      custom_data?: Record<string, any>;
    },
    actor: { id: string; name: string }
  ): Member {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Fetch level definition to verify parent level constraints
    const level = this.db.prepare("SELECT * FROM levels WHERE id = ?").get(data.level_id) as any;
    if (!level) {
      throw new Error(`Level with ID ${data.level_id} does not exist`);
    }

    const allowedParents: string[] = level.allowed_parent_level_ids ? JSON.parse(level.allowed_parent_level_ids) : [];

    let path = `/${id}/`;
    let depth = 0;
    let parentName: string | null = null;

    if (data.parent_id) {
      const parent = this.getRecord(data.parent_id);
      if (!parent) {
        throw new Error(`Parent member with ID ${data.parent_id} does not exist`);
      }
      if (parent.hierarchy_id !== data.hierarchy_id) {
        throw new Error("Parent member belongs to a different hierarchy");
      }

      // Check if parent level is in allowed_parent_level_ids
      if (allowedParents.length > 0 && !allowedParents.includes(parent.level_id)) {
        throw new Error(`Cannot add member of level "${level.name}" under parent of level "${parent.level_name}". Allowed parent levels: ${allowedParents.join(", ")}`);
      }

      path = `${parent.path}${id}/`;
      depth = parent.depth + 1;
      parentName = parent.name;
    }

    // Validate dynamic fields
    const validation = this.fieldService.validateAndTransformCustomData(data.level_id, data.custom_data || {}, false);
    if (!validation.valid) {
      throw new Error(`Schema validation failed: ${validation.errors.join("; ")}`);
    }

    const tx = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO members (
          id, hierarchy_id, level_id, parent_id, name, path,
          depth, custom_data, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        data.hierarchy_id,
        data.level_id,
        data.parent_id || null,
        data.name.trim(),
        path,
        depth,
        JSON.stringify(validation.data),
        actor.id,
        actor.id,
        now,
        now
      );

      this.auditService.log({
        userId: actor.id,
        userName: actor.name,
        action: "CREATE",
        entityType: "member",
        entityId: id,
        hierarchyId: data.hierarchy_id,
        levelId: data.level_id,
        memberId: id,
        newState: {
          id,
          name: data.name,
          parent_id: data.parent_id,
          parent_name: parentName,
          custom_data: validation.data
        }
      });
    });

    tx();

    return this.getRecord(id)!;
  }

  // Canonical: updateRecord(recordId, data)
  updateRecord(
    memberId: string,
    data: {
      name?: string;
      custom_data?: Record<string, any>;
    },
    actor: { id: string; name: string }
  ): Member {
    const prev = this.getRecord(memberId);
    if (!prev) {
      throw new Error(`Member with ID ${memberId} not found`);
    }

    const now = new Date().toISOString();
    const newName = data.name !== undefined ? data.name.trim() : prev.name;
    let newCustomData = prev.custom_data;

    if (data.custom_data) {
      // Merge with existing custom data
      const merged = { ...prev.custom_data, ...data.custom_data };
      const validation = this.fieldService.validateAndTransformCustomData(prev.level_id, merged, true);
      if (!validation.valid) {
        throw new Error(`Schema validation failed: ${validation.errors.join("; ")}`);
      }
      newCustomData = validation.data;
    }

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE members
        SET name = ?, custom_data = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(newName, JSON.stringify(newCustomData), actor.id, now, memberId);

      this.auditService.log({
        userId: actor.id,
        userName: actor.name,
        action: "UPDATE",
        entityType: "member",
        entityId: memberId,
        hierarchyId: prev.hierarchy_id,
        levelId: prev.level_id,
        memberId,
        previousState: { name: prev.name, custom_data: prev.custom_data },
        newState: { name: newName, custom_data: newCustomData }
      });
    });

    tx();

    return this.getRecord(memberId)!;
  }

  // Canonical: moveRecord(recordId, newParentId)
  moveRecord(
    memberId: string,
    newParentId: string | null,
    actor: { id: string; name: string }
  ): Member {
    const member = this.getRecord(memberId);
    if (!member) {
      throw new Error(`Member with ID ${memberId} not found`);
    }

    // If parent is unchanged, return
    if (member.parent_id === newParentId) {
      return member;
    }

    let newPath: string;
    let newDepth: number;

    if (newParentId === null) {
      // Moving to root
      newPath = `/${memberId}/`;
      newDepth = 0;
    } else {
      // Verify new parent exists
      const newParent = this.getRecord(newParentId);
      if (!newParent) {
        throw new Error(`Target parent member with ID ${newParentId} not found`);
      }

      // Check for hierarchy cycle: newParent cannot be the member itself or inside member's subtree!
      if (newParentId === memberId) {
        throw new Error("Cannot move a member to be a child of itself");
      }
      if (newParent.path.startsWith(member.path)) {
        throw new Error("Cannot move a member into one of its own descendants (cyclic hierarchy)");
      }

      // Check allowed parent level constraints
      const level = this.db.prepare("SELECT * FROM levels WHERE id = ?").get(member.level_id) as any;
      const allowedParents: string[] = level.allowed_parent_level_ids ? JSON.parse(level.allowed_parent_level_ids) : [];
      if (allowedParents.length > 0 && !allowedParents.includes(newParent.level_id)) {
        throw new Error(`Cannot move member of level "${member.level_name}" under parent of level "${newParent.level_name}"`);
      }

      newPath = `${newParent.path}${memberId}/`;
      newDepth = newParent.depth + 1;
    }

    const oldPath = member.path;
    const depthDelta = newDepth - member.depth;
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      // 1. Update the moved member
      this.db.prepare(`
        UPDATE members
        SET parent_id = ?, path = ?, depth = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(newParentId, newPath, newDepth, actor.id, now, memberId);

      // 2. Recursively update all descendants in a single transactional query using prefix replacement
      const descendants = this.db.prepare(`
        SELECT id, path, depth FROM members
        WHERE path LIKE ? AND id != ?
      `).all(`${oldPath}%`, memberId) as Array<{ id: string; path: string; depth: number }>;

      for (const desc of descendants) {
        const updatedDescPath = newPath + desc.path.slice(oldPath.length);
        const updatedDescDepth = desc.depth + depthDelta;
        this.db.prepare(`
          UPDATE members
          SET path = ?, depth = ?, updated_at = ?
          WHERE id = ?
        `).run(updatedDescPath, updatedDescDepth, now, desc.id);
      }

      this.auditService.log({
        userId: actor.id,
        userName: actor.name,
        action: "MOVE",
        entityType: "member",
        entityId: memberId,
        hierarchyId: member.hierarchy_id,
        levelId: member.level_id,
        memberId,
        previousState: { parent_id: member.parent_id, path: member.path, depth: member.depth },
        newState: { parent_id: newParentId, path: newPath, depth: newDepth }
      });
    });

    tx();

    return this.getRecord(memberId)!;
  }

  // Canonical: deleteRecord(recordId)
  deleteRecord(memberId: string, actor: { id: string; name: string }): { deletedCount: number } {
    const member = this.getRecord(memberId);
    if (!member) {
      throw new Error(`Member with ID ${memberId} not found`);
    }

    let deletedCount = 0;

    const tx = this.db.transaction(() => {
      // Fetch all descendants to log count
      const countRow = this.db.prepare(`
        SELECT COUNT(*) as count FROM members
        WHERE path LIKE ?
      `).get(`${member.path}%`) as { count: number };

      deletedCount = countRow.count;

      // Delete the member and all descendants (materialized path makes this atomic & safe)
      this.db.prepare("DELETE FROM members WHERE path LIKE ?").run(`${member.path}%`);

      this.auditService.log({
        userId: actor.id,
        userName: actor.name,
        action: "DELETE",
        entityType: "member",
        entityId: memberId,
        hierarchyId: member.hierarchy_id,
        levelId: member.level_id,
        memberId,
        previousState: {
          id: member.id,
          name: member.name,
          deleted_descendants_count: deletedCount - 1
        }
      });
    });

    tx();

    return { deletedCount };
  }

  private mapRowToMember(row: any): Member {
    return {
      ...row,
      custom_data: row.custom_data ? JSON.parse(row.custom_data) : {},
      children_count: Number(row.children_count || 0),
      depth: Number(row.depth || 0)
    };
  }
}
