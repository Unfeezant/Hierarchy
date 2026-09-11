import React, { useState, useEffect } from "react";
import { Users, UserPlus, Link, Shield, Lock, Unlock, UserX, CheckCircle, RefreshCw, AlertTriangle, Copy, Trash2, KeyRound, FileText, Check, Mail, Send } from "lucide-react";
import { api } from "../../services/api.js";
import { ManagedUser, GuestLink, Hierarchy } from "../../types/index.js";
import { SensitiveActionModal } from "../auth/SensitiveActionModal.js";
import { useApp } from "../../context/AppContext.js";

interface AdminManagementViewProps {
  hierarchies: Hierarchy[];
}

const DEFAULT_ROLES = [
  { id: "role_admin", name: "Administrator", description: "Administrative access to configure hierarchies, levels, fields, and records" },
  { id: "role_manager", name: "Manager", description: "Can manage and edit members and export data within assigned branch" },
  { id: "role_editor", name: "Editor", description: "Can view and edit members within assigned branch" },
  { id: "role_viewer", name: "Viewer", description: "Read-only access within assigned branch" }
];

export const AdminManagementView: React.FC<AdminManagementViewProps> = ({ hierarchies }) => {
  const { currentUser } = useApp();
  const isSuperAdmin = currentUser?.role?.id === "role_super_admin" || currentUser?.role?.permissions?.includes("role:manage") || currentUser?.role?.name?.toLowerCase().includes("super");

  const [activeTab, setActiveTab] = useState<"users" | "invite" | "guest_links" | "access_logs" | "smtp">("users");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [guestLinks, setGuestLinks] = useState<GuestLink[]>([]);
  const [roles, setRoles] = useState<any[]>(DEFAULT_ROLES);
  const [accessLogs, setAccessLogs] = useState<string[]>([]);
  const [accessLogFilePath, setAccessLogFilePath] = useState<string>("server/access_history.log");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // SMTP Settings & Diagnostic State
  const [smtpStatus, setSmtpStatus] = useState<{
    configured: boolean;
    host: string | null;
    user: string | null;
    from: string | null;
    verified: boolean;
    error: string | null;
  } | null>(null);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // Invitation Form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("role_admin");
  const [inviteHierarchyId, setInviteHierarchyId] = useState(hierarchies[0]?.id || "");
  const [invitationResult, setInvitationResult] = useState<any | null>(null);

  // Guest Link Form
  const [guestLinkName, setGuestLinkName] = useState("");
  const [guestHierarchyId, setGuestHierarchyId] = useState(hierarchies[0]?.id || "");
  const [guestAccessLevel, setGuestAccessLevel] = useState<"viewer" | "editor">("viewer");
  const [guestPassword, setGuestPassword] = useState("");
  const [guestExpiresDays, setGuestExpiresDays] = useState("30");
  const [newGuestLinkResult, setNewGuestLinkResult] = useState<any | null>(null);

  // Sensitive Step-Up state
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [pendingActionTitle, setPendingActionTitle] = useState("");

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const calls: Promise<any>[] = [
        api.getManagedUsers().catch(() => []),
        api.getRoles().catch(() => []),
        api.getAdminGuestLinks().catch(() => [])
      ];

      if (isSuperAdmin) {
        calls.push(api.getAccessLogs().catch(() => ({ logFilePath: "server/access_history.log", logs: [] })));
        calls.push(api.getSmtpStatus().catch(() => null));
      } else {
        calls.push(Promise.resolve({ logFilePath: "server/access_history.log", logs: [] }));
        calls.push(Promise.resolve(null));
      }

      const [u, r, gl, logRes, smtpRes] = await Promise.all(calls);
      setUsers(u);
      setRoles(r && r.length > 0 ? r : DEFAULT_ROLES);
      setGuestLinks(gl);
      if (logRes && logRes.logs) {
        setAccessLogs(logRes.logs);
        setAccessLogFilePath(logRes.logFilePath);
      }
      if (smtpRes) {
        setSmtpStatus(smtpRes);
        if (smtpRes.host) setSmtpHost(smtpRes.host);
        if (smtpRes.user) {
          setSmtpUser(smtpRes.user);
          setTestEmailTo(smtpRes.user);
        }
        if (smtpRes.from) setSmtpFrom(smtpRes.from);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load management data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin && (activeTab === "invite" || activeTab === "access_logs" || activeTab === "smtp")) {
      setActiveTab("users");
    }
  }, [isSuperAdmin, activeTab]);

  const runWithStepUpProtection = async (actionTitle: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (err: any) {
      if (err.message && (err.message.includes("recent OTP verification") || err.message.includes("requiresStepUp"))) {
        setPendingActionTitle(actionTitle);
        setPendingAction(() => action);
        setStepUpOpen(true);
      } else {
        setError(err.message || "Action failed.");
      }
    }
  };

  const handleStatusChange = (userId: string, status: "active" | "disabled" | "locked") => {
    runWithStepUpProtection(`Update User Status to ${status}`, async () => {
      await api.updateUserStatus(userId, status);
      setSuccess(`User status updated to ${status}.`);
      fetchData();
    });
  };

  const handleDeleteUser = (userId: string) => {
    if (!confirm("Are you sure you want to permanently delete this user?")) return;
    runWithStepUpProtection("Delete User Account", async () => {
      await api.deleteUser(userId);
      setSuccess("User deleted successfully.");
      fetchData();
    });
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    runWithStepUpProtection("Dispatch Administrator Invitation", async () => {
      const res = await api.inviteUser({
        email: inviteEmail.trim(),
        role_id: inviteRoleId,
        scopes: inviteHierarchyId ? [{ id: "scope_new", user_id: "", hierarchy_id: inviteHierarchyId, member_id: null, access_level: "manager" }] : []
      });
      setInvitationResult(res);
      setSuccess("Invitation issued successfully!");
      setInviteEmail("");
      fetchData();
    });
  };

  const handleCreateGuestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!guestPassword.trim()) {
      setError("Passphrase protection is required to generate a guest link.");
      return;
    }

    try {
      const res = await api.createGuestLink({
        name: guestLinkName.trim(),
        hierarchy_id: guestHierarchyId,
        access_level: guestAccessLevel,
        password: guestPassword.trim(),
        expires_in_days: parseInt(guestExpiresDays, 10)
      });
      setNewGuestLinkResult(res);
      setSuccess("Guest Link generated successfully!");
      setGuestLinkName("");
      setGuestPassword("");
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to create guest link.");
    }
  };

  const handleRevokeGuestLink = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this guest access link?")) return;
    try {
      await api.revokeGuestLink(id);
      setSuccess("Guest link revoked.");
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to revoke guest link.");
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSmtpTesting(true);

    try {
      const res = await api.updateSmtpConfig({
        host: smtpHost.trim(),
        port: parseInt(smtpPort, 10),
        user: smtpUser.trim(),
        pass: smtpPass.trim(),
        from: smtpFrom.trim(),
        secure: smtpPort === "465"
      });

      if (res.verified) {
        setSuccess("SMTP configuration saved and connection verified successfully!");
      } else {
        setError(`Saved, but SMTP authentication test failed: ${res.error}`);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update SMTP settings.");
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailTo) return;
    setError(null);
    setSuccess(null);
    setTestEmailSending(true);
    setTestEmailResult(null);

    try {
      const res = await api.testSmtpEmail(testEmailTo.trim());
      if (res.success) {
        setTestEmailResult({
          success: true,
          message: `Live test email successfully dispatched to ${res.recipient} via Brevo SMTP!`
        });
        setSuccess(`Test email sent to ${res.recipient}`);
      } else {
        setTestEmailResult({
          success: false,
          message: "Delivery failed. Please inspect SMTP credentials."
        });
        setError("Failed to deliver test email via SMTP.");
      }
    } catch (err: any) {
      setTestEmailResult({
        success: false,
        message: err.message || "Failed to send test email."
      });
      setError(err.message || "Failed to send test email.");
    } finally {
      setTestEmailSending(false);
    }
  };

  return (
    <div className="space-y-6 text-white font-sans">
      <SensitiveActionModal
        isOpen={stepUpOpen}
        actionTitle={pendingActionTitle}
        onClose={() => { setStepUpOpen(false); setPendingAction(null); }}
        onVerified={async () => {
          if (pendingAction) {
            await pendingAction();
            setPendingAction(null);
          }
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-zinc-400" />
            <span>Administration & Security Workspace</span>
          </h2>
          <p className="text-xs text-zinc-400 font-mono">
            User Accounts, Privileged Access, Branch Scopes, and Guest Credentials
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 border border-red-800/80 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0 text-zinc-300" />
          <span>{success}</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 bg-zinc-950 overflow-x-auto">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "users" ? "border-white text-white font-bold bg-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Accounts ({users.length})</span>
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab("invite")}
            className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "invite" ? "border-white text-white font-bold bg-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Admin</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab("guest_links")}
          className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === "guest_links" ? "border-white text-white font-bold bg-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Link className="w-4 h-4" />
          <span>Guest Links ({guestLinks.length})</span>
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab("access_logs")}
            className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "access_logs" ? "border-white text-white font-bold bg-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Access Log File ({accessLogs.length})</span>
          </button>
        )}
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab("smtp")}
            className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "smtp" ? "border-white text-white font-bold bg-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Mail & SMTP {smtpStatus?.verified ? "✓" : ""}</span>
          </button>
        )}
      </div>

      {/* Tab 1: Users */}
      {activeTab === "users" && (
        <div className="border border-zinc-800 bg-zinc-950 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 font-mono text-zinc-400 uppercase tracking-wider">
                <th className="p-3">User</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Verified</th>
                <th className="p-3">Last Login</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 font-mono">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="p-3 font-sans">
                    <div className="font-semibold text-zinc-100">{u.full_name}</div>
                    <div className="text-xs text-zinc-500 font-mono">{u.email} • @{u.username}</div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 text-xs border border-zinc-700 bg-zinc-900 text-zinc-200">
                      {u.role_name}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-xs border uppercase ${
                      u.status === "active" ? "border-emerald-800 bg-emerald-950/30 text-emerald-400" :
                      u.status === "locked" ? "border-amber-800 bg-amber-950/30 text-amber-400" :
                      "border-red-800 bg-red-950/30 text-red-400"
                    }`}>
                      {u.status || (u.is_active ? "active" : "disabled")}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-400">
                    {u.email_verified ? "Yes (OTP)" : "No"}
                  </td>
                  <td className="p-3 text-zinc-400">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                  </td>
                  <td className="p-3 text-right space-x-2">
                    {u.status === "active" ? (
                      <button
                        onClick={() => handleStatusChange(u.id, "disabled")}
                        className="px-2 py-1 text-xs border border-zinc-800 hover:border-zinc-600 bg-zinc-900 text-zinc-300"
                        title="Deactivate account"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(u.id, "active")}
                        className="px-2 py-1 text-xs border border-zinc-800 hover:border-zinc-600 bg-zinc-900 text-zinc-100"
                        title="Activate account"
                      >
                        Activate
                      </button>
                    )}
                    {u.role_id !== "role_super_admin" && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="px-2 py-1 text-xs border border-red-900/50 hover:border-red-700 bg-red-950/20 text-red-400"
                        title="Delete user"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Invite Administrator */}
      {isSuperAdmin && activeTab === "invite" && (
        <div className="border border-zinc-800 bg-zinc-950 p-6 max-w-xl">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2 text-zinc-100">
            <UserPlus className="w-4 h-4 text-zinc-400" />
            <span>Send Administrator Invitation</span>
          </h3>

          <form onSubmit={handleSendInvitation} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Recipient Corporate Email
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@enterprise.io"
                className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Assigned Role
              </label>
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-400 focus:outline-none rounded-none"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} - {r.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Hierarchy Branch Scope (Optional)
              </label>
              <select
                value={inviteHierarchyId}
                onChange={(e) => setInviteHierarchyId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-400 focus:outline-none rounded-none"
              >
                <option value="">Global / All Hierarchies</option>
                {hierarchies.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-zinc-100 hover:bg-white text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 rounded-none transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Issue Invitation (Step-Up Protected)</span>
              </button>
            </div>
          </form>

          {invitationResult && (
            <div className="mt-6 p-4 border border-zinc-800 bg-zinc-900 text-xs space-y-2">
              <p className="font-bold text-white uppercase flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Invitation Notice Dispatched</span>
              </p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                A simple invitation notice has been emailed to the recipient. When they open the site (<span className="text-zinc-200 font-mono">{window.location.origin}</span>) and enter their email under <strong>EMAIL OTP</strong>, they will receive their personal sign-in passcode to activate their administrator profile.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Guest Access Links */}
      {activeTab === "guest_links" && (
        <div className="space-y-6">
          <div className="border border-zinc-800 bg-zinc-950 p-6 max-w-xl">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4 border-b border-zinc-800 pb-2 flex items-center gap-2 text-zinc-100">
              <Link className="w-4 h-4 text-zinc-400" />
              <span>Create Granular Guest Access Link</span>
            </h3>

            <form onSubmit={handleCreateGuestLink} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Link Name / Purpose
                </label>
                <input
                  type="text"
                  required
                  value={guestLinkName}
                  onChange={(e) => setGuestLinkName(e.target.value)}
                  placeholder="e.g. Q3 External Auditor Access"
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Target Hierarchy
                </label>
                <select
                  value={guestHierarchyId}
                  onChange={(e) => setGuestHierarchyId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-400 focus:outline-none rounded-none"
                >
                  {hierarchies.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                    Permission Level
                  </label>
                  <select
                    value={guestAccessLevel}
                    onChange={(e: any) => setGuestAccessLevel(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-400 focus:outline-none rounded-none"
                  >
                    <option value="viewer">Viewer (Read Only)</option>
                    <option value="editor">Editor (Can Add/Edit)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                    Expiration
                  </label>
                  <select
                    value={guestExpiresDays}
                    onChange={(e) => setGuestExpiresDays(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-400 focus:outline-none rounded-none"
                  >
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Passphrase Protection (Required) <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="Enter required access passphrase"
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-zinc-100 hover:bg-white text-black font-bold text-xs uppercase tracking-wider flex items-center gap-2 rounded-none transition-colors cursor-pointer"
                >
                  <Link className="w-4 h-4" />
                  <span>Generate Guest Link</span>
                </button>
              </div>
            </form>

            {newGuestLinkResult && (
              <div className="mt-6 p-4 border border-zinc-800 bg-zinc-900 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-white uppercase">Direct Guest Access Link:</p>
                  <button
                    type="button"
                    onClick={() => {
                      const fullUrl = `${window.location.origin}?guest=${newGuestLinkResult.rawToken}`;
                      navigator.clipboard.writeText(fullUrl);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    className="px-2.5 py-1 text-[11px] font-mono border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white flex items-center gap-1 cursor-pointer"
                  >
                    {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedUrl ? "Copied!" : "Copy Full URL"}</span>
                  </button>
                </div>
                <p className="font-mono text-zinc-300 break-all p-2.5 bg-black border border-zinc-800 select-all">
                  {window.location.origin}?guest={newGuestLinkResult.rawToken}
                </p>
                <p className="text-zinc-500 text-xs">
                  Share this URL. When opened in any browser, the guest user will be instantly authenticated and scoped to this hierarchy branch!
                </p>
              </div>
            )}
          </div>

          {/* Existing guest links */}
          <div className="border border-zinc-800 bg-zinc-950 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 uppercase tracking-wider">
                  <th className="p-3">Name</th>
                  <th className="p-3">Hierarchy</th>
                  <th className="p-3">Level</th>
                  <th className="p-3">Access Count</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {guestLinks.map((gl) => (
                  <tr key={gl.id} className="hover:bg-zinc-900/40">
                    <td className="p-3 font-semibold text-zinc-200">{gl.name}</td>
                    <td className="p-3 text-zinc-400">{gl.hierarchy_name}</td>
                    <td className="p-3 uppercase text-zinc-300">{gl.access_level}</td>
                    <td className="p-3 text-zinc-400">{gl.access_count} times</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-xs border uppercase ${
                        gl.is_revoked ? "border-red-900 bg-red-950/40 text-red-400" : "border-emerald-800 bg-emerald-950/30 text-emerald-400"
                      }`}>
                        {gl.is_revoked ? "Revoked" : "Active"}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      {!gl.is_revoked && (
                        <button
                          onClick={() => handleRevokeGuestLink(gl.id)}
                          className="px-2 py-1 border border-red-900/50 hover:border-red-700 bg-red-950/20 text-red-400 cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Access Log File */}
      {isSuperAdmin && activeTab === "access_logs" && (
        <div className="space-y-4">
          <div className="border border-zinc-800 bg-zinc-950 p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-400" />
                <span>Dedicated Access History File: <span className="font-mono text-white bg-zinc-900 px-2 py-0.5 border border-zinc-800">{accessLogFilePath}</span></span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                Records timestamps, IPs, identity, roles, event types, scopes, and outcomes.
              </p>
            </div>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono uppercase text-zinc-200 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh Log</span>
            </button>
          </div>

          <div className="border border-zinc-800 bg-black p-4 font-mono text-xs overflow-x-auto max-h-[500px] overflow-y-auto space-y-1.5">
            {accessLogs.length === 0 ? (
              <p className="text-zinc-600 italic">No access entries recorded yet.</p>
            ) : (
              accessLogs.map((line, idx) => {
                const isFailed = line.includes("FAILED") || line.includes("AUTH_FAILURE");
                const isGuest = line.includes("GUEST_ACCESS");
                return (
                  <div
                    key={idx}
                    className={`p-2 border border-zinc-900 leading-relaxed font-mono ${
                      isFailed ? "bg-red-950/20 text-red-300 border-red-900/30" :
                      isGuest ? "bg-zinc-900/50 text-cyan-300" :
                      "bg-zinc-950 text-zinc-300"
                    }`}
                  >
                    {line}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Mail & SMTP Settings */}
      {isSuperAdmin && activeTab === "smtp" && (
        <div className="space-y-6">
          {/* SMTP Status Overview */}
          <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2 font-mono">
                  <Mail className="w-4 h-4 text-zinc-400" />
                  <span>Outgoing Email Service (SMTP) Status</span>
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Transactional engine for OTP codes, password resets, and administrator invitations.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {smtpStatus?.verified ? (
                  <span className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>SMTP LIVE & CONNECTED</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-xs font-mono font-bold bg-amber-950/60 border border-amber-500/40 text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>AUTH FAILED / NOT CONNECTED</span>
                  </span>
                )}
              </div>
            </div>

            {/* Error or Success details */}
            {smtpStatus?.error && (
              <div className="p-3 border border-amber-800/80 bg-amber-950/30 text-amber-300 text-xs space-y-2">
                <div className="flex items-start gap-2 font-mono">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-bold">SMTP Verification Returned: </span>
                    <span className="text-white">{smtpStatus.error}</span>
                  </div>
                </div>

                <div className="border-t border-amber-900/60 pt-2 text-[11px] text-zinc-300 space-y-1 font-mono">
                  <p className="font-bold text-amber-400 uppercase">How to resolve Brevo "535 Authentication failed":</p>
                  <ul className="list-disc list-inside space-y-0.5 text-zinc-400">
                    <li>
                      <strong className="text-white">Verify Brevo Login username:</strong> In Brevo (<a href="https://app.brevo.com/settings/keys/smtp" target="_blank" rel="noreferrer" className="underline text-blue-400">Settings → SMTP & API → SMTP</a>), copy the exact value from the <strong>Login</strong> field (it might be a specific email or identifier).
                    </li>
                    <li>
                      <strong className="text-white">Account Activation:</strong> Brevo accounts require transactional platform activation before relay logins are accepted. Check your Brevo dashboard banner to ensure your account is activated.
                    </li>
                    <li>
                      <strong className="text-white">Sender Email:</strong> Make sure the "From Address" matches an email authorized in your Brevo <em>Senders & IPs</em> tab.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {smtpStatus?.verified && (
              <div className="p-3 border border-emerald-800/80 bg-emerald-950/20 text-emerald-300 text-xs flex items-center gap-2 font-mono">
                <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                <span>Connected to Brevo SMTP Relay. Real outgoing emails will be delivered directly to user inboxes.</span>
              </div>
            )}
          </div>

          {/* Test Email Dispatcher */}
          <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2 font-mono">
              <Send className="w-4 h-4 text-zinc-400" />
              <span>Send Live Test Email</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Trigger a live outgoing test message to verify that emails arrive in your real inbox.
            </p>

            <div className="flex gap-2 max-w-xl">
              <input
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-zinc-400"
              />
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={testEmailSending || !testEmailTo}
                className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {testEmailSending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Dispatching...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test</span>
                  </>
                )}
              </button>
            </div>

            {testEmailResult && (
              <div
                className={`p-3 border text-xs font-mono ${
                  testEmailResult.success
                    ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                    : "border-red-800 bg-red-950/40 text-red-300"
                }`}
              >
                {testEmailResult.message}
              </div>
            )}
          </div>

          {/* SMTP Configuration Form */}
          <div className="border border-zinc-800 bg-zinc-950 p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2 font-mono">
              <KeyRound className="w-4 h-4 text-zinc-400" />
              <span>Update SMTP Credentials</span>
            </h3>
            <p className="text-xs text-zinc-400">
              Update connection parameters for Brevo or any standard SMTP service. Settings are saved to <code className="text-zinc-200 bg-zinc-900 px-1 border border-zinc-800 font-mono">server/.env</code> and applied dynamically.
            </p>

            <form onSubmit={handleSaveSmtp} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  required
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp-relay.brevo.com"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  Port
                </label>
                <input
                  type="text"
                  required
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  SMTP Login / Username
                </label>
                <input
                  type="text"
                  required
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="Brevo login email or identifier"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-zinc-400"
                />
                <span className="text-[10px] text-zinc-500 font-mono">Found in Brevo → SMTP & API → SMTP → Login</span>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  SMTP Password / Key
                </label>
                <input
                  type="password"
                  required
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder="xsmtpsib-..."
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-zinc-400"
                />
                <span className="text-[10px] text-zinc-500 font-mono">Generated SMTP key or master password</span>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1">
                  From Address Header
                </label>
                <input
                  type="text"
                  required
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  placeholder='"Hierarchy Enterprise" <samarveer.unfeasent@gmail.com>'
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-mono focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div className="md:col-span-2 pt-2 flex items-center justify-between">
                <button
                  type="submit"
                  disabled={smtpTesting}
                  className="px-5 py-2.5 bg-white text-black font-mono font-bold text-xs uppercase hover:bg-zinc-200 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {smtpTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving & Verifying...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save & Verify Connection</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-zinc-500 font-mono">
                  Also logged to: <span className="text-zinc-300">server/email_dispatches.log</span>
                </p>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
