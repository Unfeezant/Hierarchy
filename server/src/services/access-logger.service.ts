import fs from "fs";
import path from "path";

export interface AccessLogEntry {
  timestamp: string;
  eventType: "GUEST_ACCESS" | "LOGIN_PASSWORD" | "LOGIN_OTP" | "BOOTSTRAP" | "INVITATION_ACCEPT" | "API_ACCESS" | "AUTH_FAILURE";
  userId?: string | null;
  username?: string | null;
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  guestLinkName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  targetHierarchy?: string | null;
  targetMember?: string | null;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  details?: string | null;
}

export class AccessLoggerService {
  private logFilePath: string;

  constructor() {
    this.logFilePath = path.resolve(process.cwd(), "access_history.log");
  }

  logAccess(entry: AccessLogEntry): void {
    const timestamp = entry.timestamp || new Date().toISOString();
    const formattedLine = [
      `[${timestamp}]`,
      `EVENT: ${entry.eventType}`,
      `STATUS: ${entry.status}`,
      `USER: ${entry.fullName || entry.username || entry.email || (entry.guestLinkName ? `Guest (${entry.guestLinkName})` : "Anonymous")}`,
      `ROLE: ${entry.role || "N/A"}`,
      `IP: ${entry.ipAddress || "Unknown"}`,
      entry.targetHierarchy ? `HIERARCHY: ${entry.targetHierarchy}` : null,
      entry.targetMember ? `MEMBER_SCOPE: ${entry.targetMember}` : null,
      entry.details ? `DETAILS: ${entry.details}` : null,
      `UA: ${entry.userAgent || "Unknown"}`
    ].filter(Boolean).join(" | ") + "\n";

    try {
      fs.appendFileSync(this.logFilePath, formattedLine, "utf8");
    } catch (err) {
      console.error("Failed to write to access_history.log:", err);
    }
  }

  getRecentLogs(limit = 100): string[] {
    try {
      if (!fs.existsSync(this.logFilePath)) return [];
      const content = fs.readFileSync(this.logFilePath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.slice(-limit).reverse();
    } catch {
      return [];
    }
  }
}

export const accessLogger = new AccessLoggerService();
