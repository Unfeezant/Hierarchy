import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Hierarchy Engine & Data Operations", () => {
  let app: any;
  let db: any;
  let adminToken: string;
  let hierarchyId: string;
  let level1Id: string;
  let level2Id: string;
  let level3Id: string;
  let branchBLevelId: string;

  beforeAll(async () => {
    // Isolated in-memory database for clean test run
    const appInstance = createApp(":memory:");
    app = appInstance.app;
    db = appInstance.db;

    // Login as admin
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin123" });

    // Since in-memory was empty, let us create admin or check user
    let token = loginRes.body.token;
    if (!token) {
      // Seed super admin
      const authService = new (await import("../src/services/auth.service.js")).AuthService(db);
      const user = authService.createUser({
        username: "test_admin",
        email: "test@admin.com",
        password: "password",
        full_name: "Test Admin",
        role_id: "role_super_admin"
      });
      token = authService.generateToken(user);
    }
    adminToken = token;
  });

  it("should create a new hierarchy", async () => {
    const res = await request(app)
      .post("/api/hierarchies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Galactic Organization", description: "Cosmic test hierarchy" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Galactic Organization");
    hierarchyId = res.body.id;
  });

  it("should create arbitrary levels with branching capabilities", async () => {
    // Level 1: Universe
    const res1 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Universe", code: "universe", depth_order: 0, allowed_parent_level_ids: [] });
    expect(res1.status).toBe(201);
    level1Id = res1.body.id;

    // Level 2: Galaxy (child of Universe)
    const res2 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Galaxy", code: "galaxy", depth_order: 1, allowed_parent_level_ids: [level1Id] });
    expect(res2.status).toBe(201);
    level2Id = res2.body.id;

    // Branch Child 1: Star System (child of Galaxy)
    const res3 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Star System", code: "star_system", depth_order: 2, allowed_parent_level_ids: [level2Id] });
    expect(res3.status).toBe(201);
    level3Id = res3.body.id;

    // Branch Child 2: Space Station (also child of Galaxy - testing multiple child types!)
    const resBranch = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Space Station", code: "station", depth_order: 2, allowed_parent_level_ids: [level2Id] });
    expect(resBranch.status).toBe(201);
    branchBLevelId = resBranch.body.id;
  });

  it("should create records across arbitrary depth and branches", async () => {
    // Root Universe
    const root = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level1Id, name: "Observable Universe" });
    expect(root.status).toBe(201);
    const rootId = root.body.id;

    // Galaxy under Universe
    const galaxy = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level2Id, parent_id: rootId, name: "Milky Way" });
    expect(galaxy.status).toBe(201);
    const galaxyId = galaxy.body.id;

    // Star System under Galaxy
    const starSys = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level3Id, parent_id: galaxyId, name: "Solar System" });
    expect(starSys.status).toBe(201);
    expect(starSys.body.depth).toBe(2);
    expect(starSys.body.path).toContain(rootId);
    expect(starSys.body.path).toContain(galaxyId);

    // Space Station also under Galaxy (multiple child types branching)
    const station = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: branchBLevelId, parent_id: galaxyId, name: "Citadel Station" });
    expect(station.status).toBe(201);

    // Verify children of Galaxy includes both Star System and Station
    const childrenRes = await request(app)
      .get(`/api/members/${galaxyId}/children`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(childrenRes.status).toBe(200);
    expect(childrenRes.body.length).toBe(2);
  });

  it("should prevent cyclic hierarchy when moving records", async () => {
    // Create node A -> node B -> node C
    const a = await request(app).post("/api/members").set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level1Id, name: "Node A" });
    const b = await request(app).post("/api/members").set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level2Id, parent_id: a.body.id, name: "Node B" });
    const c = await request(app).post("/api/members").set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level3Id, parent_id: b.body.id, name: "Node C" });

    // Try moving A into C (descendant) -> MUST FAIL
    const moveRes = await request(app)
      .post(`/api/members/${a.body.id}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ new_parent_id: c.body.id });

    expect(moveRes.status).toBe(400);
    expect(moveRes.body.error).toContain("cyclic");
  });

  it("should cascade delete member and descendants", async () => {
    // Create parent and child
    const p = await request(app).post("/api/members").set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level1Id, name: "To Delete Parent" });
    const c = await request(app).post("/api/members").set("Authorization", `Bearer ${adminToken}`)
      .send({ hierarchy_id: hierarchyId, level_id: level2Id, parent_id: p.body.id, name: "To Delete Child" });

    // Delete parent
    const delRes = await request(app)
      .delete(`/api/members/${p.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deletedCount).toBe(2);

    // Child must no longer exist
    const childCheck = await request(app)
      .get(`/api/members/${c.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(childCheck.status).toBe(404);
  });
});
