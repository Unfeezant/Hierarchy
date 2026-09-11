import { Router } from "express";
import crypto from "crypto";
import { AuthService } from "../services/auth.service.js";
import { MemberService } from "../services/member.service.js";
import { getDatabase } from "../config/database.js";
import { accessLogger } from "../services/access-logger.service.js";

const router = Router();

// 1. Verify link info before prompting for password
router.get("/verify/:token", (req, res) => {
  const { token } = req.params;
  const db = getDatabase();
  try {
    const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");
    const link = db.prepare(`
      SELECT gl.id, gl.name, gl.hierarchy_id, gl.member_id, gl.access_level, gl.expires_at, gl.is_revoked,
             CASE WHEN gl.password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password,
             h.name as hierarchy_name, m.name as member_name
      FROM guest_links gl
      JOIN hierarchies h ON gl.hierarchy_id = h.id
      LEFT JOIN members m ON gl.member_id = m.id
      WHERE gl.token_hash = ?
    `).get(tokenHash) as any;

    if (!link || link.is_revoked) {
      return res.status(404).json({ error: "This guest link is invalid or has been revoked." });
    }

    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: "This guest link has expired." });
    }

    res.json({
      name: link.name,
      hierarchy_id: link.hierarchy_id,
      hierarchy_name: link.hierarchy_name,
      member_id: link.member_id,
      member_name: link.member_name,
      access_level: link.access_level,
      hasPassword: Boolean(link.has_password)
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Redeem Guest Link & Issue Scoped Session Token
router.post("/access", (req, res) => {
  const { token, password } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Guest access token is required." });
  }

  const clientIp = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    const db = getDatabase();
    const authService = new AuthService(db);
    const result = authService.accessGuestLink(token, password);

    let branchInfo = null;
    if (result.link.member_id) {
      const memberService = new MemberService(db);
      branchInfo = memberService.getRecord(result.link.member_id);
    }

    // Log access to separate access history file
    accessLogger.logAccess({
      timestamp: new Date().toISOString(),
      eventType: "GUEST_ACCESS",
      guestLinkName: result.link.name,
      role: `Guest (${result.link.access_level})`,
      ipAddress: clientIp,
      userAgent: userAgent,
      targetHierarchy: result.link.hierarchy_name,
      targetMember: result.link.member_name,
      status: "SUCCESS",
      details: `Accessed guest link "${result.link.name}". Granted ${result.link.access_level} access to ${result.link.hierarchy_name}.`
    });

    res.json({
      token: result.token,
      user: result.user,
      id: result.link.id,
      name: result.link.name,
      hierarchy_id: result.link.hierarchy_id,
      hierarchy_name: result.link.hierarchy_name,
      member_id: result.link.member_id,
      member_name: result.link.member_name,
      access_level: result.link.access_level,
      link: {
        id: result.link.id,
        name: result.link.name,
        hierarchy_id: result.link.hierarchy_id,
        hierarchy_name: result.link.hierarchy_name,
        member_id: result.link.member_id,
        member_name: result.link.member_name,
        access_level: result.link.access_level
      },
      branch: branchInfo
    });
  } catch (err: any) {
    // Log failed guest access attempt
    accessLogger.logAccess({
      timestamp: new Date().toISOString(),
      eventType: "GUEST_ACCESS",
      ipAddress: clientIp,
      userAgent: userAgent,
      status: "FAILED",
      details: `Failed guest link access: ${err.message}`
    });
    res.status(401).json({ error: err.message });
  }
});

export default router;
