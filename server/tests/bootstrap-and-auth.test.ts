import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Real Authentication, Admin Bootstrap, OTP, and Security Operations", () => {
  let app: any;
  let db: any;
  let superAdminToken: string;
  let superAdminUser: any;

  beforeAll(() => {
    // Brand new clean in-memory database
    const appInstance = createApp(":memory:");
    app = appInstance.app;
    db = appInstance.db;
  });

  it("1. should detect bootstrap is required on cold start", async () => {
    const res = await request(app).get("/api/auth/bootstrap/status");
    expect(res.status).toBe(200);
    expect(res.body.bootstrapRequired).toBe(true);
  });

  it("2. should reject unauthenticated requests (no backdoors/fallbacks)", async () => {
    const res = await request(app).get("/api/hierarchies");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Authentication required");
  });

  it("3. should request bootstrap OTP and store valid code", async () => {
    const res = await request(app)
      .post("/api/auth/bootstrap/request-otp")
      .send({ email: "founder@unthink.io" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expiresAt).toBeDefined();

    // Verify OTP row was created in database
    const otpRow = db.prepare("SELECT * FROM otps WHERE email = ? AND purpose = 'bootstrap'").get("founder@unthink.io") as any;
    expect(otpRow).toBeDefined();
    expect(otpRow.attempts).toBe(0);
    expect(otpRow.used_at).toBeNull();
  });

  it("4. should reject bootstrap confirmation with incorrect OTP", async () => {
    const res = await request(app)
      .post("/api/auth/bootstrap/confirm")
      .send({
        username: "superadmin",
        email: "founder@unthink.io",
        password: "SuperSecurePassword2026!",
        full_name: "Initial Super Admin",
        otpCode: "000000"
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid verification code");
  });

  it("5. should successfully bootstrap the initial Super Admin with valid OTP", async () => {
    // Generate known OTP or fetch directly from db for testing
    const otpService = new (await import("../src/services/otp.service.js")).OtpService(db);
    // Since rate limit is 60s, we can directly update or inspect code
    // Let's create an OTP directly via service with fresh timestamp
    db.prepare("DELETE FROM otps").run();
    const otp = await otpService.generateOtp("founder@unthink.io", "bootstrap");

    const res = await request(app)
      .post("/api/auth/bootstrap/confirm")
      .send({
        username: "superadmin",
        email: "founder@unthink.io",
        password: "SuperSecurePassword2026!",
        full_name: "Initial Super Admin",
        otpCode: otp.code
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role.id).toBe("role_super_admin");
    expect(res.body.user.email).toBe("founder@unthink.io");
    expect(res.body.token).toBeDefined();

    superAdminToken = res.body.token;
    superAdminUser = res.body.user;
  });

  it("6. should permanently disable bootstrap once initial Super Admin exists", async () => {
    const statusRes = await request(app).get("/api/auth/bootstrap/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.bootstrapRequired).toBe(false);

    // Any new bootstrap attempt must be rejected
    const attemptRes = await request(app)
      .post("/api/auth/bootstrap/request-otp")
      .send({ email: "hacker@unthink.io" });

    expect(attemptRes.status).toBe(400);
    expect(attemptRes.body.error).toContain("permanently disabled");
  });

  it("7. should authenticate Super Admin using email and password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        identifier: "founder@unthink.io",
        password: "SuperSecurePassword2026!"
      });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(superAdminUser.id);
    expect(res.body.token).toBeDefined();
  });

  it("8. should trigger account lockout protection on 5 consecutive failed attempts", async () => {
    for (let i = 0; i < 4; i++) {
      const failRes = await request(app)
        .post("/api/auth/login")
        .send({ identifier: "founder@unthink.io", password: "wrong_password" });
      expect(failRes.status).toBe(401);
      expect(failRes.body.error).toContain("attempt(s) remaining");
    }

    // 5th attempt locks the account
    const lockRes = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "founder@unthink.io", password: "wrong_password" });
    expect(lockRes.status).toBe(401);
    expect(lockRes.body.error).toContain("locked");

    // Even with correct password now, it must remain locked!
    const blockedRes = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "founder@unthink.io", password: "SuperSecurePassword2026!" });
    expect(blockedRes.status).toBe(401);
    expect(blockedRes.body.error).toContain("temporarily locked");

    // Unlock for subsequent tests
    db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL, status = 'active' WHERE id = ?").run(superAdminUser.id);
  });

  it("9. should support Step-Up verification for sensitive admin operations", async () => {
    // Clear recent verification timestamp
    db.prepare("UPDATE users SET recent_verified_at = NULL WHERE id = ?").run(superAdminUser.id);

    // Attempting sensitive action without recent verification -> rejected with requiresStepUp
    const unverifiedRes = await request(app)
      .post("/api/admin/invite")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ email: "newadmin@unthink.io", role_id: "role_admin" });

    expect(unverifiedRes.status).toBe(403);
    expect(unverifiedRes.body.requiresStepUp).toBe(true);

    // Request Step-Up OTP
    const otpService = new (await import("../src/services/otp.service.js")).OtpService(db);
    db.prepare("DELETE FROM otps").run();
    const stepUpOtp = await otpService.generateOtp("founder@unthink.io", "step_up");

    // Verify Step-Up OTP
    const verifyRes = await request(app)
      .post("/api/auth/step-up/verify")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ code: stepUpOtp.code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);

    // Now sensitive action succeeds!
    const inviteRes = await request(app)
      .post("/api/admin/invite")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ email: "newadmin@unthink.io", role_id: "role_admin" });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.rawToken).toBeDefined();

    // Verify invitation can be accepted
    const inviteToken = inviteRes.body.rawToken;
    const acceptRes = await request(app)
      .post("/api/auth/invitations/accept")
      .send({
        token: inviteToken,
        username: "alice_admin",
        password: "NewAdministratorPass2026!",
        full_name: "Alice Administrator"
      });

    expect(acceptRes.status).toBe(201);
    expect(acceptRes.body.user.role.id).toBe("role_admin");
  });

  it("10. should create and access guest links scoped to branch", async () => {
    // Create a hierarchy for the guest link
    const hierarchyService = new (await import("../src/services/hierarchy.service.js")).HierarchyService(db);
    const h = hierarchyService.createHierarchy({ name: "Demo Guest System" }, { id: superAdminUser.id, name: "Admin" });

    const linkRes = await request(app)
      .post("/api/admin/guest-links")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        name: "External Auditor Link",
        hierarchy_id: h.id,
        access_level: "viewer"
      });

    expect(linkRes.status).toBe(201);
    const rawToken = linkRes.body.rawToken;

    // Access link without credentials
    const guestAccess = await request(app)
      .post("/api/guest/access")
      .send({ token: rawToken });

    expect(guestAccess.status).toBe(200);
    expect(guestAccess.body.hierarchy_name).toBe("Demo Guest System");
    expect(guestAccess.body.access_level).toBe("viewer");

    const guestToken = guestAccess.body.token;
    expect(guestToken).toBeDefined();

    // Verify guest token works against protected APIs
    const levelsRes = await request(app)
      .get(`/api/hierarchies/${h.id}/levels`)
      .set("Authorization", `Bearer ${guestToken}`);
    expect(levelsRes.status).toBe(200);

    // Verify access_history.log has recorded the events!
    const fs = await import("fs");
    const logPath = "access_history.log";
    expect(fs.existsSync(logPath)).toBe(true);
    const logs = fs.readFileSync(logPath, "utf8");
    expect(logs).toContain("GUEST_ACCESS");
    expect(logs).toContain("External Auditor Link");
  });
});
