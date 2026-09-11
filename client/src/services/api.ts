import {
  ManagedUser,
  GuestLink,
  Hierarchy,
  Level,
  FieldDefinition,
  Member,
  AuthUser,
  AuditLog,
  PyramidTierSummary
} from "../types/index.js";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${(import.meta.env.VITE_API_BASE_URL as string).replace(/\/+$/, "")}/api`
  : "/api";
const BASE_URL = API_BASE_URL;

function getHeaders(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  const headers: HeadersInit = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const activeUserId = localStorage.getItem("active_user_id");
  if (activeUserId) {
    headers["X-User-Id"] = activeUserId;
  }
  return headers;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers
    }
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `HTTP error ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Enterprise Auth & Admin Bootstrap
  getBootstrapStatus: () => request<{ bootstrapRequired: boolean }>("/auth/bootstrap/status"),
  requestBootstrapOtp: (email: string) =>
    request<{ success: boolean; message: string; expiresAt: string; resendCooldownSeconds: number; isLiveSmtp?: boolean; devOtpCode?: string }>("/auth/bootstrap/request-otp", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  confirmBootstrap: (data: { username: string; email: string; password: string; full_name: string; otpCode: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/bootstrap/confirm", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  loginWithPassword: (credentials: { identifier: string; password: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    }),
  requestLoginOtp: (email: string) =>
    request<{
      success: boolean;
      message: string;
      expiresAt: string;
      resendCooldownSeconds: number;
      isLiveSmtp?: boolean;
      devOtpCode?: string;
      isInvite?: boolean;
      roleName?: string;
      inviterName?: string;
    }>("/auth/otp/login-request", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  confirmLoginOtp: (email: string, code: string, extra?: { username?: string; full_name?: string; password?: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/otp/login-confirm", {
      method: "POST",
      body: JSON.stringify({ email, code, ...(extra || {}) })
    }),
  confirmInviteOtp: (data: { email: string; code: string; username?: string; full_name?: string; password?: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/otp/invite-confirm", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  requestPasswordReset: (email: string) =>
    request<{ success: boolean; message: string }>("/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  confirmPasswordReset: (data: { email: string; code: string; newPassword: string }) =>
    request<{ success: boolean; message: string }>("/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  requestStepUpOtp: () =>
    request<{ success: boolean; message: string; expiresAt: string }>("/auth/step-up/request-otp", {
      method: "POST"
    }),
  verifyStepUpOtp: (code: string) =>
    request<{ success: boolean; message: string }>("/auth/step-up/verify", {
      method: "POST",
      body: JSON.stringify({ code })
    }),
  logout: () =>
    request<{ success: boolean }>("/auth/logout", {
      method: "POST"
    }),
  getInvitation: (token: string) =>
    request<{ email: string; role_name: string; invited_by_name: string; scopes: any[]; expires_at: string }>(
      `/auth/invitations/${token}`
    ),
  acceptInvitation: (data: { token: string; username: string; password: string; full_name: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/invitations/accept", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  // Admin Management Endpoints
  getManagedUsers: () => request<ManagedUser[]>("/admin/users"),
  inviteUser: (data: { email: string; role_id: string; scopes?: any[] }) =>
    request<{ invitationId: string; rawToken: string; expiresAt: string }>("/admin/invite", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  updateUserStatus: (id: string, status: "active" | "disabled" | "locked") =>
    request<{ success: boolean; message: string }>(`/admin/users/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status })
    }),
  updateUserRole: (id: string, role_id: string) =>
    request<{ success: boolean; message: string }>(`/admin/users/${id}/role`, {
      method: "POST",
      body: JSON.stringify({ role_id })
    }),
  deleteUser: (id: string) =>
    request<{ success: boolean; message: string }>(`/admin/users/${id}`, {
      method: "DELETE"
    }),
  getAdminGuestLinks: () => request<GuestLink[]>("/admin/guest-links"),
  createGuestLink: (data: {
    name: string;
    hierarchy_id: string;
    member_id?: string | null;
    password?: string;
    access_level?: "viewer" | "editor";
    expires_in_days?: number;
  }) =>
    request<{ id: string; rawToken: string }>("/admin/guest-links", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  revokeGuestLink: (id: string) =>
    request<{ success: boolean; message: string }>(`/admin/guest-links/${id}/revoke`, {
      method: "POST"
    }),
  verifyGuestLink: (token: string) =>
    request<{
      name: string;
      hierarchy_id: string;
      hierarchy_name: string;
      member_id: string | null;
      member_name: string | null;
      access_level: string;
      hasPassword: boolean;
    }>(`/guest/verify/${token}`),
  accessGuestLink: (token: string, password?: string) =>
    request<{
      token: string;
      user: AuthUser;
      hierarchy_id: string;
      hierarchy_name: string;
      member_id: string | null;
      member_name: string | null;
      access_level: string;
      branch?: any;
    }>("/guest/access", {
      method: "POST",
      body: JSON.stringify({ token, password })
    }),
  getAccessLogs: (limit = 100) =>
    request<{ logFilePath: string; totalLines: number; logs: string[] }>(`/admin/access-logs?limit=${limit}`),
  getSmtpStatus: () =>
    request<{
      configured: boolean;
      host: string | null;
      user: string | null;
      from: string | null;
      verified: boolean;
      error: string | null;
    }>("/admin/smtp-status"),
  testSmtpEmail: (to?: string) =>
    request<{ success: boolean; recipient: string }>("/admin/smtp-test", {
      method: "POST",
      body: JSON.stringify({ to })
    }),
  updateSmtpConfig: (data: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from?: string;
    secure?: boolean;
  }) =>
    request<{ success: boolean; verified: boolean; error: string | null }>("/admin/smtp-config", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  // Auth
  login: (credentials: { username: string; password?: string }) =>
    request<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    }),
  getMe: () => request<{ user: AuthUser }>("/auth/me"),
  getUsers: () => request<any[]>("/auth/users"),
  getRoles: () => request<any[]>("/auth/roles"),
  switchUser: (userId: string) =>
    request<{ token: string; user: AuthUser }>("/auth/switch", {
      method: "POST",
      body: JSON.stringify({ userId })
    }),

  // Hierarchies
  getHierarchies: () => request<Hierarchy[]>("/hierarchies"),
  getHierarchy: (id: string) => request<Hierarchy>(`/hierarchies/${id}`),
  createHierarchy: (data: { name: string; description?: string }) =>
    request<Hierarchy>("/hierarchies", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  updateHierarchy: (id: string, data: { name?: string; description?: string }) =>
    request<Hierarchy>(`/hierarchies/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    }),
  deleteHierarchy: (id: string) =>
    request<{ message: string }>(`/hierarchies/${id}`, {
      method: "DELETE"
    }),
  getPyramidSummary: (id: string) =>
    request<{ tiers: PyramidTierSummary[]; totalMembers: number }>(`/hierarchies/${id}/pyramid`),

  // Levels
  getLevels: (hierarchyId: string) =>
    request<Level[]>(`/hierarchies/${hierarchyId}/levels`),
  getLevel: (id: string) => request<Level>(`/levels/${id}`),
  createLevel: (hierarchyId: string, data: Partial<Level>) =>
    request<Level>(`/hierarchies/${hierarchyId}/levels`, {
      method: "POST",
      body: JSON.stringify(data)
    }),
  updateLevel: (id: string, data: Partial<Level>) =>
    request<Level>(`/levels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    }),
  deleteLevel: (id: string) =>
    request<{ message: string }>(`/levels/${id}`, {
      method: "DELETE"
    }),
  reorderLevels: (hierarchyId: string, levelIds: string[]) =>
    request<{ message: string }>(`/hierarchies/${hierarchyId}/levels/reorder`, {
      method: "POST",
      body: JSON.stringify({ levelIds })
    }),

  // Fields
  getFields: (levelId: string) =>
    request<FieldDefinition[]>(`/levels/${levelId}/fields`),
  createField: (levelId: string, data: Partial<FieldDefinition>) =>
    request<FieldDefinition>(`/levels/${levelId}/fields`, {
      method: "POST",
      body: JSON.stringify(data)
    }),
  updateField: (id: string, data: Partial<FieldDefinition>) =>
    request<FieldDefinition>(`/fields/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    }),
  deleteField: (id: string) =>
    request<{ message: string }>(`/fields/${id}`, {
      method: "DELETE"
    }),

  // Members / Records
  getRoots: (hierarchyId: string) =>
    request<Member[]>(`/hierarchies/${hierarchyId}/roots`),
  getMember: (id: string) => request<Member>(`/members/${id}`),
  getParent: (id: string) => request<Member | null>(`/members/${id}/parent`),
  getChildren: (id: string) => request<Member[]>(`/members/${id}/children`),
  getAncestors: (id: string) => request<Member[]>(`/members/${id}/ancestors`),
  getDescendants: (id: string, limit?: number) =>
    request<Member[]>(`/members/${id}/descendants${limit ? `?limit=${limit}` : ""}`),
  getMembersByLevel: (levelId: string, params: Record<string, any> = {}) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        query.append(k, String(v));
      }
    }
    return request<{ items: Member[]; total: number }>(
      `/levels/${levelId}/records?${query.toString()}`
    );
  },
  searchMembers: (q: string, hierarchyId?: string, levelId?: string) => {
    const query = new URLSearchParams({ q });
    if (hierarchyId) query.append("hierarchy_id", hierarchyId);
    if (levelId) query.append("level_id", levelId);
    return request<Array<Member & { ancestors: Array<{ id: string; name: string; level_name: string }> }>>(
      `/search?${query.toString()}`
    );
  },
  createMember: (data: {
    hierarchy_id: string;
    level_id: string;
    parent_id?: string | null;
    name: string;
    custom_data?: Record<string, any>;
  }) =>
    request<Member>("/members", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  updateMember: (id: string, data: { name?: string; custom_data?: Record<string, any> }) =>
    request<Member>(`/members/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    }),
  moveMember: (id: string, newParentId: string | null) =>
    request<Member>(`/members/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ new_parent_id: newParentId })
    }),
  deleteMember: (id: string) =>
    request<{ message: string; deletedCount: number }>(`/members/${id}`, {
      method: "DELETE"
    }),

  // Audit Logs
  getAuditLogs: (params: Record<string, any> = {}) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") {
        query.append(k, String(v));
      }
    }
    return request<{ items: AuditLog[]; total: number }>(`/audit-logs?${query.toString()}`);
  },

  // Import / Export
  previewImport: (hierarchyId: string, levelId: string, rows: any[]) =>
    request<any>(`/levels/${levelId}/import/preview`, {
      method: "POST",
      body: JSON.stringify({ hierarchy_id: hierarchyId, rows })
    }),
  commitImport: (hierarchyId: string, levelId: string, rows: any[], defaultParentId: string | null) =>
    request<any>(`/levels/${levelId}/import/commit`, {
      method: "POST",
      body: JSON.stringify({ hierarchy_id: hierarchyId, rows, default_parent_id: defaultParentId })
    }),
  getExportUrl: (levelId: string, format: "csv" | "json", hierarchyId?: string) => {
    const token = localStorage.getItem("auth_token");
    const query = new URLSearchParams({ format });
    if (hierarchyId) query.append("hierarchy_id", hierarchyId);
    if (token) query.append("token", token);
    return `${BASE_URL}/levels/${levelId}/export?${query.toString()}`;
  },

  // Live SQL & Real-Time Streamer
  getSqlStats: () => request<any>("/sql/stats"),
  getSqlTables: () => request<any[]>("/sql/tables"),
  runSqlQuery: (sql: string) =>
    request<{ columns: string[]; rows: any[]; total_returned: number; duration_ms: number; sql: string }>("/sql/query", {
      method: "POST",
      body: JSON.stringify({ sql })
    }),
  startRealtimeStream: (intervalMs?: number, hierarchyId?: string) =>
    request<any>("/realtime/start", {
      method: "POST",
      body: JSON.stringify({ interval_ms: intervalMs, hierarchy_id: hierarchyId })
    }),
  stopRealtimeStream: () => request<any>("/realtime/stop", { method: "POST" }),
  getRealtimeStatus: () => request<any>("/realtime/status"),
  generateRealtimeBatch: (count = 5, hierarchyId?: string) =>
    request<any>("/realtime/generate", {
      method: "POST",
      body: JSON.stringify({ count, hierarchy_id: hierarchyId })
    }),

  // AI Level & Table Summarization
  summarizeLevel: (levelId: string, hierarchyId?: string) =>
    request<{
      summary: string;
      levelName: string;
      totalCount: number;
      fieldCount: number;
      parentCount: number;
    }>("/ai/summarize-level", {
      method: "POST",
      body: JSON.stringify({ levelId, hierarchyId })
    })
};
