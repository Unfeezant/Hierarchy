import { Request, Response, NextFunction } from "express";
import { getDatabase } from "../config/database.js";
import { MemberService } from "../services/member.service.js";
import { AuthContextUser } from "../types/index.js";

export function isUserAuthorizedForHierarchy(user?: AuthContextUser | null, hierarchyId?: string): boolean {
  if (!user || !hierarchyId) return false;
  // Super Admin has global unrestricted access to all hierarchies
  if (
    user.role.id === "role_super_admin" ||
    user.role.name === "Super Admin" ||
    user.role.name?.toLowerCase().includes("super")
  ) {
    return true;
  }

  // If user has scopes configured, they MUST have a scope matching this hierarchy
  if (user.scopes && user.scopes.length > 0) {
    return user.scopes.some(s => s.hierarchy_id === hierarchyId);
  }

  // If user is an Administrator with no specific scope restrictions, they have global admin access
  if (user.role.id === "role_admin" || user.role.name === "Administrator") {
    return true;
  }

  return false;
}

export function getUserScopeMemberId(user?: AuthContextUser, hierarchyId?: string): string | null {
  if (!user) return null;
  if (
    user.role.id === "role_super_admin" ||
    user.role.name === "Super Admin" ||
    user.role.name?.toLowerCase().includes("super")
  ) {
    return null; // Global unrestricted for Super Admin
  }

  // Check user scopes
  const relevantScopes = (user.scopes || []).filter(s => !hierarchyId || s.hierarchy_id === hierarchyId);
  if (relevantScopes.length === 0) {
    // If unrestricted Administrator without scopes, allow full access
    if (user.role.id === "role_admin" || user.role.name === "Administrator") {
      return null;
    }
    return null;
  }

  // If any scope is global to this hierarchy (member_id === null), user has access to whole hierarchy
  if (relevantScopes.some(s => s.member_id === null)) {
    return null;
  }

  // Return the first scoped branch root
  return relevantScopes[0].member_id;
}

export function checkHierarchyScope(paramOrBodyField = "id", isBody = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const hierarchyId = isBody 
      ? req.body[paramOrBodyField] 
      : (req.params[paramOrBodyField] || req.query[paramOrBodyField]);
    if (!hierarchyId) return next();

    if (!isUserAuthorizedForHierarchy(req.user, hierarchyId as string)) {
      return res.status(403).json({
        error: "Forbidden: You are not authorized to view or access this hierarchy system."
      });
    }

    next();
  };
}

export function checkMemberBranchScope(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const memberId = req.params[paramName];
    if (!memberId) return next();

    const db = getDatabase();
    const memberService = new MemberService(db);
    const member = memberService.getRecord(memberId);

    if (!member) {
      return res.status(404).json({ error: "Record not found" });
    }

    const scopeMemberId = getUserScopeMemberId(req.user, member.hierarchy_id);
    if (!scopeMemberId) {
      return next(); // Unrestricted
    }

    // Verify member is within scope: either the scoped root itself or one of its descendants
    const isWithinScope = member.id === scopeMemberId || member.path.includes(`/${scopeMemberId}/`);
    if (!isWithinScope) {
      return res.status(403).json({
        error: "Forbidden: You are not authorized to view or modify records outside your assigned branch scope."
      });
    }

    next();
  };
}

export function checkParentBranchScope(bodyField = "parent_id") {
  return (req: Request, res: Response, next: NextFunction) => {
    const parentId = req.body[bodyField];
    if (!parentId) return next(); // Root creation handled separately

    const db = getDatabase();
    const memberService = new MemberService(db);
    const parent = memberService.getRecord(parentId);

    if (!parent) {
      return res.status(404).json({ error: "Parent record not found" });
    }

    const scopeMemberId = getUserScopeMemberId(req.user, parent.hierarchy_id);
    if (!scopeMemberId) {
      return next(); // Unrestricted
    }

    const isWithinScope = parent.id === scopeMemberId || parent.path.includes(`/${scopeMemberId}/`);
    if (!isWithinScope) {
      return res.status(403).json({
        error: "Forbidden: You are not authorized to create or move records under a parent outside your assigned branch scope."
      });
    }

    next();
  };
}
