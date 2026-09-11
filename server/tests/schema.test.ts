import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Dynamic Schema & Field Engine", () => {
  let app: any;
  let adminToken: string;
  let hierarchyId: string;
  let levelId: string;

  beforeAll(async () => {
    const appInstance = createApp(":memory:");
    app = appInstance.app;

    // Create super admin
    const authService = new (await import("../src/services/auth.service.js")).AuthService(appInstance.db);
    const user = authService.createUser({
      username: "schema_admin",
      email: "schema@admin.com",
      password: "password",
      full_name: "Schema Admin",
      role_id: "role_super_admin"
    });
    adminToken = authService.generateToken(user);

    // Create hierarchy & level
    const h = await request(app)
      .post("/api/hierarchies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Schema Test Hierarchy" });
    hierarchyId = h.body.id;

    const l = await request(app)
      .post(`/api/hierarchies/${hierarchyId}/levels`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Employees", code: "emp", depth_order: 0 });
    levelId = l.body.id;
  });

  it("should add dynamic fields of various types without code changes", async () => {
    // 1. Required text field
    const f1 = await request(app)
      .post(`/api/levels/${levelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Badge ID", key: "badge_id", field_type: "text", is_required: true });
    expect(f1.status).toBe(201);
    expect(f1.body.is_required).toBe(true);

    // 2. Number field
    const f2 = await request(app)
      .post(`/api/levels/${levelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Base Salary", key: "base_salary", field_type: "number" });
    expect(f2.status).toBe(201);

    // 3. Select field with options
    const f3 = await request(app)
      .post(`/api/levels/${levelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Department",
        key: "department",
        field_type: "single_select",
        options: ["Engineering", "HR", "Finance", "Sales"]
      });
    expect(f3.status).toBe(201);
    expect(f3.body.options).toContain("Engineering");

    // 4. Calculated field: Bonus = Base Salary * 0.1
    const f4 = await request(app)
      .post(`/api/levels/${levelId}/fields`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Bonus",
        key: "bonus",
        field_type: "calculated",
        calculation_formula: "{base_salary} * 0.1"
      });
    expect(f4.status).toBe(201);
  });

  it("should enforce required fields and reject missing values", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        hierarchy_id: hierarchyId,
        level_id: levelId,
        name: "John Doe",
        custom_data: {
          // Missing required badge_id
          department: "Engineering"
        }
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Badge ID");
  });

  it("should validate and compute calculated field dynamically", async () => {
    const res = await request(app)
      .post("/api/members")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        hierarchy_id: hierarchyId,
        level_id: levelId,
        name: "John Doe",
        custom_data: {
          badge_id: "EMP-999",
          base_salary: 80000,
          department: "Engineering"
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.custom_data.badge_id).toBe("EMP-999");
    expect(res.body.custom_data.base_salary).toBe(80000);
    // Calculated field {base_salary} * 0.1 -> 8000
    expect(res.body.custom_data.bonus).toBe(8000);
  });
});
