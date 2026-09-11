import React from "react";
import { User, Shield, Key, Mail, CheckCircle, Clock } from "lucide-react";
import { AuthUser } from "../../types/index.js";

interface AdminProfileViewProps {
  user: AuthUser;
  onLogout: () => void;
}

export const AdminProfileView: React.FC<AdminProfileViewProps> = ({ user, onLogout }) => {
  return (
    <div className="max-w-2xl space-y-6 text-white font-sans">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2">
            <User className="w-5 h-5 text-zinc-400" />
            <span>Profile & Security Credentials</span>
          </h2>
          <p className="text-xs text-zinc-400 font-mono">
            Authenticated Profile Identity & Scope Authority
          </p>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono uppercase tracking-wider text-zinc-300"
        >
          Sign Out
        </button>
      </div>

      <div className="border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-mono uppercase text-zinc-500">Legal Name</label>
            <p className="text-sm font-semibold text-zinc-100">{user.full_name}</p>
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-zinc-500">Username</label>
            <p className="text-sm font-mono text-zinc-200">@{user.username}</p>
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-zinc-500">Corporate Email</label>
            <p className="text-sm font-mono text-zinc-200">{user.email}</p>
          </div>
          <div>
            <label className="text-xs font-mono uppercase text-zinc-500">System Role</label>
            <p className="text-sm font-bold text-zinc-100 uppercase">{user.role.name}</p>
          </div>
        </div>

        <div className="border-t border-zinc-900 pt-4">
          <label className="text-xs font-mono uppercase text-zinc-500 block mb-2">
            Assigned Permissions ({user.role.permissions.length})
          </label>
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {user.role.permissions.map((p) => (
              <span key={p} className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
