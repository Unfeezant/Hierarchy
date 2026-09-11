import React, { useState } from "react";
import { Shield, KeyRound, ArrowRight, CheckCircle, AlertTriangle, RefreshCw, Mail, User, Lock } from "lucide-react";
import { api } from "../../services/api.js";
import { AuthUser } from "../../types/index.js";

interface BootstrapSetupProps {
  onBootstrapped: (user: AuthUser, token: string) => void;
}

export const BootstrapSetup: React.FC<BootstrapSetupProps> = ({ onBootstrapped }) => {
  const [step, setStep] = useState<"details" | "verify">("details");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [isLiveSmtp, setIsLiveSmtp] = useState<boolean>(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !username || !fullName || !password) {
      setError("All fields are required to initialize the system.");
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
      setIsLoading(true);
      const res = await api.requestBootstrapOtp(email);
      setStep("verify");
      setCooldown(res.resendCooldownSeconds || 60);
      setIsLiveSmtp(Boolean(res.isLiveSmtp));
      if (res.devOtpCode) {
        setDevOtpCode(res.devOtpCode);
      }

      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Failed to dispatch verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otpCode || otpCode.length !== 6) {
      setError("Please enter the 6-digit verification code sent to your email.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.confirmBootstrap({
        email,
        username,
        full_name: fullName,
        password,
        otpCode: otpCode.trim()
      });
      localStorage.setItem("auth_token", res.token);
      localStorage.setItem("active_user_id", res.user.id);
      onBootstrapped(res.user, res.token);
    } catch (err: any) {
      setError(err.message || "Bootstrap verification failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      setIsLoading(true);
      const res = await api.requestBootstrapOtp(email);
      setCooldown(res.resendCooldownSeconds || 60);
    } catch (err: any) {
      setError(err.message || "Failed to resend verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-lg border border-zinc-800 bg-zinc-950 p-8 shadow-2xl relative rounded-none">
        {/* Top Sharp Badge */}
        <div className="flex items-center gap-2 mb-6 border-b border-zinc-800 pb-4">
          <div className="p-2 bg-zinc-900 border border-zinc-700 text-zinc-200">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wider uppercase text-zinc-100">
              Initial System Bootstrap
            </h1>
            <p className="text-xs text-zinc-400 font-mono">
              Role: Initial Super Administrator (apex authority)
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 border border-red-800/80 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {step === "details" ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              No Super Administrator has been registered yet. Establish the primary administrator profile. Once confirmed, this setup portal is permanently locked on the backend.
            </p>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Full Legal / Corporate Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Eleanor Vance"
                  className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Corporate Email (For OTP & Security)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@enterprise.io"
                  className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Admin Username
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="superadmin"
                  className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Master Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none rounded-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none rounded-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-900">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-zinc-100 hover:bg-white text-black font-semibold text-xs tracking-wider uppercase py-2.5 px-4 flex items-center justify-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Dispatching Security OTP...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed to OTP Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmBootstrap} className="space-y-4">
            <div className="p-3 bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 space-y-1">
              {isLiveSmtp ? (
                <p>
                  A 6-digit cryptographic verification code has been dispatched to your email inbox (
                  <span className="font-mono text-white font-bold">{email}</span>
                  ) via live SMTP. Please check your inbox or spam folder.
                </p>
              ) : (
                <p>
                  A 6-digit cryptographic verification code has been generated for{" "}
                  <span className="font-mono text-white font-bold">{email}</span>.
                </p>
              )}
            </div>

            {devOtpCode && (
              <div className="p-3 border border-zinc-700 bg-zinc-900 text-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono text-zinc-400 uppercase block tracking-wider">
                    Dev Mode (SMTP not configured in .env)
                  </span>
                  <span className="text-zinc-200">
                    Dispatched Code: <strong className="font-mono text-white text-sm tracking-widest">{devOtpCode}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOtpCode(devOtpCode)}
                  className="px-2.5 py-1 text-xs font-mono font-bold bg-zinc-100 hover:bg-white text-black transition-colors rounded-none"
                >
                  Autofill
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                6-Digit Security Verification Code
              </label>
              <div className="relative">
                <KeyRound className="w-5 h-5 absolute left-3 top-3 text-zinc-400" />
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full bg-zinc-900 border border-zinc-700 pl-11 pr-4 py-2.5 text-2xl font-mono tracking-widest text-white placeholder-zinc-700 focus:border-zinc-400 focus:outline-none rounded-none text-center"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500">
              <button
                type="button"
                onClick={() => setStep("details")}
                className="hover:text-zinc-300 underline font-mono"
              >
                ← Back to details
              </button>

              <button
                type="button"
                disabled={cooldown > 0 || isLoading}
                onClick={handleResend}
                className="hover:text-zinc-300 font-mono disabled:opacity-40"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </div>

            <div className="pt-3 border-t border-zinc-900">
              <button
                type="submit"
                disabled={isLoading || otpCode.length !== 6}
                className="w-full bg-zinc-100 hover:bg-white text-black font-semibold text-xs tracking-wider uppercase py-2.5 px-4 flex items-center justify-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying & Bootstrapping...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Authorize & Initialize Super Admin</span>
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
