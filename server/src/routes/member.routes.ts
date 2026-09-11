import { Router } from "express";
import { MemberService } from "../services/member.service.js";
import { getDatabase } from "../config/database.js";
import { authMiddleware, requirePermission } from "../middleware/auth.js";
import { checkMemberBranchScope, checkParentBranchScope, getUserScopeMemberId, isUserAuthorizedForHierarchy } from "../middleware/scope.js";

const router = Router();

// Search members across hierarchy
router.get("/search", authMiddleware, requirePermission("member:view"), (req, res) => {
  const { q, hierarchy_id, level_id, limit } = req.query;
  if (hierarchy_id && !isUserAuthorizedForHierarchy(req.user, hierarchy_id as string)) {
    return res.status(403).json({ error: "Access denied to this hierarchy system." });
  }
  const db = getDatabase();
  const memberService = new MemberService(db);
  const scopeMemberId = getUserScopeMemberId(req.user, hierarchy_id as string);

  const results = memberService.searchRecords(q as string || "", {
    hierarchyId: hierarchy_id as string,
    levelId: level_id as string,
    scopeMemberId,
    limit: limit ? Number(limit) : 25
  });

  res.json(results);
});

// Root members of a hierarchy
router.get("/hierarchies/:hierarchyId/roots", authMiddleware, requirePermission("member:view"), (req, res) => {
  if (!isUserAuthorizedForHierarchy(req.user, req.params.hierarchyId)) {
    return res.status(403).json({ error: "Access denied to this hierarchy system." });
  }
  const db = getDatabase();
  const memberService = new MemberService(db);
  const scopeMemberId = getUserScopeMemberId(req.user, req.params.hierarchyId);

  // If user is scoped to a specific member, and that member is not a root, we return the scoped member as the root for them
  if (scopeMemberId) {
    const scopedMember = memberService.getRecord(scopeMemberId);
    if (scopedMember && scopedMember.parent_id !== null) {
      return res.json([scopedMember]);
    }
  }

  const roots = memberService.getChildren(null, req.params.hierarchyId, scopeMemberId);
  res.json(roots);
});

// Level-wide members view (all records at this level across branches)
router.get("/levels/:levelId/records", authMiddleware, requirePermission("member:view"), (req, res) => {
  const { page, limit, sortKey, sortOrder, search, hierarchy_id, ...restQueries } = req.query;

  const db = getDatabase();
  const levelRow = db.prepare("SELECT hierarchy_id FROM levels WHERE id = ?").get(req.params.levelId) as any;
  if (!levelRow) {
    return res.status(404).json({ error: "Level not found" });
  }
  if (!isUserAuthorizedForHierarchy(req.user, levelRow.hierarchy_id)) {
    return res.status(403).json({ error: "Access denied to this hierarchy system." });
  }

  const memberService = new MemberService(db);
  const scopeMemberId = getUserScopeMemberId(req.user, hierarchy_id as string);

  // Remaining query params are treated as field filters
  const filters: Record<string, any> = {};
  for (const [k, v] of Object.entries(restQueries)) {
    if (k.startsWith("filter_")) {
      const fieldKey = k.replace("filter_", "");
      filters[fieldKey] = v;
    }
  }

  const result = memberService.getRecords(req.params.levelId, {
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 50,
    sortKey: sortKey as string,
    sortOrder: sortOrder as "asc" | "desc",
    search: search as string,
    filters,
    scopeMemberId,
    hierarchyId: hierarchy_id as string
  });

  res.json(result);
});

// Single member details
router.get("/members/:id", authMiddleware, requirePermission("member:view"), checkMemberBranchScope("id"), (req, res) => {
  const db = getDatabase();
  const memberService = new MemberService(db);
  const member = memberService.getRecord(req.params.id);
  if (!member) return res.status(404).json({ error: "Record not found" });
  res.json(member);
});

// Member parent
router.get("/members/:id/parent", authMiddleware, requirePermission("member:view"), checkMemberBranchScope("id"), (req, res) => {
  const db = getDatabase();
  const memberService = new MemberService(db);
  const parent = memberService.getParent(req.params.id);
  res.json(parent);
});

// Member children
router.get("/members/:id/children", authMiddleware, requirePermission("member:view"), checkMemberBranchScope("id"), (req, res) => {
  const db = getDatabase();
  const memberService = new MemberService(db);
  const children = memberService.getChildren(req.params.id);
  res.json(children);
});

// Member ancestors (breadcrumb trail)
router.get("/members/:id/ancestors", authMiddleware, requirePermission("member:view"), checkMemberBranchScope("id"), (req, res) => {
  const db = getDatabase();
  const memberService = new MemberService(db);
  const ancestors = memberService.getAncestors(req.params.id);
  res.json(ancestors);
});

// Member descendants
router.get("/members/:id/descendants", authMiddleware, requirePermission("member:view"), checkMemberBranchScope("id"), (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 200;
  const db = getDatabase();
  const memberService = new MemberService(db);
  const descendants = memberService.getDescendants(req.params.id, limit);
  res.json(descendants);
});

// Create member
router.post("/members", authMiddleware, requirePermission("member:create"), checkParentBranchScope("parent_id"), (req, res) => {
  const { hierarchy_id, level_id, parent_id, name, custom_data } = req.body;
  if (!hierarchy_id || !level_id || !name || !name.trim()) {
    return res.status(400).json({ error: "hierarchy_id, level_id, and name are required" });
  }

  try {
    const db = getDatabase();
    const memberService = new MemberService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const created = memberService.createRecord(
      {
        hierarchy_id,
        level_id,
        parent_id,
        name,
        custom_data
      },
      actor
    );
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Update member
router.put("/members/:id", authMiddleware, requirePermission("member:edit"), checkMemberBranchScope("id"), (req, res) => {
  const { name, custom_data } = req.body;

  try {
    const db = getDatabase();
    const memberService = new MemberService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const updated = memberService.updateRecord(req.params.id, { name, custom_data }, actor);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Move member
router.post("/members/:id/move", authMiddleware, requirePermission("member:move"), checkMemberBranchScope("id"), checkParentBranchScope("new_parent_id"), (req, res) => {
  const { new_parent_id } = req.body;

  try {
    const db = getDatabase();
    const memberService = new MemberService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const moved = memberService.moveRecord(req.params.id, new_parent_id ?? null, actor);
    res.json(moved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete member
router.delete("/members/:id", authMiddleware, requirePermission("member:delete"), checkMemberBranchScope("id"), (req, res) => {
  try {
    const db = getDatabase();
    const memberService = new MemberService(db);
    const actor = { id: req.user!.id, name: req.user!.full_name };
    const result = memberService.deleteRecord(req.params.id, actor);
    res.json({ message: "Record and subtree deleted successfully", ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
