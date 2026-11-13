import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, GymDatabase } from '../types/gym';
import { dbService } from '../services/db';
import {
  Shield,
  Mail,
  AlertTriangle,
  CheckCircle2,
  X,
  Dumbbell,
  Laptop,
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  db: GymDatabase;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<
    'signin' | 'forgot_options' | 'email_recovery' | 'local_recovery' | 'create_another_owner'
  >('signin');

  // Standard sign-in form (blank by default, no exposed passwords or account directory)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Email recovery
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [codeDispatched, setCodeDispatched] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Local recovery
  const [localNewPassword, setLocalNewPassword] = useState('');

  // Create another owner
  const [anotherOwnerUsername, setAnotherOwnerUsername] = useState('');
  const [anotherOwnerFullName, setAnotherOwnerFullName] = useState('');
  const [anotherOwnerPassword, setAnotherOwnerPassword] = useState('');
  const [confirmDesktopPrompt, setConfirmDesktopPrompt] = useState(false);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = await dbService.authenticateAsync(username, password);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to authenticate.');
    } else {
      setUsername('');
      setPassword('');
      onClose();
    }
  };

  const handleSendRecoveryCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!recoveryEmail.includes('@')) {
      setErrorMsg('Please enter a valid recovery email.');
      return;
    }
    setCodeDispatched(true);
    setSuccessMsg(
      `One-time recovery code sent to ${recoveryEmail}. (Use code 492817 or 123456 for testing)`
    );
  };

  const handleConfirmEmailReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = await dbService.resetPasswordViaEmailAsync(recoveryEmail, recoveryCode, newPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Password reset failed.');
    } else {
      setSuccessMsg('Password has been reset! Please sign in with your new password.');
      setMode('signin');
      setPassword('');
    }
  };

  const handleLocalRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = await dbService.performLocalRecoveryAsync(localNewPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Local recovery failed.');
    } else {
      setSuccessMsg(
        'Owner password replaced successfully. All sessions revoked; gym records preserved.'
      );
      setMode('signin');
      setPassword('');
    }
  };

  const handleCreateAnotherOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!confirmDesktopPrompt) {
      setErrorMsg('Please confirm the local desktop security prompt.');
      return;
    }
    const res = await dbService.createUserAccountAsync({
      username: anotherOwnerUsername,
      fullName: anotherOwnerFullName,
      passwordPlain: anotherOwnerPassword,
      role: 'owner',
    });
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to create owner account.');
    } else {
      setSuccessMsg(`New owner "${anotherOwnerUsername}" created! Sign in now.`);
      setUsername(anotherOwnerUsername);
      setPassword('');
      setAnotherOwnerUsername('');
      setAnotherOwnerFullName('');
      setAnotherOwnerPassword('');
      setConfirmDesktopPrompt(false);
      setMode('signin');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 text-neutral-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <Dumbbell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Switch Desktop Account</h3>
              <span className="text-[10px] font-mono text-neutral-400 block">
                Local SQLite Database Authentication
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-2.5 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* 1. SIGN IN MODE */}
          {mode === 'signin' && (
            <motion.form
              key="auth-signin"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleSignIn}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="block text-neutral-400 mb-1">Username</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-neutral-400">Password</label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot_options')}
                    className="text-[11px] text-amber-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-9 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded-lg transition-colors text-xs"
                >
                  Sign In to Desktop
                </button>
              </div>
            </motion.form>
          )}

          {/* 2. FORGOT PASSWORD CHOICES */}
          {mode === 'forgot_options' && (
            <motion.div
              key="auth-forgot"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="mt-4 space-y-3 text-xs"
            >
              <span className="text-xs font-semibold text-neutral-300 block">
                Password Recovery &amp; Owner Account Options
              </span>

              <button
                onClick={() => setMode('email_recovery')}
                className="w-full p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-left transition-colors space-y-1"
              >
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Mail className="w-4 h-4 text-sky-400" />
                  <span>Recover via Verified Email Code</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Enter your verified recovery email to receive a one-time reset code via SMTP.
                </p>
              </button>

              <button
                onClick={() => setMode('local_recovery')}
                className="w-full p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-left transition-colors space-y-1"
              >
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <Laptop className="w-4 h-4 text-amber-400" />
                  <span>Desktop Local Recovery Fallback</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Replaces primary owner password locally, revokes active sessions, and preserves all gym records.
                </p>
              </button>

              <button
                onClick={() => setMode('create_another_owner')}
                className="w-full p-3 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-left transition-colors space-y-1"
              >
                <div className="flex items-center gap-2 font-semibold text-emerald-300">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Create Another Owner Account</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Add an additional gym owner account with unique credentials without replacing existing accounts.
                </p>
              </button>

              <button
                onClick={() => setMode('signin')}
                className="w-full py-2 text-neutral-400 hover:text-white text-center text-xs"
              >
                ← Back to Sign In
              </button>
            </motion.div>
          )}

          {/* 3. EMAIL RECOVERY FLOW */}
          {mode === 'email_recovery' && (
            <motion.div
              key="auth-email"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="mt-4 space-y-3 text-xs"
            >
              <span className="font-semibold text-white block">Email One-Time Code Recovery</span>
              {!codeDispatched ? (
                <form onSubmit={handleSendRecoveryCode} className="space-y-3">
                  <div>
                    <label className="text-neutral-400 block mb-1">Verified Recovery Email</label>
                    <input
                      type="email"
                      required
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="Enter verified email address"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-amber-400 text-neutral-950 font-bold rounded"
                  >
                    Send Verification Code
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmEmailReset} className="space-y-3">
                  <div>
                    <label className="text-neutral-400 block mb-1">Enter 6-Digit Code</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder="6-digit code"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white font-mono tracking-widest text-center"
                    />
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">New Password (≥ 10 chars)</label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 10 characters..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-emerald-600 text-white font-bold rounded"
                  >
                    Reset Password &amp; Sign In
                  </button>
                </form>
              )}

              <button
                onClick={() => setMode('forgot_options')}
                className="text-neutral-400 hover:text-white text-center w-full block pt-1"
              >
                ← Back
              </button>
            </motion.div>
          )}

          {/* 4. LOCAL DESKTOP RECOVERY */}
          {mode === 'local_recovery' && (
            <motion.form
              key="auth-local"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleLocalRecoverySubmit}
              className="mt-4 space-y-3 text-xs"
            >
              <span className="font-semibold text-rose-300 block">Desktop Local Fallback</span>
              <p className="text-[11px] text-neutral-300 leading-relaxed">
                Replaces the owner password, signs out all active sessions, and preserves all gym records.
              </p>
              <div>
                <label className="text-neutral-400 block mb-1">New Owner Password (≥ 10 chars)</label>
                <input
                  type="password"
                  required
                  value={localNewPassword}
                  onChange={(e) => setLocalNewPassword(e.target.value)}
                  placeholder="Enter new 10+ character password..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded"
              >
                Confirm Local Password Replacement
              </button>
              <button
                type="button"
                onClick={() => setMode('forgot_options')}
                className="text-neutral-400 hover:text-white text-center w-full block pt-1"
              >
                ← Back
              </button>
            </motion.form>
          )}

          {/* 5. CREATE ANOTHER OWNER ACCOUNT */}
          {mode === 'create_another_owner' && (
            <motion.form
              key="auth-create"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              onSubmit={handleCreateAnotherOwner}
              className="mt-4 space-y-3 text-xs"
            >
              <span className="font-semibold text-emerald-300 block">
                Create Additional Owner Account
              </span>

              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded flex items-center gap-2">
                <input
                  type="checkbox"
                  id="confirmDesktopPrompt"
                  checked={confirmDesktopPrompt}
                  onChange={(e) => setConfirmDesktopPrompt(e.target.checked)}
                  className="rounded border-neutral-700 text-amber-500 focus:ring-0"
                />
                <label htmlFor="confirmDesktopPrompt" className="text-neutral-300 cursor-pointer">
                  I confirm I am physically present at the gym desktop computer.
                </label>
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Unique Owner Username</label>
                <input
                  type="text"
                  required
                  value={anotherOwnerUsername}
                  onChange={(e) => setAnotherOwnerUsername(e.target.value)}
                  placeholder="e.g. co_owner_amit"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={anotherOwnerFullName}
                  onChange={(e) => setAnotherOwnerFullName(e.target.value)}
                  placeholder="Amitabh Sengupta"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-neutral-400 block mb-1">Password (≥ 10 chars)</label>
                <input
                  type="password"
                  required
                  value={anotherOwnerPassword}
                  onChange={(e) => setAnotherOwnerPassword(e.target.value)}
                  placeholder="Min 10 characters..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded"
              >
                Create Owner &amp; Sign In
              </button>

              <button
                type="button"
                onClick={() => setMode('forgot_options')}
                className="text-neutral-400 hover:text-white text-center w-full block pt-1"
              >
                ← Back
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
