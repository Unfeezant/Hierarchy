import { accessLogger } from "../services/access-logger.service.js";
import { Router } from "express";
import { AuthService } from "../services/auth.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// 1. Bootstrap Status
router.get("/bootstrap/status", (req, res) => {
  const db = getDatabase();
  const authService = new AuthService(db);
  const bootstrapRequired = authService.isBootstrapRequired();
  res.json({ bootstrapRequired });
});

// 2. Bootstrap Request OTP
router.post("/bootstrap/request-otp", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "A valid corporate or administrator email address is required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = await authService.requestBootstrapOtp(email);
    res.json({
      success: true,
      message: result.isLiveSmtp
        ? "Verification code sent to your email inbox."
        : "Verification code generated.",
      expiresAt: result.expiresAt,
      resendCooldownSeconds: result.resendCooldownSeconds,
      isLiveSmtp: result.isLiveSmtp,
      devOtpCode: result.devOtpCode
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Bootstrap Confirm First Super Admin
router.post("/bootstrap/confirm", (req, res) => {
  const { username, email, password, full_name, otpCode } = req.body;
  if (!username || !email || !password || !full_name || !otpCode) {
    return res.status(400).json({ error: "All fields including the verification code are required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = authService.bootstrapFirstAdmin({
      username,
      email,
      password,
      full_name,
      otpCode
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Primary Sign In (Email or Username + Password)
router.post("/login", (req, res) => {
  const { username, identifier, password } = req.body;
  const loginId = identifier || username;

  if (!loginId || !password) {
    return res.status(400).json({ error: "Username/email and password are required." });
  }

  const clientIp = req.ip || req.socket.remoteAddress;

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = authService.authenticate(loginId, password, clientIp);
    accessLogger.logAccess({
      timestamp: new Date().toISOString(),
      eventType: "LOGIN_PASSWORD",
      username: result.user.username,
      fullName: result.user.full_name,
      email: result.user.email,
      role: result.user.role.name,
      ipAddress: clientIp,
      userAgent: req.headers["user-agent"],
      status: "SUCCESS"
    });
    res.json(result);
  } catch (err: any) {
    accessLogger.logAccess({
      timestamp: new Date().toISOString(),
      eventType: "AUTH_FAILURE",
      username: loginId,
      ipAddress: clientIp,
      userAgent: req.headers["user-agent"],
      status: "FAILED",
      details: err.message
    });
    res.status(401).json({ error: err.message });
  }
});

// 5. Passwordless OTP Sign In: Request OTP (supports invited admins & existing users)
router.post("/otp/login-request", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email address is required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = await authService.requestLoginOtp(email);
    res.json({
      success: true,
      message: result.isLiveSmtp
        ? (result.isInvite ? `Administrator invitation passcode sent to ${email}.` : "Sign-in code sent to your email inbox.")
        : (result.isInvite ? "Administrator invitation code generated." : "Sign-in code generated."),
      expiresAt: result.expiresAt,
      resendCooldownSeconds: result.resendCooldownSeconds,
      isLiveSmtp: result.isLiveSmtp,
      devOtpCode: result.devOtpCode,
      isInvite: result.isInvite || false,
      roleName: result.roleName,
      inviterName: result.inviterName
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Passwordless OTP Sign In: Confirm
router.post("/otp/login-confirm", (req, res) => {
  const { email, code, username, full_name, password } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: "Email and verification code are required." });
  }

  const clientIp = req.ip || req.socket.remoteAddress;

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = (username || full_name || password)
      ? authService.confirmInvitationWithOtp({ email, code, username, full_name, password, ip: clientIp })
      : authService.authenticateWithOtp(email, code, clientIp);

    accessLogger.logAccess({
      timestamp: new Date().toISOString(),
      eventType: "LOGIN_OTP",
      username: result.user.username,
      fullName: result.user.full_name,
      email: result.user.email,
      role: result.user.role.name,
      ipAddress: clientIp,
      userAgent: req.headers["user-agent"],
      status: "SUCCESS"
    });

    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// 6b. Confirm Invitation Onboarding via OTP
router.post("/otp/invite-confirm", (req, res) => {
  const { email, code, username, full_name, password } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: "Email and verification code are required." });
  }

  const clientIp = req.ip || req.socket.remoteAddress;

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = authService.confirmInvitationWithOtp({
      email,
      code,
      username,
      full_name,
      password,
      ip: clientIp
    });

    accessLogger.logAccess({
      timestamp: new Date().toISOString(),
      eventType: "INVITATION_ACCEPT",
      username: result.user.username,
      fullName: result.user.full_name,
      email: result.user.email,
      role: result.user.role.name,
      ipAddress: clientIp,
      userAgent: req.headers["user-agent"],
      status: "SUCCESS"
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Password Reset: Request OTP
router.post("/password-reset/request", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email address is required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = await authService.requestPasswordResetOtp(email);
    res.json({
      success: true,
      message: "Password reset code sent to your email.",
      expiresAt: result.expiresAt
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Password Reset: Confirm
router.post("/password-reset/confirm", (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: "Email, code, and new password are required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.resetPasswordWithOtp(email, code, newPassword);
    res.json({ success: true, message: "Password updated successfully. You may now sign in." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Step-Up Verification: Request OTP for high-security action
router.post("/step-up/request-otp", authMiddleware, async (req, res) => {
  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = await authService.requestStepUpOtp(req.user!.id);
    res.json({
      success: true,
      message: "Authorization verification code sent to your email.",
      expiresAt: result.expiresAt
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Step-Up Verification: Verify
router.post("/step-up/verify", authMiddleware, (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Verification code is required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    authService.verifyStepUpOtp(req.user!.id, code);
    res.json({ success: true, message: "Step-up authorization verified." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Current Authenticated User Session
router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// 12. Sign Out
router.post("/logout", authMiddleware, (req, res) => {
  res.json({ success: true, message: "Logged out successfully." });
});

// 13. Public Invitation Info
router.get("/invitations/:token", (req, res) => {
  const db = getDatabase();
  const authService = new AuthService(db);
  const inv = authService.getInvitationByToken(req.params.token);
  if (!inv) {
    return res.status(404).json({ error: "Invitation link is invalid or expired." });
  }
  res.json({
    email: inv.email,
    role_name: inv.role_name,
    invited_by_name: inv.invited_by_name,
    scopes: inv.scopes,
    expires_at: inv.expires_at
  });
});

// 14. Accept Invitation
router.post("/invitations/accept", (req, res) => {
  const { token, username, password, full_name } = req.body;
  if (!token || !username || !password || !full_name) {
    return res.status(400).json({ error: "All registration fields are required." });
  }

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = authService.acceptInvitation({ token, username, password, full_name });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Development Switch User helper
router.post("/switch", (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "User ID required" });
  }

  const db = getDatabase();
  const authService = new AuthService(db);
  const user = authService.getUserById(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const token = authService.generateToken(user);
  res.json({ user, token });
});

// 15. Get all available system roles
router.get("/roles", authMiddleware, (req, res) => {
  const db = getDatabase();
  const authService = new AuthService(db);
  const roles = authService.getRoles();
  res.json(roles);
});

export default router;
