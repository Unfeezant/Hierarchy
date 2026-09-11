import React, { useState, useEffect } from "react";
import { Link, Lock, ArrowRight, RefreshCw, AlertTriangle, ShieldCheck } from "lucide-react";
import { api } from "../../services/api.js";
import { AuthUser } from "../../types/index.js";

interface GuestAccessViewProps {
  token: string;
  onSuccess: (user: AuthUser, token: string) => void;
  onCancel: () => void;
}

export const GuestAccessView: React.FC<GuestAccessViewProps> = ({ token, onSuccess, onCancel }) => {
  const [linkInfo, setLinkInfo] = useState<any | null>(null);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    api.verifyGuestLink(token)
      .then((data) => {
        setLinkInfo(data);
        // If no password is required, auto-redeem!
        if (!data.hasPassword) {
          handleRedeem("");
        }
      })
      .catch((err) => setError(err.message || "This guest link is invalid or expired."))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleRedeem = async (pwd?: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.accessGuestLink(token, pwd || (password ? password : undefined));
      localStorage.setItem("auth_token", res.token);
      onSuccess(res.user, res.token);
    } catch (err: any) {
      setError(err.message || "Failed to access guest link.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRedeem(password);
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
          <div className="p-2 bg-zinc-900 border border-zinc-700 text-zinc-100">
            <Link className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-white">
              Guest Access Verification
            </h1>
            <p className="text-xs text-zinc-400 font-mono">
              Hierarchy Pyramid System
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 border border-red-800/80 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {linkInfo ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3.5 bg-zinc-900 border border-zinc-800 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-zinc-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold">{linkInfo.name}</span>
              </div>
              <p className="text-zinc-400">
                Authorized Hierarchy: <span className="text-white font-semibold">{linkInfo.hierarchy_name}</span>
              </p>
              {linkInfo.member_name && (
                <p className="text-zinc-400">
                  Branch Scope: <span className="text-white font-semibold">{linkInfo.member_name}</span>
                </p>
              )}
              <p className="text-zinc-400">
                Access Level: <span className="text-white font-mono uppercase bg-zinc-800 px-1.5 py-0.5 border border-zinc-700">{linkInfo.access_level}</span>
              </p>
            </div>

            {linkInfo.hasPassword && (
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Passphrase Required
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter access passphrase"
                    className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-zinc-400 hover:text-white underline font-mono"
              >
                Sign in with account
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2.5 px-5 flex items-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Enter as Guest</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center pt-2">
            <button
              onClick={onCancel}
              className="text-xs text-zinc-400 hover:text-white underline font-mono"
            >
              Return to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
