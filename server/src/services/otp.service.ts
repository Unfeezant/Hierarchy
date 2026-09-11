import { Database } from "better-sqlite3";
import crypto from "crypto";
import { emailService } from "./email.service.js";

export class OtpService {
  constructor(private db: Database) {}

  private hashOtp(code: string): string {
    return crypto.createHash("sha256").update(code.trim()).digest("hex");
  }

  async generateOtp(
    email: string,
    purpose: "bootstrap" | "login" | "reset_password" | "step_up" | "verify_email",
    metadata: Record<string, any> = {},
    skipCooldown: boolean = false
  ): Promise<{ code: string; expiresAt: string; resendCooldownSeconds: number; isLiveSmtp: boolean; devOtpCode?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();

    // Check rate limit: 60s cooldown from last created OTP of the same purpose
    if (!skipCooldown) {
      const recentOtp = this.db.prepare(`
        SELECT created_at FROM otps 
        WHERE email = ? AND purpose = ? 
        ORDER BY created_at DESC LIMIT 1
      `).get(normalizedEmail, purpose) as { created_at: string } | undefined;

      if (recentOtp) {
        const elapsedSeconds = (now.getTime() - new Date(recentOtp.created_at).getTime()) / 1000;
        if (elapsedSeconds < 60) {
          const remaining = Math.ceil(60 - elapsedSeconds);
          throw new Error(`Please wait ${remaining} seconds before requesting a new verification code.`);
        }
      }
    }

    // Invalidate previous active OTPs for same email & purpose
    this.db.prepare(`
      UPDATE otps SET used_at = ? 
      WHERE email = ? AND purpose = ? AND used_at IS NULL
    `).run(now.toISOString(), normalizedEmail, purpose);

    // Generate cryptographic 6-digit code
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = this.hashOtp(code);
    const id = crypto.randomUUID();

    // 10 minutes expiry
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    this.db.prepare(`
      INSERT INTO otps (id, email, code_hash, purpose, metadata, attempts, max_attempts, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 5, ?, ?)
    `).run(id, normalizedEmail, codeHash, purpose, JSON.stringify(metadata), expiresAt, now.toISOString());

    // Dispatch OTP through EmailService (Brevo live SMTP relay or local audit)
    const emailSent = await emailService.sendOtp(normalizedEmail, code, purpose);

    const isLiveSmtp = emailService.isSmtpConfigured() && emailSent;

    return {
      code,
      expiresAt,
      resendCooldownSeconds: 60,
      isLiveSmtp,
      devOtpCode: isLiveSmtp ? undefined : code,
    };
  }

  verifyOtp(
    email: string,
    code: string,
    purpose: "bootstrap" | "login" | "reset_password" | "step_up" | "verify_email"
  ): { valid: boolean; error?: string; metadata?: Record<string, any> } {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();

    const otpRecord = this.db.prepare(`
      SELECT * FROM otps 
      WHERE email = ? AND purpose = ? AND used_at IS NULL 
      ORDER BY created_at DESC LIMIT 1
    `).get(normalizedEmail, purpose) as any;

    if (!otpRecord) {
      return { valid: false, error: "No active verification code found. Please request a new code." };
    }

    // Check expiration
    if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
      this.db.prepare("UPDATE otps SET used_at = ? WHERE id = ?").run(now, otpRecord.id);
      return { valid: false, error: "Verification code has expired. Please request a new code." };
    }

    // Check attempts limit
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      this.db.prepare("UPDATE otps SET used_at = ? WHERE id = ?").run(now, otpRecord.id);
      return { valid: false, error: "Too many incorrect attempts. Please request a new verification code." };
    }

    const inputHash = this.hashOtp(code);
    if (inputHash !== otpRecord.code_hash) {
      const updatedAttempts = otpRecord.attempts + 1;
      this.db.prepare("UPDATE otps SET attempts = ? WHERE id = ?").run(updatedAttempts, otpRecord.id);
      const remaining = otpRecord.max_attempts - updatedAttempts;
      return {
        valid: false,
        error: remaining > 0
          ? `Invalid verification code. ${remaining} attempts remaining.`
          : "Invalid verification code. Maximum attempts exceeded.",
      };
    }

    // Mark code as used
    this.db.prepare("UPDATE otps SET used_at = ? WHERE id = ?").run(now, otpRecord.id);

    let parsedMetadata = {};
    try {
      if (otpRecord.metadata) {
        parsedMetadata = JSON.parse(otpRecord.metadata);
      }
    } catch {
      // Ignore json parse
    }

    return { valid: true, metadata: parsedMetadata };
  }
}
