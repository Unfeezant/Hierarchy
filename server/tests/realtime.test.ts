import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Real-Time SQL Database Persistence & Streamer", () => {
  let app: any;
  let db: any;
  let adminToken: string;
  let hierarchyId: string;
  let lvl1Id: string;
  let lvl2Id: string;
  let parentRecordId: string;

  beforeAll(async () => {
    const appInstance = createApp(":memory:");
    app = appInstance.app;
    db = appInstance.db;

    const authService = new (await import("../src/services/auth.service.js")).AuthService(db);
    const user = authService.createUser({
      username: "rt_admin",
      email: "rt@admin.com",
      password: "password",
      full_name: "Realtime Admin",
      role_id: "role_super_admin"
    });
    adminToken = authService.generateToken(user);

    // Setup hierarchy & levels
    const hRes = await request(app)
      .post("/api/hierarchies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Real-Time Telemetry" });
    hierarchyId = hRes.body.id;

    const l1 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Devices", code: "device", depth_order: 0 });
    lvl1Id = l1.body.id;

    const l2 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Readings", code: "reading", depth_order: 1, allowed_parent_level_ids: [lvl1Id] });
    lvl2Id = l2.body.id;

    // Create a device parent
    const dev = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: lvl1Id, name: "Device Alpha" });
    parentRecordId = dev.body.id;
  });

  it("should persist real-time generated records directly into SQL database", async () => {
    // Generate real-time batch
    const genRes = await request(app)
      .post("/api/realtime/generate")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ count: 5, hierarchy_id: hierarchyId });

    expect(genRes.status).toBe(200);
    expect(genRes.body.generated_count).toBe(5);

    // Verify records exist in SQL database via direct SQL query
    const sqlRes = await request(app)
      .post("/api/sql/query")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sql: `SELECT COUNT(*) as cnt FROM members WHERE hierarchy_id = '${hierarchyId}'`
      });

    expect(sqlRes.status).toBe(200);
    expect(sqlRes.body.rows[0].cnt).toBe(6); // 1 device + 5 readings
  });

  it("should verify live SQL database stats & table metadata", async () => {
    const statsRes = await request(app)
      .get("/api/sql/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.engine).toContain("SQLite");
    expect(statsRes.body.total_records).toBeGreaterThan(0);

    const tablesRes = await request(app)
      .get("/api/sql/tables")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(tablesRes.status).toBe(200);
    const tableNames = tablesRes.body.map((t: any) => t.table_name);
    expect(tableNames).toContain("members");
    expect(tableNames).toContain("levels");
    expect(tableNames).toContain("hierarchies");
    expect(tableNames).toContain("audit_logs");
  });
});
