import React, { useState } from "react";
import { Shield, Lock, Mail, ArrowRight, KeyRound, AlertTriangle, RefreshCw, Key, ExternalLink } from "lucide-react";
import { api } from "../../services/api.js";
import { AuthUser } from "../../types/index.js";

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
  onOpenGuestLink?: (guestData: any) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onOpenGuestLink }) => {
  const [mode, setMode] = useState<"password" | "otp" | "forgot" | "guest">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [guestToken, setGuestToken] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [isLiveSmtp, setIsLiveSmtp] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Invitation Onboarding State
  const [isInviteOnboarding, setIsInviteOnboarding] = useState(false);
  const [invitedRoleName, setInvitedRoleName] = useState("");
  const [invitedBy, setInvitedBy] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [invitePassword, setInvitePassword] = useState("");

  // 1. Password Login
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!identifier || !password) {
      setError("Please enter your username/email and password.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.loginWithPassword({ identifier: identifier.trim(), password });
      localStorage.setItem("auth_token", res.token);
      localStorage.setItem("active_user_id", res.user.id);
      onLoginSuccess(res.user, res.token);
    } catch (err: any) {
      setError(err.message || "Failed to authenticate.");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Request OTP for Login
  const handleRequestLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email) {
      setError("Please enter your registered email address.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await api.requestLoginOtp(email.trim());
      setOtpSent(true);
      setCooldown(res.resendCooldownSeconds || 60);
      setIsLiveSmtp(Boolean(res.isLiveSmtp));
      if (res.devOtpCode) {
        setDevOtpCode(res.devOtpCode);
      }

      if (res.isInvite) {
        setIsInviteOnboarding(true);
        setInvitedRoleName(res.roleName || "Administrator");
        setInvitedBy(res.inviterName || "Initial Super Admin");
        const defaultUser = email.trim().split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "");
        setInviteUsername(defaultUser);
        setSuccessMessage(
          res.isLiveSmtp
            ? `Administrator invitation verified! Passcode sent to ${email.trim()}.`
            : "Administrator invitation verified! Activation code generated."
        );
      } else {
        setIsInviteOnboarding(false);
        setSuccessMessage(res.isLiveSmtp ? "One-Time Passcode sent to your email inbox." : "One-Time Passcode generated.");
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
      setError(err.message || "Failed to dispatch login code.");
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Confirm OTP Login
  const handleConfirmLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otpCode || otpCode.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    try {
      setIsLoading(true);
      let res;
      if (isInviteOnboarding) {
        if (!inviteFullName.trim() || !inviteUsername.trim()) {
          setError("Full name and username are required to activate your admin account.");
          setIsLoading(false);
          return;
        }
        res = await api.confirmInviteOtp({
          email: email.trim(),
          code: otpCode.trim(),
          full_name: inviteFullName.trim(),
          username: inviteUsername.trim(),
          password: invitePassword.trim() ? invitePassword : undefined
        });
      } else {
        res = await api.confirmLoginOtp(email.trim(), otpCode.trim());
      }

      localStorage.setItem("auth_token", res.token);
      localStorage.setItem("active_user_id", res.user.id);
      onLoginSuccess(res.user, res.token);
    } catch (err: any) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Request Password Reset OTP
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError("Please enter your account email address.");
      return;
    }

    try {
      setIsLoading(true);
      await api.requestPasswordReset(email.trim());
      setOtpSent(true);
      setSuccessMessage("Password reset code sent to your email.");
    } catch (err: any) {
      setError(err.message || "Failed to send reset code.");
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Confirm Password Reset
  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otpCode || !newPassword) {
      setError("Both verification code and new password are required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    try {
      setIsLoading(true);
      await api.confirmPasswordReset({
        email: email.trim(),
        code: otpCode.trim(),
        newPassword
      });
      setSuccessMessage("Password successfully reset. You may now sign in.");
      setMode("password");
      setOtpSent(false);
      setOtpCode("");
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Guest Link Access
  const handleGuestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!guestToken) {
      setError("Guest link token is required.");
      return;
    }

    try {
      setIsLoading(true);
      const guestData = await api.accessGuestLink(guestToken.trim(), guestPassword ? guestPassword : undefined);
      localStorage.setItem("auth_token", guestData.token);
      onLoginSuccess(guestData.user, guestData.token);
      if (onOpenGuestLink) {
        onOpenGuestLink(guestData);
      }
    } catch (err: any) {
      setError(err.message || "Invalid or expired guest link.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-md border border-zinc-800 bg-zinc-950 p-8 shadow-2xl relative rounded-none">
        {/* Top Header */}
        <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-4">
          <div className="p-2 bg-zinc-900 border border-zinc-700 text-zinc-100">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-white">
              Hierarchy Pyramid System
            </h1>
            <p className="text-xs text-zinc-400 font-mono">
              Enterprise Access & Security Control
            </p>
          </div>
        </div>

        {/* Tab Switching */}
        <div className="grid grid-cols-3 gap-1 mb-6 bg-zinc-900 p-1 border border-zinc-800">
          <button
            type="button"
            onClick={() => { setMode("password"); setError(null); setSuccessMessage(null); }}
            className={`text-xs py-1.5 font-mono uppercase tracking-wider transition-colors ${
              mode === "password" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => { setMode("otp"); setError(null); setSuccessMessage(null); setOtpSent(false); }}
            className={`text-xs py-1.5 font-mono uppercase tracking-wider transition-colors ${
              mode === "otp" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Email OTP
          </button>
          <button
            type="button"
            onClick={() => { setMode("guest"); setError(null); setSuccessMessage(null); }}
            className={`text-xs py-1.5 font-mono uppercase tracking-wider transition-colors ${
              mode === "guest" ? "bg-zinc-800 text-white font-bold" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Guest Link
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 border border-red-800/80 bg-red-950/40 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs">
            {successMessage}
          </div>
        )}

        {/* Mode 1: Password Login */}
        {mode === "password" && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Username or Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin@unthink.io or username"
                  className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); setSuccessMessage(null); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline font-mono"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2.5 px-4 flex items-center justify-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Mode 2: Passwordless OTP Login */}
        {mode === "otp" && (
          <div>
            {!otpSent ? (
              <form onSubmit={handleRequestLoginOtp} className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Sign in securely without a password. We will dispatch a single-use verification code to your registered email.
                </p>
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                    Registered Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@enterprise.io"
                      className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2.5 px-4 flex items-center justify-center gap-2 rounded-none transition-colors disabled:opacity-50"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Request Sign-In Code</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmLoginOtp} className="space-y-4">
                {isInviteOnboarding && (
                  <div className="p-3 border border-zinc-700 bg-zinc-900/90 text-xs space-y-1">
                    <span className="font-mono text-white uppercase font-bold flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-zinc-300" />
                      <span>Administrator Invitation Verified</span>
                    </span>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      Invited by <strong className="text-white">{invitedBy}</strong> as <strong className="text-white">{invitedRoleName}</strong>.
                      Enter the 6-digit passcode sent to <strong className="text-zinc-200 font-mono">{email}</strong> to activate your profile.
                    </p>
                  </div>
                )}

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
                    Enter 6-Digit Passcode
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
                      className="w-full bg-zinc-900 border border-zinc-700 pl-11 pr-4 py-2.5 text-2xl font-mono tracking-widest text-white text-center focus:border-zinc-400 focus:outline-none rounded-none"
                    />
                  </div>
                </div>

                {isInviteOnboarding && (
                  <div className="space-y-3 pt-2 border-t border-zinc-800">
                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                        Your Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={inviteFullName}
                        onChange={(e) => setInviteFullName(e.target.value)}
                        placeholder="e.g. Jordan Miller"
                        className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                        Choose Administrator Username *
                      </label>
                      <input
                        type="text"
                        required
                        value={inviteUsername}
                        onChange={(e) => setInviteUsername(e.target.value)}
                        placeholder="e.g. jmiller"
                        className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                        Set Password (Optional - for future password login)
                      </label>
                      <input
                        type="password"
                        value={invitePassword}
                        onChange={(e) => setInvitePassword(e.target.value)}
                        placeholder="•••••••••••• (min 8 characters)"
                        className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setIsInviteOnboarding(false);
                    }}
                    className="hover:text-zinc-300 font-mono underline cursor-pointer"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    disabled={cooldown > 0 || isLoading}
                    onClick={handleRequestLoginOtp}
                    className="hover:text-zinc-300 font-mono disabled:opacity-40 cursor-pointer"
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading || otpCode.length !== 6}
                    className="w-full bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2.5 px-4 flex items-center justify-center gap-2 rounded-none transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <span>
                        {isInviteOnboarding ? "Confirm & Activate Administrator Account" : "Confirm & Sign In"}
                      </span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Mode 3: Forgot Password */}
        {mode === "forgot" && (
          <div>
            {!otpSent ? (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Enter your account email to receive a password reset authorization code.
                </p>
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                    Account Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@unthink.io"
                      className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setMode("password")}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline font-mono"
                  >
                    Back to sign in
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2 px-4 rounded-none transition-colors disabled:opacity-50"
                  >
                    {isLoading ? "Sending..." : "Send Reset Code"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                    6-Digit Reset Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-full bg-zinc-900 border border-zinc-700 py-2 text-xl font-mono tracking-widest text-center text-white focus:border-zinc-400 focus:outline-none rounded-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                    New Master Password
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-zinc-400 focus:outline-none rounded-none"
                  />
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2.5 px-4 rounded-none transition-colors disabled:opacity-50"
                  >
                    {isLoading ? "Updating..." : "Update Password & Return"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Mode 4: Guest Link Access */}
        {mode === "guest" && (
          <form onSubmit={handleGuestAccess} className="space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              If an administrator has issued a guest access link token, paste it here to view the authorized hierarchy branch.
            </p>
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Guest Link Token
              </label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={guestToken}
                  onChange={(e) => setGuestToken(e.target.value)}
                  placeholder="Paste guest link token..."
                  className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">
                Link Password (Optional)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                <input
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="If password-protected"
                  className="w-full bg-zinc-900 border border-zinc-800 px-9 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-400 focus:outline-none rounded-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-zinc-100 hover:bg-white text-black font-bold text-xs tracking-wider uppercase py-2.5 px-4 flex items-center justify-center gap-2 rounded-none transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Enter as Guest</span>
                    <ExternalLink className="w-4 h-4" />
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
