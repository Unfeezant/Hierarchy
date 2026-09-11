import React, { useState } from "react";
import { ShieldAlert, KeyRound, X, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { api } from "../../services/api.js";

interface SensitiveActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  actionTitle?: string;
}

export const SensitiveActionModal: React.FC<SensitiveActionModalProps> = ({
  isOpen,
  onClose,
  onVerified,
  actionTitle = "Sensitive Administrative Action"
}) => {
  const [code, setCode] = useState("");
  const [requested, setRequested] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestOtp = async () => {
    setError(null);
    try {
      setIsLoading(true);
      await api.requestStepUpOtp();
      setRequested(true);
    } catch (err: any) {
      setError(err.message || "Failed to dispatch verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code || code.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    try {
      setIsLoading(true);
      await api.verifyStepUpOtp(code.trim());
      onVerified();
      onClose();
    } catch (err: any) {
      setError(err.message || "Invalid or expired authorization code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 p-6 shadow-2xl relative rounded-none text-white">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-zinc-800">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wider uppercase text-zinc-100">
              Security Step-Up Verification
            </h3>
            <p className="text-xs text-zinc-400 font-mono">
              Action: {actionTitle}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 border border-red-800/80 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {!requested ? (
          <div className="space-y-4">
            <p className="text-xs text-zinc-300 leading-relaxed">
              This high-privilege administrative operation requires fresh OTP confirmation. A 6-digit verification code will be dispatched to your administrator email address.
            </p>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-mono uppercase text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-none"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleRequestOtp}
                className="px-4 py-2 text-xs font-mono uppercase bg-zinc-100 hover:bg-white text-black font-bold flex items-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                <span>Send Verification Code</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-xs text-zinc-400">
              Verification code sent to your registered email. Enter code to authorize:
            </p>
            <div>
              <input
                type="text"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full bg-zinc-900 border border-zinc-700 py-2.5 text-2xl font-mono tracking-widest text-center text-white focus:border-zinc-400 focus:outline-none rounded-none"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={isLoading}
                className="hover:text-zinc-300 font-mono underline"
              >
                Resend code
              </button>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-mono uppercase text-zinc-400 hover:text-white border border-zinc-800 rounded-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="px-4 py-2 text-xs font-mono uppercase bg-zinc-100 hover:bg-white text-black font-bold flex items-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                <span>Authorize Action</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
