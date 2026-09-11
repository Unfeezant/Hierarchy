import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service.js";
import { getDatabase } from "../config/database.js";
import { AuthContextUser } from "../types/index.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthContextUser;
      isGuest?: boolean;
      guestScope?: { hierarchy_id: string; member_id: string | null; access_level: string };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const db = getDatabase();
  const authService = new AuthService(db);

  const authHeader = req.headers.authorization;
  const directUserId = req.headers["x-user-id"] as string;
  const guestToken = req.headers["x-guest-token"] as string;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const payload = authService.verifyToken(token);
    if (payload && payload.id) {
      const user = authService.getUserById(payload.id);
      if (user) {
        if (user.status === "disabled") {
          res.status(403).json({ error: "Account deactivated by administrator." });
          return;
        }
        if (user.status === "locked") {
          res.status(403).json({ error: "Account temporarily locked." });
          return;
        }
        req.user = user;
        return next();
      }
    }
  }

  // Development header: X-User-Id
  if (directUserId) {
    const user = authService.getUserById(directUserId);
    if (user && user.status === "active") {
      req.user = user;
      return next();
    }
  }

  // Guest Link Token
  if (guestToken) {
    try {
      const guestLink = authService.accessGuestLink(guestToken);
      if (guestLink) {
        req.isGuest = true;
        req.guestScope = {
          hierarchy_id: guestLink.hierarchy_id,
          member_id: guestLink.member_id,
          access_level: guestLink.access_level
        };
        // Construct simulated viewer context for guest
        req.user = {
          id: "guest_" + guestLink.id,
          username: "guest_" + guestLink.name.toLowerCase().replace(/\s+/g, "_"),
          email: "guest@link",
          full_name: `Guest (${guestLink.name})`,
          status: "active",
          email_verified: false,
          role: {
            id: "role_guest",
            name: "Guest",
            permissions: guestLink.access_level === "editor" 
              ? ["hierarchy:view", "level:view", "field:view", "member:view", "member:create", "member:edit"]
              : ["hierarchy:view", "level:view", "field:view", "member:view"]
          },
          scopes: [{
            id: "scope_guest",
            user_id: "guest_" + guestLink.id,
            hierarchy_id: guestLink.hierarchy_id,
            member_id: guestLink.member_id,
            access_level: guestLink.access_level
          }]
        };
        return next();
      }
    } catch (err: any) {
      res.status(401).json({ error: err.message || "Invalid guest access token" });
      return;
    }
  }

  res.status(401).json({ error: "Authentication required. Please sign in." });
}

export function requirePermission(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Super Admin bypasses all checks
    if (req.user.role.name === "Super Admin" || req.user.role.id === "role_super_admin") {
      return next();
    }

    if (req.user.role.permissions.includes(permissionCode)) {
      return next();
    }

    return res.status(403).json({
      error: `Forbidden: Missing required permission "${permissionCode}"`
    });
  };
}

export function requireRecentVerification(maxMinutes = 15) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.user.recent_verified_at) {
      return res.status(403).json({
        requiresStepUp: true,
        error: "High-security action requires recent OTP verification."
      });
    }

    const elapsedMinutes = (Date.now() - new Date(req.user.recent_verified_at).getTime()) / 60000;
    if (elapsedMinutes > maxMinutes) {
      return res.status(403).json({
        requiresStepUp: true,
        error: "Session verification expired. Please confirm your OTP to proceed."
      });
    }

    return next();
  };
}
