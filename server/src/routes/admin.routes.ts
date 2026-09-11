import fs from "fs";
import path from "path";
import { accessLogger } from "../services/access-logger.service.js";
import { Router } from "express";
import { AuthService } from "../services/auth.service.js";
import { emailService } from "../services/email.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware, requirePermission, requireRecentVerification } from "../middleware/auth.js";
import { isUserAuthorizedForHierarchy } from "../middleware/scope.js";

const router = Router();

// Apply base authentication to all admin routes
router.use(authMiddleware);

// 1. List Users
router.get("/users", requirePermission("user:view"), (req, res) => {
  const db = getDatabase();
  const authService = new AuthService(db);
  const users = authService.getUsers();
  res.json(users);
});

// 2. List Roles
router.get("/roles", requirePermission("role:view"), (req, res) => {
  const db = getDatabase();
  const authService = new AuthService(db);
  const roles = authService.getRoles();
  res.json(roles);
});

// 3. Send Invitation (Super Admin only - Step-Up verified)
router.post("/invite", requirePermission("role:manage"), requireRecentVerification(), async (req, res) => {
  const { email, role_id, scopes } = req.body;
  if (!email || !role_id) {
    return res.status(400).json({ error: "Email and Role are required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = await authService.createInvitation({
      email,
      role_id,
      scopes,
      invited_by_user_id: req.user!.id,
      invited_by_name: req.user!.full_name
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Update User Status (active, disabled, locked) - Step-Up protected
router.post("/users/:id/status", requirePermission("user:manage"), requireRecentVerification(), (req, res) => {
  const { status } = req.body;
  if (!["active", "disabled", "locked"].includes(status)) {
    return res.status(400).json({ error: "Invalid status option." });
  }

  // Prevent disabling self
  if (req.params.id === req.user!.id && status !== "active") {
    return res.status(400).json({ error: "You cannot deactivate or lock your own account." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.updateUserStatus(req.params.id, status);
    res.json({ success: true, message: `User status updated to ${status}.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Update User Role - Step-Up protected
router.post("/users/:id/role", requirePermission("user:manage"), requireRecentVerification(), (req, res) => {
  const { role_id } = req.body;
  if (!role_id) {
    return res.status(400).json({ error: "Role ID required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.updateUserRole(req.params.id, role_id);
    res.json({ success: true, message: "User role updated successfully." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Delete User - Step-Up protected
router.delete("/users/:id", requirePermission("user:manage"), requireRecentVerification(), (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.deleteUser(req.params.id);
    res.json({ success: true, message: "User deleted successfully." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Manage Scopes
router.post("/users/:id/scopes", requirePermission("user:manage"), (req, res) => {
  const { hierarchy_id, member_id, access_level } = req.body;
  if (!hierarchy_id || !access_level) {
    return res.status(400).json({ error: "Hierarchy ID and access level required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.setUserScope(req.params.id, hierarchy_id, member_id || null, access_level);
    res.json({ success: true, message: "Scope granted." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/scopes/:scopeId", requirePermission("user:manage"), (req, res) => {
  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.removeUserScope(req.params.scopeId);
    res.json({ success: true, message: "Scope removed." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Guest Links Management
router.get("/guest-links", (req, res) => {
  const db = getDatabase();
  const authService = new AuthService(db);
  const links = authService.getGuestLinks();
  res.json(links);
});

router.post("/guest-links", requirePermission("member:view"), (req, res) => {
  const { name, hierarchy_id, member_id, password, access_level, expires_in_days } = req.body;
  if (!name || !hierarchy_id || !password || !String(password).trim()) {
    return res.status(400).json({ error: "Link name, hierarchy, and passphrase protection are required." });
  }

  if (!isUserAuthorizedForHierarchy(req.user, hierarchy_id)) {
    return res.status(403).json({ error: "Access denied: you cannot generate guest links for an unauthorized hierarchy." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = authService.createGuestLink({
      name,
      hierarchy_id,
      member_id,
      password,
      access_level: access_level || "viewer",
      expires_in_days: expires_in_days ? parseInt(expires_in_days, 10) : undefined,
      created_by_user_id: req.user!.id
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/guest-links/:id/revoke", (req, res) => {
  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.revokeGuestLink(req.params.id);
    res.json({ success: true, message: "Guest link revoked." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});


// 9. Dedicated Access History Logs (Super Admin only)
router.get("/access-logs", requirePermission("role:manage"), (req, res) => {
  const limit = parseInt((req.query.limit as string) || "100", 10);
  const logs = accessLogger.getRecentLogs(limit);
  res.json({
    logFilePath: "server/access_history.log",
    totalLines: logs.length,
    logs
  });
});

// 10. SMTP Connection Status & Test Email (Super Admin only)
router.get("/smtp-status", requirePermission("role:manage"), async (req, res) => {
  const isConfigured = emailService.isSmtpConfigured();
  const host = process.env.SMTP_HOST || null;
  const user = process.env.SMTP_USER || null;
  const from = process.env.SMTP_FROM || null;
  const verification = await emailService.verifyConnection();
  res.json({
    configured: isConfigured,
    host,
    port: verification.port || process.env.SMTP_PORT || null,
    user,
    from,
    verified: verification.success,
    error: verification.error || null,
  });
});

router.post("/smtp-test", requirePermission("role:manage"), async (req, res) => {
  const { to } = req.body;
  const targetEmail = to || req.user!.email;
  const result = await emailService.sendMail({
    to: targetEmail,
    subject: "Hierarchy Pyramid Enterprise - Live SMTP Test",
    text: `Hello! This is a real test email dispatched via Brevo SMTP to verify outgoing mail delivery.\n\nSent at: ${new Date().toISOString()}`,
    html: `<div style="font-family: sans-serif; padding: 20px; background: #111; color: #fff;"><h2>Live SMTP Verification</h2><p>Your outgoing email service is operational and delivering messages.</p><p style="color: #888;">Dispatched at: ${new Date().toISOString()}</p></div>`,
  });
  res.json({ success: result, recipient: targetEmail });
});

router.post("/smtp-config", requirePermission("role:manage"), async (req, res) => {
  const { host, port, user, pass, from, secure } = req.body;
  if (!host || !user || !pass) {
    return res.status(400).json({ error: "Host, user (login), and password/key are required." });
  }

  process.env.SMTP_HOST = host;
  process.env.SMTP_PORT = String(port || 587);
  process.env.SMTP_USER = user;
  process.env.SMTP_PASS = pass;
  process.env.SMTP_SECURE = secure ? "true" : "false";
  if (from) process.env.SMTP_FROM = from;

  // Persist to .env
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf8");
    }
    const vars: Record<string, string> = {
      SMTP_HOST: host,
      SMTP_PORT: String(port || 587),
      SMTP_USER: user,
      SMTP_PASS: pass,
      SMTP_SECURE: secure ? "true" : "false",
      SMTP_FROM: from || process.env.SMTP_FROM || `Hierarchy Enterprise <${user}>`
    };
    for (const [k, v] of Object.entries(vars)) {
      const regex = new RegExp(`^${k}=.*$`, "m");
      if (regex.test(content)) {
        content = content.replace(regex, `${k}=${v}`);
      } else {
        content += `\n${k}=${v}`;
      }
    }
    fs.writeFileSync(envPath, content.trim() + "\n", "utf8");
  } catch (err: any) {
    console.error("Failed to write .env file:", err.message);
  }

  const verification = await emailService.verifyConnection();
  res.json({
    success: true,
    verified: verification.success,
    error: verification.error || null
  });
});

export default router;
