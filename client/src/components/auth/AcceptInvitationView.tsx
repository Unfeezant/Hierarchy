import React, { useState, useEffect } from "react";
import { UserCheck, Lock, User, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import { api } from "../../services/api.js";
import { AuthUser } from "../../types/index.js";

interface AcceptInvitationViewProps {
  token: string;
  onAccepted: (user: AuthUser, token: string) => void;
  onCancel: () => void;
}

export const AcceptInvitationView: React.FC<AcceptInvitationViewProps> = ({ token, onAccepted, onCancel }) => {
  const [invData, setInvData] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getInvitation(token)
      .then((data) => setInvData(data))
      .catch((err) => setError(err.message || "Invitation link invalid or expired."))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName || !username || !password) {
      setError("All registration fields are required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.acceptInvitation({
        token,
        username: username.trim(),
        full_name: fullName.trim(),
        password
      });
      localStorage.setItem("auth_token", res.token);
      localStorage.setItem("active_user_id", res.user.id);
      onAccepted(res.user, res.token);
    } catch (err: any) {
      setError(err.message || "Failed to accept invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-md border border-zinc-800 bg-zinc-950 p-8 shadow-2xl relative rounded-none">
        <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-4">
          <div className="p-2 bg-zinc-900 border border-zinc-700 text-zinc-200">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wider uppercase text-zinc-100">
              Join Hierarchy Pyramid
            </h1>
            <p className="text-xs text-zinc-400 font-mono">
              Invitation Activation
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 border border-red-800/80 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {invData && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-zinc-900 border border-zinc-800 text-xs space-y-1">
              <p className="text-zinc-300">
                Invited by: <span className="text-white font-bold">{invData.invited_by_name}</span>
              </p>
              <p className="text-zinc-300">
                Assigned Role: <span className="text-white font-mono uppercase bg-zinc-800 px-1.5 py-0.5 border border-zinc-700">{invData.role_name}</span>
              </p>
              <p className="text-zinc-300">
                Email: <span className="text-white font-mono">{invData.email}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars"
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Confirm
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat"
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-zinc-400 hover:text-white underline font-mono"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2.5 px-5 flex items-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
                  <>
                    <span>Create Profile & Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
