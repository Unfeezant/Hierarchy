import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Strict Backend RBAC & Hierarchical Scope Security", () => {
  let app: any;
  let adminToken: string;
  let schoolAManagerToken: string;
  let viewerToken: string;
  let schoolAId: string;
  let schoolBId: string;
  let teacherAId: string;
  let teacherBId: string;
  let lvlTeacherId: string;

  beforeAll(async () => {
    const appInstance = createApp(":memory:");
    app = appInstance.app;
    const db = appInstance.db;

    const authService = new (await import("../src/services/auth.service.js")).AuthService(db);
    const hierarchyService = new (await import("../src/services/hierarchy.service.js")).HierarchyService(db);
    const levelService = new (await import("../src/services/level.service.js")).LevelService(db);
    const memberService = new (await import("../src/services/member.service.js")).MemberService(db);

    // 1. Admin
    const adminUser = authService.createUser({
      username: "admin_user",
      email: "admin@corp.com",
      password: "password",
      full_name: "Super Admin",
      role_id: "role_super_admin"
    });
    adminToken = authService.generateToken(adminUser);
    const adminActor = { id: adminUser.id, name: adminUser.full_name };

    // Create hierarchy & levels
    const h = hierarchyService.createHierarchy({ name: "School System" }, adminActor);
    const lvlSchool = levelService.createLevel(h.id, { name: "School", code: "school", depth_order: 0 }, adminActor);
    const lvlTeacher = levelService.createLevel(h.id, { name: "Teacher", code: "teacher", depth_order: 1 }, adminActor);
    lvlTeacherId = lvlTeacher.id;

    // Create School A and School B
    const schoolA = memberService.createRecord({ hierarchy_id: h.id, level_id: lvlSchool.id, name: "School A" }, adminActor);
    const schoolB = memberService.createRecord({ hierarchy_id: h.id, level_id: lvlSchool.id, name: "School B" }, adminActor);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    // Create Teacher under School A and School B
    const teacherA = memberService.createRecord({ hierarchy_id: h.id, level_id: lvlTeacher.id, parent_id: schoolA.id, name: "Teacher Alpha" }, adminActor);
    const teacherB = memberService.createRecord({ hierarchy_id: h.id, level_id: lvlTeacher.id, parent_id: schoolB.id, name: "Teacher Beta" }, adminActor);
    teacherAId = teacherA.id;
    teacherBId = teacherB.id;

    // 2. Manager strictly scoped to School A
    const managerUser = authService.createUser({
      username: "mgr_school_a",
      email: "mgr@schoola.com",
      password: "password",
      full_name: "School A Manager",
      role_id: "role_manager",
      scopes: [{ hierarchy_id: h.id, member_id: schoolA.id, access_level: "manager" }]
    });
    schoolAManagerToken = authService.generateToken(managerUser);

    // 3. Viewer strictly scoped to School A
    const viewerUser = authService.createUser({
      username: "viewer_user",
      email: "viewer@schoola.com",
      password: "password",
      full_name: "Read Only Viewer",
      role_id: "role_viewer",
      scopes: [{ hierarchy_id: h.id, member_id: schoolA.id, access_level: "viewer" }]
    });
    viewerToken = authService.generateToken(viewerUser);
  });

  it("should allow Super Admin to access all schools and teachers", async () => {
    const resA = await request(app).get(`/api/members/${schoolAId}`).set("Authorization", `Bearer ${adminToken}`);
    const resB = await request(app).get(`/api/members/${schoolBId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
  });

  it("should allow School A Manager to view records in School A branch", async () => {
    const res = await request(app).get(`/api/members/${teacherAId}`).set("Authorization", `Bearer ${schoolAManagerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Teacher Alpha");
  });

  it("should REJECT direct API access when School A Manager tries to view School B record (IDOR Prevention)", async () => {
    const res = await request(app).get(`/api/members/${teacherBId}`).set("Authorization", `Bearer ${schoolAManagerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("branch scope");
  });

  it("should REJECT creating a child under an unauthorized branch", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${schoolAManagerToken}`)
      .send({
        hierarchy_id: "any",
        level_id: lvlTeacherId,
        parent_id: schoolBId, // Unauthorized parent!
        name: "Intruder Teacher"
      });

    expect(res.status).toBe(403);
  });

  it("should REJECT write operations for Viewer (Read-Only enforcement)", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        hierarchy_id: "any",
        level_id: lvlTeacherId,
        parent_id: schoolAId,
        name: "Unauthorized Creation"
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Missing required permission");
  });
});
