import nodemailer, { Transporter } from "nodemailer";
import fs from "fs";
import path from "path";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailService {
  private devLogPath: string;
  private workingPort?: number;
  private transporterCache = new Map<number, Transporter>();

  constructor() {
    this.devLogPath = path.resolve(process.cwd(), "email_dispatches.log");
  }

  isSmtpConfigured(): boolean {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    return Boolean(user && pass);
  }

  private createTransporter(port: number): Transporter | null {
    const host = process.env.SMTP_HOST || "smtp-relay.brevo.com";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      return null;
    }

    const isSecure = process.env.SMTP_SECURE === "true" || port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: { user, pass },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000,
    });
  }

  private getCandidatePorts(): number[] {
    const configuredPort = parseInt(process.env.SMTP_PORT || "2525", 10);
    // Try 2525 and 465 first on cloud hosts since 587 is often blocked on free-tier firewalls
    const ports = this.workingPort 
      ? [this.workingPort, configuredPort, 2525, 465, 587]
      : [configuredPort, 2525, 465, 587];
    return Array.from(new Set(ports));
  }

  async verifyConnection(): Promise<{ success: boolean; port?: number; error?: string }> {
    if (!this.isSmtpConfigured()) {
      return { 
        success: false, 
        error: "SMTP credentials not configured in environment (SMTP_USER, SMTP_PASS)" 
      };
    }

    const candidatePorts = this.getCandidatePorts();
    let lastError = "Connection timeout";

    for (const port of candidatePorts) {
      try {
        const transporter = this.createTransporter(port);
        if (!transporter) continue;
        console.log(`[SMTP] Attempting verification on port ${port}...`);
        await transporter.verify();
        this.workingPort = port;
        console.log(`\x1b[32m[SMTP VERIFIED]\x1b[0m Successfully connected via port ${port}`);
        return { success: true, port };
      } catch (err: any) {
        lastError = `${err.message} (port ${port})`;
        console.warn(`[SMTP] Port ${port} failed or timed out: ${err.message}`);
      }
    }

    return { success: false, error: lastError };
  }

  async sendMail(options: SendEmailOptions): Promise<boolean> {
    const fromAddress = process.env.SMTP_FROM || '"Hierarchy Enterprise" <noreply@unthink.io>';
    const timestamp = new Date().toISOString();

    if (!this.isSmtpConfigured()) {
      const logEntry = `[EMAIL DISPATCH - ${timestamp}] [DEV_MODE]\nTo: ${options.to}\nSubject: ${options.subject}\nContent:\n${options.text}\n----------------------------------------\n`;
      console.log(`\x1b[36m[EMAIL DISPATCH - DEV_MODE]\x1b[0m To: ${options.to} | Subject: ${options.subject}`);
      try { fs.appendFileSync(this.devLogPath, logEntry, "utf8"); } catch {}
      return false;
    }

    const candidatePorts = this.getCandidatePorts();
    let isSuccess = false;
    let successfulPort: number | undefined;
    let lastError: string | undefined;

    for (const port of candidatePorts) {
      try {
        const transporter = this.createTransporter(port);
        if (!transporter) continue;

        console.log(`[SMTP] Dispatching email to ${options.to} via port ${port}...`);
        const info = await transporter.sendMail({
          from: fromAddress,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });

        isSuccess = true;
        successfulPort = port;
        this.workingPort = port;
        console.log(`\x1b[32m[EMAIL SMTP SUCCESS]\x1b[0m Sent to ${options.to} via port ${port} (ID: ${info.messageId})`);
        break;
      } catch (error: any) {
        lastError = `${error.message} (port ${port})`;
        console.warn(`[EMAIL SMTP WARN] Port ${port} failed: ${error.message}. Trying alternative port...`);
      }
    }

    const smtpStatus = isSuccess 
      ? `LIVE_SMTP_SENT (Port: ${successfulPort})` 
      : `LIVE_SMTP_FAILED (${lastError})`;

    const logEntry = `[EMAIL DISPATCH - ${timestamp}] [${smtpStatus}]\nTo: ${options.to}\nSubject: ${options.subject}\nContent:\n${options.text}\n----------------------------------------\n`;
    try { fs.appendFileSync(this.devLogPath, logEntry, "utf8"); } catch {}

    return isSuccess;
  }

  async sendOtp(email: string, code: string, purpose: string): Promise<boolean> {
    const purposeTitles: Record<string, string> = {
      bootstrap: "Super Administrator Setup Verification Code",
      login: "Your Sign-In One-Time Passcode",
      reset_password: "Password Reset Verification Code",
      step_up: "High-Security Action Authorization Code",
      verify_email: "Email Verification Code",
    };

    const title = purposeTitles[purpose] || "Verification Code";
    const subject = `[${code}] ${title} - Hierarchy Pyramid`;

    const text = `Your verification code is: ${code}\n\nThis code was requested for ${title.toLowerCase()}. It will expire in 10 minutes.\n\nIf you did not make this request, please contact security immediately.`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #27272a; background-color: #09090b; color: #f4f4f5;">
        <div style="border-bottom: 2px solid #3f3f46; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #ffffff;">Hierarchy Pyramid Enterprise</h2>
        </div>
        <p style="font-size: 14px; color: #a1a1aa; margin-bottom: 16px;">${title}</p>
        <div style="background-color: #18181b; border: 1px solid #3f3f46; padding: 20px; text-align: center; margin-bottom: 20px;">
          <span style="font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 0.25em; color: #ffffff;">${code}</span>
        </div>
        <p style="font-size: 13px; color: #71717a; margin-bottom: 8px;">Valid for 10 minutes. Single-use only.</p>
        <p style="font-size: 12px; color: #52525b; margin-top: 24px; border-top: 1px solid #27272a; padding-top: 16px;">If you did not initiate this request, you can safely ignore this email.</p>
      </div>
    `;

    return this.sendMail({ to: email, subject, text, html });
  }

  async sendInvitation(email: string, roleName: string, inviterName: string): Promise<boolean> {
    const appUrl = process.env.APP_URL || "https://unfeezant.github.io/Hierarchy/";
    const subject = `You have been invited to Hierarchy Pyramid by ${inviterName}`;

    const text = `Hello,\n\n${inviterName} has invited you to join the Hierarchy Pyramid system as "${roleName}".\n\nTo access the system and activate your administrator profile, visit:\n${appUrl}\n\nOn the sign-in page, select "EMAIL OTP", enter your corporate email (${email}), and you will receive your personal sign-in passcode to complete setup.\n\nThis invitation is valid for 7 days.`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; border: 1px solid #27272a; background-color: #09090b; color: #f4f4f5;">
        <div style="border-bottom: 2px solid #3f3f46; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #ffffff;">Hierarchy Pyramid Enterprise</h2>
        </div>
        <p style="font-size: 15px; color: #f4f4f5; margin-bottom: 12px;"><strong>${inviterName}</strong> has invited you to join as <strong>${roleName}</strong>.</p>
        <p style="font-size: 13px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px;">
          You have been granted administrator access to the platform. Open the portal below, select <strong>EMAIL OTP</strong>, and enter your email address (<span style="color: #ffffff; font-family: monospace;">${email}</span>) to receive your sign-in verification code.
        </p>
        <div style="margin: 24px 0;">
          <a href="${appUrl}" style="background-color: #ffffff; color: #000000; padding: 12px 24px; text-decoration: none; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block;">Open Application Portal</a>
        </div>
        <p style="font-size: 12px; color: #71717a;">Portal URL: <a href="${appUrl}" style="color: #a1a1aa;">${appUrl}</a></p>
        <p style="font-size: 12px; color: #52525b; margin-top: 24px; border-top: 1px solid #27272a; padding-top: 16px;">This invitation is valid for 7 days.</p>
      </div>
    `;

    return this.sendMail({ to: email, subject, text, html });
  }

  async sendPasswordReset(email: string, code: string): Promise<boolean> {
    return this.sendOtp(email, code, "reset_password");
  }
}

export const emailService = new EmailService();
