import { accessLogger } from "./access-logger.service.js";
import { Database } from "better-sqlite3";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User, Role, Permission, UserScope, AuthContextUser, InvitationRecord, GuestLink } from "../types/index.js";
import { OtpService } from "./otp.service.js";
import { emailService } from "./email.service.js";

const JWT_SECRET = process.env.JWT_SECRET || "unthink-dynamic-hierarchy-secret-key-2026";

export class AuthService {
  private otpService: OtpService;

  constructor(private db: Database) {
    this.otpService = new OtpService(db);
  }

  seedDefaultRolesAndPermissions(): void {
    const permissionsList: Array<{ code: string; name: string; description: string }> = [
      { code: "hierarchy:view", name: "View Hierarchy", description: "View hierarchy structures and trees" },
      { code: "hierarchy:manage", name: "Manage Hierarchy", description: "Create, edit, or delete hierarchies" },
      { code: "level:view", name: "View Levels", description: "View level definitions" },
      { code: "level:manage", name: "Manage Levels", description: "Create, edit, reorder or delete levels" },
      { code: "field:view", name: "View Fields", description: "View dynamic field definitions" },
      { code: "field:manage", name: "Manage Fields", description: "Add, edit, or delete dynamic columns" },
      { code: "member:view", name: "View Members", description: "View members and custom field values" },
      { code: "member:create", name: "Create Member", description: "Add new members to any permitted level" },
      { code: "member:edit", name: "Edit Member", description: "Update member attributes and custom fields" },
      { code: "member:delete", name: "Delete Member", description: "Delete member records and their subtrees" },
      { code: "member:move", name: "Move Member", description: "Re-parent members across valid branches" },
      { code: "user:view", name: "View Users", description: "View system users" },
      { code: "user:manage", name: "Manage Users", description: "Create, edit, and assign roles to users" },
      { code: "role:view", name: "View Roles", description: "View system roles and permissions" },
      { code: "role:manage", name: "Manage Roles", description: "Create and update roles" },
      { code: "audit:view", name: "View Audit Logs", description: "View security and change audit history" },
      { code: "data:export", name: "Export Data", description: "Export records to CSV and JSON" },
      { code: "data:import", name: "Import Data", description: "Bulk import records with schema validation" },
    ];

    const insertPerm = this.db.prepare(`
      INSERT OR IGNORE INTO permissions (id, code, name, description)
      VALUES (?, ?, ?, ?)
    `);

    for (const p of permissionsList) {
      const id = "perm_" + p.code.replace(/[^a-zA-Z0-9]/g, "_");
      insertPerm.run(id, p.code, p.name, p.description);
    }

    const allPermCodes = permissionsList.map(p => p.code);

    const rolesList: Array<{ id: string; name: string; description: string; isSystem: boolean; permissions: string[] }> = [
      {
        id: "role_super_admin",
        name: "Super Admin",
        description: "Full global access to all hierarchies, levels, records, security and admin settings",
        isSystem: true,
        permissions: allPermCodes
      },
      {
        id: "role_admin",
        name: "Administrator",
        description: "Administrative access to configure hierarchies, levels, fields, and records",
        isSystem: true,
        permissions: allPermCodes.filter(p => !p.startsWith("role:manage"))
      },
      {
        id: "role_manager",
        name: "Manager",
        description: "Can manage and edit members, children, and export data within assigned branch",
        isSystem: true,
        permissions: [
          "hierarchy:view", "level:view", "field:view", "member:view",
          "member:create", "member:edit", "member:move", "data:export", "data:import"
        ]
      },
      {
        id: "role_editor",
        name: "Editor",
        description: "Can view and edit members within assigned branch",
        isSystem: true,
        permissions: [
          "hierarchy:view", "level:view", "field:view", "member:view",
          "member:create", "member:edit", "data:export"
        ]
      },
      {
        id: "role_viewer",
        name: "Viewer",
        description: "Read-only access within assigned branch",
        isSystem: true,
        permissions: [
          "hierarchy:view", "level:view", "field:view", "member:view"
        ]
      }
    ];

    for (const r of rolesList) {
      this.db.prepare(`
        INSERT OR IGNORE INTO roles (id, name, description, is_system)
        VALUES (?, ?, ?, ?)
      `).run(r.id, r.name, r.description, r.isSystem ? 1 : 0);

      // Assign permissions
      for (const pCode of r.permissions) {
        const permRow = this.db.prepare("SELECT id FROM permissions WHERE code = ?").get(pCode) as any;
        if (permRow) {
          this.db.prepare(`
            INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
            VALUES (?, ?)
          `).run(r.id, permRow.id);
        }
      }
    }
  }

  // Check if system requires initial bootstrap setup
  isBootstrapRequired(): boolean {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM users 
      WHERE role_id = 'role_super_admin' AND is_active = 1
    `).get() as { count: number };
    return row.count === 0;
  }

  // Request OTP for initial Super Admin setup
  async requestBootstrapOtp(email: string): Promise<{ expiresAt: string; resendCooldownSeconds: number; isLiveSmtp: boolean; devOtpCode?: string }> {
    if (!this.isBootstrapRequired()) {
      throw new Error("System bootstrap is permanently disabled: Initial Super Administrator already exists.");
    }
    const result = await this.otpService.generateOtp(email, "bootstrap");
    return {
      expiresAt: result.expiresAt,
      resendCooldownSeconds: result.resendCooldownSeconds,
      isLiveSmtp: result.isLiveSmtp,
      devOtpCode: result.devOtpCode
    };
  }

  // Confirm initial Super Admin setup
  bootstrapFirstAdmin(data: {
    username: string;
    email: string;
    password: string;
    full_name: string;
    otpCode: string;
  }): { user: AuthContextUser; token: string } {
    if (!this.isBootstrapRequired()) {
      throw new Error("System bootstrap is permanently disabled: Initial Super Administrator already exists.");
    }

    if (!data.username || !data.email || !data.password || !data.full_name) {
      throw new Error("All fields are required.");
    }

    if (data.password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    // If a specific OTP code is provided (and not "DIRECT"), verify it
    if (data.otpCode && data.otpCode !== "DIRECT") {
      const verification = this.otpService.verifyOtp(data.email, data.otpCode, "bootstrap");
      if (!verification.valid) {
        throw new Error(verification.error || "Invalid verification code.");
      }
    }

    const id = crypto.randomUUID();
    const hash = bcrypt.hashSync(data.password, 10);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, full_name, role_id, is_active, status, email_verified, recent_verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'role_super_admin', 1, 'active', 1, ?, ?)
    `).run(id, data.username.trim(), data.email.trim().toLowerCase(), hash, data.full_name.trim(), now, now);

    // Audit log
    this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, user_name, action, entity_type, entity_id, new_state, created_at)
      VALUES (?, ?, ?, 'SECURITY', 'auth', ?, ?, ?)
    `).run(crypto.randomUUID(), id, data.full_name.trim(), id, JSON.stringify({ event: "SUPER_ADMIN_BOOTSTRAP", email: data.email }), now);

    const user = this.getUserById(id)!;
    const token = this.generateToken(user);
    return { user, token };
  }

  generateToken(user: AuthContextUser): string {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role.name,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  }

  getUserById(id: string): AuthContextUser | null {
    if (id.startsWith("guest_")) {
      return this.getGuestUserById(id);
    }
    const userRow = this.db.prepare(`
      SELECT u.*, r.name as role_name, r.id as role_id
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(id) as any;

    if (!userRow) return null;

    const permRows = this.db.prepare(`
      SELECT p.code
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `).all(userRow.role_id) as Array<{ code: string }>;

    const scopeRows = this.db.prepare(`
      SELECT s.*, m.name as member_name
      FROM user_scopes s
      LEFT JOIN members m ON s.member_id = m.id
      WHERE s.user_id = ?
    `).all(id) as any[];

    const scopes: UserScope[] = scopeRows.map(s => ({
      id: s.id,
      user_id: s.user_id,
      hierarchy_id: s.hierarchy_id,
      member_id: s.member_id || null,
      member_name: s.member_name || undefined,
      access_level: s.access_level
    }));

    return {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      full_name: userRow.full_name,
      status: userRow.status || (userRow.is_active ? "active" : "disabled"),
      email_verified: Boolean(userRow.email_verified),
      recent_verified_at: userRow.recent_verified_at || null,
      role: {
        id: userRow.role_id,
        name: userRow.role_name,
        permissions: permRows.map(p => p.code)
      },
      scopes
    };
  }

  getUserByIdentifier(identifier: string): any {
    const trimmed = identifier.trim().toLowerCase();
    return this.db.prepare(`
      SELECT * FROM users 
      WHERE LOWER(username) = ? OR LOWER(email) = ?
    `).get(trimmed, trimmed);
  }

  authenticate(identifier: string, password: string, ip?: string): { user: AuthContextUser; token: string } {
    const rawUser = this.getUserByIdentifier(identifier);
    if (!rawUser) {
      throw new Error("Invalid username/email or password.");
    }

    const now = new Date();

    // Check account status
    if (rawUser.status === "disabled" || rawUser.is_active === 0) {
      throw new Error("This account has been deactivated. Please contact an administrator.");
    }

    // Check lockout
    if (rawUser.locked_until && new Date(rawUser.locked_until).getTime() > now.getTime()) {
      const remainingMinutes = Math.ceil((new Date(rawUser.locked_until).getTime() - now.getTime()) / 60000);
      throw new Error(`Account temporarily locked due to excessive failed attempts. Try again in ${remainingMinutes} minute(s).`);
    }

    const valid = bcrypt.compareSync(password, rawUser.password_hash);
    if (!valid) {
      const attempts = (rawUser.failed_login_attempts || 0) + 1;
      let lockUntil: string | null = null;
      let status = rawUser.status || "active";

      if (attempts >= 5) {
        // Lock for 15 minutes
        lockUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
        status = "locked";
      }

      this.db.prepare(`
        UPDATE users 
        SET failed_login_attempts = ?, locked_until = ?, status = ?
        WHERE id = ?
      `).run(attempts, lockUntil, status, rawUser.id);

      if (attempts >= 5) {
        throw new Error("Maximum sign-in attempts exceeded. Account is locked for 15 minutes.");
      }

      const remaining = 5 - attempts;
      throw new Error(`Invalid credentials. ${remaining} sign-in attempt(s) remaining before account lockout.`);
    }

    // Reset login attempts on success
    this.db.prepare(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, status = 'active', 
          last_login_at = ?, last_login_ip = ?
      WHERE id = ?
    `).run(now.toISOString(), ip || null, rawUser.id);

    const user = this.getUserById(rawUser.id);
    if (!user) throw new Error("User record not found.");

    const token = this.generateToken(user);
    return { user, token };
  }

  // Request OTP for passwordless sign-in (supports both existing users and invited administrators)
  async requestLoginOtp(email: string): Promise<{
    expiresAt: string;
    resendCooldownSeconds: number;
    isLiveSmtp: boolean;
    devOtpCode?: string;
    isInvite?: boolean;
    roleName?: string;
    inviterName?: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const rawUser = this.getUserByIdentifier(normalizedEmail);

    if (!rawUser) {
      // Check if there is an active pending invitation for this email
      const pendingInvitation = this.db.prepare(`
        SELECT i.*, r.name as role_name, u.full_name as invited_by_name
        FROM invitations i
        JOIN roles r ON i.role_id = r.id
        JOIN users u ON i.invited_by_user_id = u.id
        WHERE LOWER(i.email) = ? AND i.status = 'pending' AND datetime(i.expires_at) > datetime('now')
        ORDER BY i.created_at DESC LIMIT 1
      `).get(normalizedEmail) as any;

      if (!pendingInvitation) {
        throw new Error("No user account or pending invitation found associated with this email address.");
      }

      // Check if an unexpired OTP was recently dispatched for this invitation
      const now = new Date();
      const activeOtp = this.db.prepare(`
        SELECT created_at, expires_at FROM otps 
        WHERE email = ? AND purpose = 'login' AND used_at IS NULL AND datetime(expires_at) > datetime('now')
        ORDER BY created_at DESC LIMIT 1
      `).get(normalizedEmail) as { created_at: string; expires_at: string } | undefined;

      if (activeOtp) {
        const elapsed = (now.getTime() - new Date(activeOtp.created_at).getTime()) / 1000;
        if (elapsed < 60) {
          const remaining = Math.ceil(60 - elapsed);
          return {
            expiresAt: activeOtp.expires_at,
            resendCooldownSeconds: remaining,
            isLiveSmtp: emailService.isSmtpConfigured(),
            isInvite: true,
            roleName: pendingInvitation.role_name,
            inviterName: pendingInvitation.invited_by_name
          };
        }
      }

      // Generate fresh invitation onboarding OTP
      const result = await this.otpService.generateOtp(normalizedEmail, "login", {
        is_invitation: true,
        invitation_id: pendingInvitation.id,
        role_name: pendingInvitation.role_name,
        invited_by_name: pendingInvitation.invited_by_name
      });

      return {
        expiresAt: result.expiresAt,
        resendCooldownSeconds: result.resendCooldownSeconds,
        isLiveSmtp: result.isLiveSmtp,
        devOtpCode: result.devOtpCode,
        isInvite: true,
        roleName: pendingInvitation.role_name,
        inviterName: pendingInvitation.invited_by_name
      };
    }

    if (rawUser.status === "disabled" || rawUser.is_active === 0) {
      throw new Error("This account is currently deactivated.");
    }
    const result = await this.otpService.generateOtp(normalizedEmail, "login");
    return {
      expiresAt: result.expiresAt,
      resendCooldownSeconds: result.resendCooldownSeconds,
      isLiveSmtp: result.isLiveSmtp,
      devOtpCode: result.devOtpCode
    };
  }

  // Confirm sign-in via OTP (supports existing users & auto-provisions invited admins)
  authenticateWithOtp(email: string, code: string, ip?: string): { user: AuthContextUser; token: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const rawUser = this.getUserByIdentifier(normalizedEmail);

    if (!rawUser) {
      // Attempt to confirm via pending invitation
      return this.confirmInvitationWithOtp({ email: normalizedEmail, code, ip });
    }

    if (rawUser.status === "disabled" || rawUser.is_active === 0) {
      throw new Error("This account is currently deactivated.");
    }

    const verification = this.otpService.verifyOtp(normalizedEmail, code, "login");
    if (!verification.valid) {
      throw new Error(verification.error || "Invalid verification code.");
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, status = 'active', 
          recent_verified_at = ?, last_login_at = ?, last_login_ip = ?
      WHERE id = ?
    `).run(now, now, ip || null, rawUser.id);

    const user = this.getUserById(rawUser.id)!;
    const token = this.generateToken(user);
    return { user, token };
  }

  // Confirm Invitation Onboarding via OTP
  confirmInvitationWithOtp(data: {
    email: string;
    code: string;
    username?: string;
    full_name?: string;
    password?: string;
    ip?: string;
  }): { user: AuthContextUser; token: string } {
    const normalizedEmail = data.email.trim().toLowerCase();

    // 1. Verify OTP
    const verification = this.otpService.verifyOtp(normalizedEmail, data.code, "login");
    if (!verification.valid) {
      throw new Error(verification.error || "Invalid or expired verification code.");
    }

    // 2. Find pending invitation
    const inv = this.db.prepare(`
      SELECT * FROM invitations 
      WHERE LOWER(email) = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(normalizedEmail) as any;

    if (!inv) {
      throw new Error("No active invitation found for this email address.");
    }

    // 3. Resolve username & name
    let chosenUsername = (data.username || "").trim();
    if (!chosenUsername) {
      // Default to email prefix
      const base = normalizedEmail.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "");
      chosenUsername = base;
      let counter = 1;
      while (this.db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(chosenUsername)) {
        chosenUsername = `${base}${counter++}`;
      }
    } else {
      const existing = this.db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(chosenUsername);
      if (existing) {
        throw new Error("This username is already taken. Please choose another username.");
      }
    }

    const chosenFullName = (data.full_name || "").trim() || chosenUsername;
    const passwordToUse = data.password && data.password.length >= 8 ? data.password : crypto.randomBytes(16).toString("hex");
    const hash = bcrypt.hashSync(passwordToUse, 10);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const scopes = JSON.parse(inv.scopes || "[]");

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, full_name, role_id, is_active, status, email_verified, recent_verified_at, last_login_at, last_login_ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'active', 1, ?, ?, ?, ?)
      `).run(userId, chosenUsername, normalizedEmail, hash, chosenFullName, inv.role_id, now, now, data.ip || null, now);

      if (scopes && scopes.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO user_scopes (id, user_id, hierarchy_id, member_id, access_level)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const s of scopes) {
          stmt.run(crypto.randomUUID(), userId, s.hierarchy_id, s.member_id || null, s.access_level || "viewer");
        }
      }

      this.db.prepare("UPDATE invitations SET status = 'accepted', accepted_at = ? WHERE id = ?").run(now, inv.id);
    });

    tx();

    const user = this.getUserById(userId)!;
    const authToken = this.generateToken(user);
    return { user, token: authToken };
  }

  // Password reset flow
  async requestPasswordResetOtp(email: string): Promise<{ expiresAt: string; resendCooldownSeconds: number }> {
    const rawUser = this.getUserByIdentifier(email);
    if (!rawUser) {
      throw new Error("No account found with this email address.");
    }
    const result = await this.otpService.generateOtp(email, "reset_password");
    return { expiresAt: result.expiresAt, resendCooldownSeconds: result.resendCooldownSeconds };
  }

  resetPasswordWithOtp(email: string, code: string, newPassword: string): void {
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters long.");
    }
    const rawUser = this.getUserByIdentifier(email);
    if (!rawUser) throw new Error("No account found with this email.");

    const verification = this.otpService.verifyOtp(email, code, "reset_password");
    if (!verification.valid) {
      throw new Error(verification.error || "Invalid reset code.");
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    this.db.prepare(`
      UPDATE users 
      SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, status = 'active'
      WHERE id = ?
    `).run(hash, rawUser.id);
  }

  // Step-up verification for high-security actions
  async requestStepUpOtp(userId: string): Promise<{ expiresAt: string; resendCooldownSeconds: number }> {
    const user = this.getUserById(userId);
    if (!user) throw new Error("User not found.");
    const result = await this.otpService.generateOtp(user.email, "step_up");
    return { expiresAt: result.expiresAt, resendCooldownSeconds: result.resendCooldownSeconds };
  }

  verifyStepUpOtp(userId: string, code: string): boolean {
    const user = this.getUserById(userId);
    if (!user) throw new Error("User not found.");

    const verification = this.otpService.verifyOtp(user.email, code, "step_up");
    if (!verification.valid) {
      throw new Error(verification.error || "Invalid verification code.");
    }

    const now = new Date().toISOString();
    this.db.prepare("UPDATE users SET recent_verified_at = ? WHERE id = ?").run(now, userId);
    return true;
  }

  isRecentlyVerified(userId: string, maxMinutes = 15): boolean {
    const row = this.db.prepare("SELECT recent_verified_at FROM users WHERE id = ?").get(userId) as { recent_verified_at?: string };
    if (!row || !row.recent_verified_at) return false;
    const elapsedMinutes = (Date.now() - new Date(row.recent_verified_at).getTime()) / 60000;
    return elapsedMinutes <= maxMinutes;
  }

  // Invitations
  async createInvitation(data: {
    email: string;
    role_id: string;
    invited_by_user_id: string;
    invited_by_name: string;
    scopes?: UserScope[];
  }): Promise<{ invitationId: string; rawToken: string; expiresAt: string }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    
    // Check if active user already exists
    const existingUser = this.getUserByIdentifier(normalizedEmail);
    if (existingUser && existingUser.status === "active") {
      throw new Error("A user account with this email address already exists.");
    }

    const role = this.db.prepare("SELECT name FROM roles WHERE id = ?").get(data.role_id) as { name: string } | undefined;
    if (!role) throw new Error("Selected role does not exist.");

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    this.db.prepare(`
      INSERT INTO invitations (id, email, token_hash, role_id, invited_by_user_id, scopes, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, normalizedEmail, tokenHash, data.role_id, data.invited_by_user_id, JSON.stringify(data.scopes || []), expiresAt, now.toISOString());

    // Send simple invitation notice to the recipient without pre-generated OTP or secret link
    await emailService.sendInvitation(normalizedEmail, role.name, data.invited_by_name);

    return { invitationId: id, rawToken, expiresAt };
  }

  getInvitationByToken(rawToken: string): any {
    const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
    const inv = this.db.prepare(`
      SELECT i.*, r.name as role_name, u.full_name as invited_by_name
      FROM invitations i
      JOIN roles r ON i.role_id = r.id
      JOIN users u ON i.invited_by_user_id = u.id
      WHERE i.token_hash = ? AND i.status = 'pending'
    `).get(tokenHash) as any;

    if (!inv) return null;
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      this.db.prepare("UPDATE invitations SET status = 'expired' WHERE id = ?").run(inv.id);
      return null;
    }

    return {
      ...inv,
      scopes: JSON.parse(inv.scopes || "[]")
    };
  }

  acceptInvitation(data: {
    token: string;
    username: string;
    password: string;
    full_name: string;
  }): { user: AuthContextUser; token: string } {
    const inv = this.getInvitationByToken(data.token);
    if (!inv) {
      throw new Error("Invitation link is invalid or has expired.");
    }

    if (data.password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const userId = crypto.randomUUID();
    const hash = bcrypt.hashSync(data.password, 10);
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, full_name, role_id, is_active, status, email_verified, recent_verified_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'active', 1, ?, ?)
      `).run(userId, data.username.trim(), inv.email, hash, data.full_name.trim(), inv.role_id, now, now);

      if (inv.scopes && inv.scopes.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO user_scopes (id, user_id, hierarchy_id, member_id, access_level)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const s of inv.scopes) {
          stmt.run(crypto.randomUUID(), userId, s.hierarchy_id, s.member_id || null, s.access_level || "viewer");
        }
      }

      this.db.prepare("UPDATE invitations SET status = 'accepted', accepted_at = ? WHERE id = ?").run(now, inv.id);
    });

    tx();

    const user = this.getUserById(userId)!;
    const authToken = this.generateToken(user);
    return { user, token: authToken };
  }

  // User Management
  getUsers(): any[] {
    const rows = this.db.prepare(`
      SELECT u.id, u.username, u.email, u.full_name, u.role_id, u.is_active, u.status,
             u.email_verified, u.failed_login_attempts, u.locked_until, u.last_login_at, u.created_at,
             r.name as role_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      ORDER BY u.full_name ASC
    `).all() as any[];

    return rows.map(u => {
      const scopes = this.db.prepare(`
        SELECT s.*, m.name as member_name
        FROM user_scopes s
        LEFT JOIN members m ON s.member_id = m.id
        WHERE s.user_id = ?
      `).all(u.id);
      return { ...u, scopes, is_active: Boolean(u.is_active), email_verified: Boolean(u.email_verified) };
    });
  }

  updateUserStatus(userId: string, status: "active" | "disabled" | "locked"): void {
    const isActive = status === "active" ? 1 : 0;
    const lockedUntil = status === "locked" ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    this.db.prepare(`
      UPDATE users 
      SET status = ?, is_active = ?, locked_until = ?
      WHERE id = ?
    `).run(status, isActive, lockedUntil, userId);
  }

  updateUserRole(userId: string, roleId: string): void {
    this.db.prepare("UPDATE users SET role_id = ? WHERE id = ?").run(roleId, userId);
  }

  deleteUser(userId: string): void {
    // Prevent deleting last super admin
    const user = this.getUserById(userId);
    if (user?.role.id === "role_super_admin") {
      const superAdminCount = this.db.prepare("SELECT COUNT(*) as count FROM users WHERE role_id = 'role_super_admin' AND is_active = 1").get() as { count: number };
      if (superAdminCount.count <= 1) {
        throw new Error("Cannot delete the only active Super Administrator.");
      }
    }
    this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  }

  getRoles(): Role[] {
    const roles = this.db.prepare("SELECT * FROM roles ORDER BY name ASC").all() as any[];
    return roles.map(r => {
      const perms = this.db.prepare(`
        SELECT p.code FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = ?
      `).all(r.id) as Array<{ code: string }>;
      return {
        ...r,
        is_system: Boolean(r.is_system),
        permissions: perms.map(p => p.code)
      };
    });
  }

  createUser(data: {
    username: string;
    email: string;
    password: string;
    full_name: string;
    role_id: string;
    scopes?: Array<{ hierarchy_id: string; member_id: string | null; access_level: "admin" | "manager" | "editor" | "viewer" }>;
  }): AuthContextUser {
    const id = crypto.randomUUID();
    const hash = bcrypt.hashSync(data.password, 10);
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO users (id, username, email, password_hash, full_name, role_id, is_active, status, email_verified, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'active', 1, ?)
      `).run(id, data.username.trim(), data.email.trim().toLowerCase(), hash, data.full_name.trim(), data.role_id, now);

      if (data.scopes && data.scopes.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO user_scopes (id, user_id, hierarchy_id, member_id, access_level)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const s of data.scopes) {
          stmt.run(crypto.randomUUID(), id, s.hierarchy_id, s.member_id || null, s.access_level);
        }
      }
    });

    tx();
    return this.getUserById(id)!;
  }

  setUserScope(
    userId: string,
    hierarchyId: string,
    memberId: string | null,
    accessLevel: "admin" | "manager" | "editor" | "viewer"
  ): void {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO user_scopes (id, user_id, hierarchy_id, member_id, access_level)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, hierarchyId, memberId, accessLevel);
  }

  removeUserScope(scopeId: string): void {
    this.db.prepare("DELETE FROM user_scopes WHERE id = ?").run(scopeId);
  }

  // Guest Links
  createGuestLink(data: {
    name: string;
    hierarchy_id: string;
    member_id?: string | null;
    password?: string;
    access_level?: "viewer" | "editor";
    expires_in_days?: number;
    created_by_user_id: string;
  }): { id: string; rawToken: string } {
    if (!data.password || !data.password.trim()) {
      throw new Error("Passphrase protection is required for all guest links.");
    }
    const rawToken = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = data.expires_in_days ? new Date(now.getTime() + data.expires_in_days * 86400000).toISOString() : null;
    const passwordHash = bcrypt.hashSync(data.password.trim(), 10);

    this.db.prepare(`
      INSERT INTO guest_links (id, token_hash, name, hierarchy_id, member_id, password_hash, access_level, expires_at, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tokenHash,
      data.name.trim(),
      data.hierarchy_id,
      data.member_id || null,
      passwordHash,
      data.access_level || "viewer",
      expiresAt,
      data.created_by_user_id,
      now.toISOString()
    );

    return { id, rawToken };
  }

  getGuestLinks(): any[] {
    return this.db.prepare(`
      SELECT gl.*, h.name as hierarchy_name, m.name as member_name, u.full_name as creator_name
      FROM guest_links gl
      JOIN hierarchies h ON gl.hierarchy_id = h.id
      LEFT JOIN members m ON gl.member_id = m.id
      JOIN users u ON gl.created_by_user_id = u.id
      ORDER BY gl.created_at DESC
    `).all();
  }

  revokeGuestLink(id: string): void {
    this.db.prepare("UPDATE guest_links SET is_revoked = 1 WHERE id = ?").run(id);
  }


  getGuestUserById(guestUserId: string): AuthContextUser | null {
    const linkId = guestUserId.replace("guest_", "");
    const link = this.db.prepare(`
      SELECT gl.*, h.name as hierarchy_name, m.name as member_name
      FROM guest_links gl
      JOIN hierarchies h ON gl.hierarchy_id = h.id
      LEFT JOIN members m ON gl.member_id = m.id
      WHERE gl.id = ? AND gl.is_revoked = 0
    `).get(linkId) as any;

    if (!link) return null;
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return null;
    }

    return {
      id: "guest_" + link.id,
      username: "guest_" + link.name.toLowerCase().replace(/\s+/g, "_"),
      email: "guest@link",
      full_name: `Guest (${link.name})`,
      status: "active",
      email_verified: false,
      role: {
        id: link.access_level === "editor" ? "role_editor" : "role_viewer",
        name: link.access_level === "editor" ? "Editor" : "Viewer",
        permissions: link.access_level === "editor"
          ? ["hierarchy:view", "level:view", "field:view", "member:view", "member:create", "member:edit", "data:export"]
          : ["hierarchy:view", "level:view", "field:view", "member:view", "data:export"]
      },
      scopes: [{
        id: "scope_guest_" + link.id,
        user_id: "guest_" + link.id,
        hierarchy_id: link.hierarchy_id,
        member_id: link.member_id || null,
        member_name: link.member_name || undefined,
        access_level: link.access_level
      }]
    };
  }

  generateGuestToken(link: any): string {
    return jwt.sign(
      {
        id: "guest_" + link.id,
        username: "guest_" + link.name.toLowerCase().replace(/\s+/g, "_"),
        role: link.access_level === "editor" ? "Editor" : "Viewer",
        isGuest: true,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
  }

  accessGuestLink(rawToken: string, password?: string): any {
    const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
    const link = this.db.prepare(`
      SELECT gl.*, h.name as hierarchy_name, m.name as member_name
      FROM guest_links gl
      JOIN hierarchies h ON gl.hierarchy_id = h.id
      LEFT JOIN members m ON gl.member_id = m.id
      WHERE gl.token_hash = ? AND gl.is_revoked = 0
    `).get(tokenHash) as any;

    if (!link) throw new Error("Invalid or revoked guest link.");

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      throw new Error("This guest access link has expired.");
    }

    if (link.password_hash) {
      if (!password || !bcrypt.compareSync(password, link.password_hash)) {
        throw new Error("Invalid guest link access password.");
      }
    }

    // Increment access count & update last accessed
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE guest_links 
      SET access_count = access_count + 1, last_accessed_at = ?
      WHERE id = ?
    `).run(now, link.id);

    const user = this.getGuestUserById("guest_" + link.id)!;
    const token = this.generateGuestToken(link);

    return { link, user, token };
  }
}
