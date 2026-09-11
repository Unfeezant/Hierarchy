import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("AI Conversational Record Creation & Editing Engine", () => {
  let app: any;
  let db: any;
  let adminToken: string;
  let guestToken: string;
  let hierarchyId: string;
  let companyLevelId: string;
  let teamLevelId: string;
  let employeeLevelId: string;
  let teamMemberId: string;

  beforeAll(async () => {
    const appInstance = createApp(":memory:");
    app = appInstance.app;
    db = appInstance.db;

    const authService = new (await import("../src/services/auth.service.js")).AuthService(db);
    
    // Create admin user
    const adminUser = authService.createUser({
      username: "ai_admin",
      email: "ai_admin@test.com",
      password: "password",
      full_name: "AI Admin",
      role_id: "role_super_admin"
    });
    adminToken = authService.generateToken(adminUser);

    // Create guest user
    const guestUser = authService.createUser({
      username: "ai_guest",
      email: "ai_guest@test.com",
      password: "password",
      full_name: "AI Guest",
      role_id: "role_viewer"
    });
    guestToken = authService.generateToken(guestUser);

    // 1. Create test hierarchy: Company -> Team -> Employee
    const h = await request(app)
      .post("/api/hierarchies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Enterprise Corp" });
    hierarchyId = h.body.id;

    const l1 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Company", code: "company", depth_order: 0, allowed_parent_level_ids: [] });
    companyLevelId = l1.body.id;

    const l2 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Team", code: "team", depth_order: 1, allowed_parent_level_ids: [companyLevelId] });
    teamLevelId = l2.body.id;

    const l3 = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Employee", code: "employee", depth_order: 2, allowed_parent_level_ids: [teamLevelId] });
    employeeLevelId = l3.body.id;

    // 2. Configure Employee fields (as specified in prompt requirement 31)
    await request(app)
      .post(`/api/levels/${employeeLevelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Name", key: "name", field_type: "text", is_required: true });

    await request(app)
      .post(`/api/levels/${employeeLevelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Employee ID", key: "emp_id", field_type: "text", is_required: true });

    await request(app)
      .post(`/api/levels/${employeeLevelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Department", key: "department", field_type: "text", is_required: true });

    await request(app)
      .post(`/api/levels/${employeeLevelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Job Title", key: "job_title", field_type: "text", is_required: true });

    await request(app)
      .post(`/api/levels/${employeeLevelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Email", key: "email", field_type: "email", is_required: true });

    await request(app)
      .post(`/api/levels/${employeeLevelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Phone", key: "phone", field_type: "phone", is_required: false });

    await request(app)
      .post(`/api/levels/${employeeLevelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Salary", key: "salary", field_type: "number", is_required: false });

    // 3. Create parent records
    const compRes = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        hierarchy_id: hierarchyId,
        level_id: companyLevelId,
        name: "Enterprise Global"
      });

    const teamRes = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        hierarchy_id: hierarchyId,
        level_id: teamLevelId,
        parent_id: compRes.body.id,
        name: "Backend Core Team"
      });
    teamMemberId = teamRes.body.id;
  });

  it("should check AI status and discover local models", async () => {
    const res = await request(app).get("/api/ai/status");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("available");
    expect(res.body).toHaveProperty("activeModel");
  });

  it("should start a conversational creation session and list missing required fields", async () => {
    const res = await request(app)
      .post("/api/ai/session")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        hierarchyId,
        targetLevelId: employeeLevelId,
        parentId: teamMemberId,
        mode: "create"
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.targetLevelId).toBe(employeeLevelId);
    expect(res.body.parentId).toBe(teamMemberId);
    expect(res.body.missingRequired.length).toBeGreaterThanOrEqual(4);
    expect(res.body.isReadyForConfirmation).toBe(false);
  });

  it("should process partial input (Sarah Khan), not invent missing fields, and ask follow-up questions", async () => {
    // Start session
    const sessRes = await request(app)
      .post("/api/ai/session")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        hierarchyId,
        targetLevelId: employeeLevelId,
        parentId: teamMemberId,
        mode: "create"
      });
    const sessionId = sessRes.body.id;

    // Step 1: User provides partial information
    // 'Add Sarah Khan. She is a Senior Developer in Engineering.'
    const turn1 = await request(app)
      .post(`/api/ai/session/${sessionId}/chat`)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("message", "Add Sarah Khan. She is a Senior Developer in Engineering.");

    expect(turn1.status).toBe(200);
    const body1 = turn1.body;

    // Verify extracted fields
    expect(body1.currentExtracted.name).toBe("Sarah Khan");
    expect(body1.currentExtracted.job_title).toBe("Senior Developer");
    expect(body1.currentExtracted.department).toBe("Engineering");

    // Verify required missing fields: Employee ID and Email must NOT be invented!
    expect(body1.missingRequired).toContain("Employee ID");
    expect(body1.missingRequired).toContain("Email");
    expect(body1.isReadyForConfirmation).toBe(false);

    // Step 2: User provides missing required fields: 'EMP-501, sarah@example.com'
    const turn2 = await request(app)
      .post(`/api/ai/session/${sessionId}/chat`)
      .set("Authorization", `Bearer ${adminToken}`)
      .field("message", "EMP-501, sarah@example.com");

    expect(turn2.status).toBe(200);
    const body2 = turn2.body;

    // Verify all required fields are now satisfied
    expect(body2.currentExtracted.emp_id).toBe("EMP-501");
    expect(body2.currentExtracted.email).toBe("sarah@example.com");
    expect(body2.missingRequired.length).toBe(0);
    expect(body2.isReadyForConfirmation).toBe(true);

    // Step 3: Confirm create record
    const confirmRes = await request(app)
      .post(`/api/ai/session/${sessionId}/confirm-create`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.success).toBe(true);
    const createdMember = confirmRes.body.record;
    expect(createdMember.name).toBe("Sarah Khan");
    expect(createdMember.parent_id).toBe(teamMemberId);
    expect(createdMember.level_id).toBe(employeeLevelId);
    expect(createdMember.custom_data.emp_id).toBe("EMP-501");
    expect(createdMember.custom_data.department).toBe("Engineering");
    expect(createdMember.custom_data.job_title).toBe("Senior Developer");
    expect(createdMember.custom_data.email).toBe("sarah@example.com");

    // Verify member exists in database
    const dbRecord = db.prepare("SELECT * FROM members WHERE id = ?").get(createdMember.id);
    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe("Sarah Khan");

    // Verify audit log recorded AI_CREATE
    const auditRecord = db.prepare("SELECT * FROM audit_logs WHERE member_id = ? AND action = 'AI_CREATE'").get(createdMember.id);
    expect(auditRecord).toBeDefined();
    expect(auditRecord.user_name).toBe("AI Admin");
  }, 60000);

  it("should prevent unauthorized (guest) users from confirming AI creation", async () => {
    // Start session
    const sessRes = await request(app)
      .post("/api/ai/session")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        hierarchyId,
        targetLevelId: employeeLevelId,
        parentId: teamMemberId,
        mode: "create"
      });
    const sessionId = sessRes.body.id;

    // Guest tries to confirm create
    const res = await request(app)
      .post(`/api/ai/session/${sessionId}/confirm-create`)
      .set("Authorization", `Bearer ${guestToken}`)
      .send({});

    expect(res.status).toBe(403);
  });
});
