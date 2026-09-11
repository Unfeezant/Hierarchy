import { describe, it, expect, beforeAll } from "vitest";
import { getDatabase, setDatabase } from "../src/config/database.js";
import { initSchema } from "../src/db/schema.js";
import { MemberService } from "../src/services/member.service.js";
import { HierarchyService } from "../src/services/hierarchy.service.js";
import { LevelService } from "../src/services/level.service.js";
import { AuthService } from "../src/services/auth.service.js";

describe("Performance & Arbitrary Depth Scalability", () => {
  let db: any;
  let memberService: MemberService;
  let hierarchyId: string;
  let levelIds: string[] = [];
  const actor = { id: "perf_user", name: "Performance Tester" };

  beforeAll(() => {
    db = getDatabase(":memory:");
    initSchema(db);
    new AuthService(db).seedDefaultRolesAndPermissions();

    const hierarchyService = new HierarchyService(db);
    const levelService = new LevelService(db);
    memberService = new MemberService(db);

    const h = hierarchyService.createHierarchy({ name: "Deep Enterprise Hierarchy" }, actor);
    hierarchyId = h.id;

    // Create 7 deep levels
    for (let i = 0; i < 7; i++) {
      const parentId = i > 0 ? [levelIds[i - 1]] : [];
      const lvl = levelService.createLevel(
        h.id,
        {
          name: `Tier ${i + 1}`,
          code: `tier_${i + 1}`,
          depth_order: i,
          allowed_parent_level_ids: parentId
        },
        actor
      );
      levelIds.push(lvl.id);
    }
  });

  it("should insert deep hierarchy branch (depth 7) and verify ancestor paths in < 15ms", () => {
    let currentParentId: string | null = null;
    const insertedIds: string[] = [];

    const startTime = performance.now();

    for (let depth = 0; depth < 7; depth++) {
      const record = memberService.createRecord(
        {
          hierarchy_id: hierarchyId,
          level_id: levelIds[depth],
          parent_id: currentParentId,
          name: `Depth Node ${depth}`,
          custom_data: { metric: depth * 10 }
        },
        actor
      );
      currentParentId = record.id;
      insertedIds.push(record.id);
    }

    const deepestId = insertedIds[6];

    // Query ancestors of deepest node
    const t0 = performance.now();
    const ancestors = memberService.getAncestors(deepestId);
    const t1 = performance.now();

    expect(ancestors.length).toBe(6);
    expect(ancestors[0].name).toBe("Depth Node 0");
    expect(t1 - t0).toBeLessThan(15); // Must be under 15ms

    // Query descendants of root node
    const t2 = performance.now();
    const descendants = memberService.getDescendants(insertedIds[0]);
    const t3 = performance.now();

    expect(descendants.length).toBe(6);
    expect(t3 - t2).toBeLessThan(15);
  });

  it("should bulk insert 300 records and query level-wide with filtering and sorting in < 25ms", () => {
    const parentId = memberService.getChildren(null, hierarchyId)[0].id;
    const targetLevelId = levelIds[1];

    const tx = db.transaction(() => {
      for (let i = 0; i < 300; i++) {
        memberService.createRecord(
          {
            hierarchy_id: hierarchyId,
            level_id: targetLevelId,
            parent_id: parentId,
            name: `Member Batch #${i}`,
            custom_data: { index: i, category: i % 2 === 0 ? "Even" : "Odd" }
          },
          actor
        );
      }
    });

    tx();

    const t0 = performance.now();
    const result = memberService.getRecords(targetLevelId, {
      page: 1,
      limit: 20,
      search: "Batch #1",
      sortKey: "name",
      sortOrder: "asc"
    });
    const t1 = performance.now();

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(25);
  });
});
