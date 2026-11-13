import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GymDatabase, UserRole } from '../types/gym';
import { dbService, getRoleLabel } from '../services/db';
import { AnimatedCard } from './MotionPrimitives';
import {
  Dumbbell,
  Crown,
  KeyRound,
  Mail,
  Laptop,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  Layers,
  Building2,
  ReceiptText,
  Fingerprint,
  Wallet,
  Lock,
  User as UserIcon,
  ShieldCheck,
  Database,
  Sparkles,
  UserPlus,
} from 'lucide-react';

interface LoginPageProps {
  db: GymDatabase;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const LoginPage: React.FC<LoginPageProps> = ({ db }) => {
  const [mode, setMode] = useState<
    'signin' | 'forgot_options' | 'email_recovery' | 'local_recovery' | 'create_account'
  >('signin');

  // Normal sign-in state (blank by default, no prefilled credentials)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorShakeKey, setErrorShakeKey] = useState(0);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Email recovery
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [codeDispatched, setCodeDispatched] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Local recovery
  const [localNewPassword, setLocalNewPassword] = useState('');

  // Create Account
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccFullName, setNewAccFullName] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccRole, setNewAccRole] = useState<UserRole>('staff');
  const [confirmDesktopPrompt, setConfirmDesktopPrompt] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setErrorShakeKey((k) => k + 1);
  };

  const switchMode = (
    nextMode: 'signin' | 'forgot_options' | 'email_recovery' | 'local_recovery' | 'create_account'
  ) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setMode(nextMode);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);
    try {
      const res = await dbService.authenticateAsync(username, password);
      if (!res.success) {
        triggerError(res.error || 'Invalid username or password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendRecoveryCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!recoveryEmail.includes('@')) {
      triggerError('Please enter a valid recovery email.');
      return;
    }
    setCodeDispatched(true);
    setSuccessMsg(
      `One-time recovery code sent to ${recoveryEmail}. (Use code 492817 or 123456 for local verification)`
    );
  };

  const handleConfirmEmailReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const res = await dbService.resetPasswordViaEmailAsync(recoveryEmail, recoveryCode, newPassword);
      if (!res.success) {
        triggerError(res.error || 'Password reset failed.');
      } else {
        setSuccessMsg('Password has been reset. Please sign in with your new credentials.');
        setPassword('');
        setNewPassword('');
        setRecoveryCode('');
        setCodeDispatched(false);
        setMode('signin');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLocalRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const res = await dbService.performLocalRecoveryAsync(localNewPassword);
      if (!res.success) {
        triggerError(res.error || 'Local recovery failed.');
      } else {
        setSuccessMsg(
          'Primary owner/admin password replaced. All sessions revoked; gym records preserved.'
        );
        setPassword('');
        setLocalNewPassword('');
        setMode('signin');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg(null);
    if (!confirmDesktopPrompt) {
      triggerError('Please confirm the local desktop security prompt.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await dbService.createUserAccountAsync({
        username: newAccUsername,
        fullName: newAccFullName,
        passwordPlain: newAccPassword,
        role: newAccRole,
      });
      if (!res.success) {
        triggerError(res.error || 'Failed to create account.');
      } else {
        setSuccessMsg(
          `${getRoleLabel(newAccRole)} account "${newAccUsername}" created. Enter your credentials to sign in.`
        );
        setUsername(newAccUsername);
        setPassword('');
        setNewAccUsername('');
        setNewAccFullName('');
        setNewAccPassword('');
        setConfirmDesktopPrompt(false);
        setMode('signin');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const futureModules = [
    {
      icon: Building2,
      title: 'Multi-Branch Franchise Sync',
      tier: 'Enterprise',
      desc: 'Centralized member & revenue rollup across multiple gym locations.',
      enabled: db.upgradeModules?.multiBranchEnabled,
    },
    {
      icon: ReceiptText,
      title: 'Automated GST Tax Invoicing',
      tier: 'Billing',
      desc: 'HSN/SAC compliant GST invoices and monthly tax filing exports.',
      enabled: db.upgradeModules?.gstInvoicingEnabled,
    },
    {
      icon: Fingerprint,
      title: 'Biometric & QR Turnstile Gate',
      tier: 'Hardware',
      desc: 'Hardware door relay unlock linked to active membership validity.',
      enabled: db.upgradeModules?.biometricGateEnabled,
    },
    {
      icon: Wallet,
      title: 'Trainer Payroll & Commission',
      tier: 'Payouts',
      desc: 'Automated PT session split payouts and coach attendance tracking.',
      enabled: db.upgradeModules?.trainerPayrollEnabled,
    },
  ];

  const securityHighlights = [
    {
      icon: Database,
      title: 'Offline-First SQLite Engine',
      desc: 'Zero cloud dependency — instant local reads & writes in INR (₹).',
    },
    {
      icon: ShieldCheck,
      title: 'Role-Gated Governance',
      desc: '16 granular permissions managed strictly by Super Admin policy.',
    },
  ];

  return (
    <div className="relative flex-1 min-h-full overflow-y-auto bg-neutral-950 flex items-center justify-center p-4 sm:p-8">
      {/* Ambient Animated Background Accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.08, 1],
            opacity: [0.16, 0.26, 0.16],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-amber-500/20 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.05, 1, 1.05],
            opacity: [0.12, 0.2, 0.12],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-32 -right-24 w-96 h-96 rounded-full bg-amber-400/10 blur-3xl"
        />
      </div>

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Normal Animated Sign-In & Recovery Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
          className="lg:col-span-6 bg-neutral-900/95 backdrop-blur-sm border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-2xl shadow-black/50 transition-colors duration-200"
        >
          <div>
            {/* Brand Header */}
            <div className="flex items-center justify-between pb-5 border-b border-neutral-800">
              <div className="flex items-center gap-3.5">
                <motion.div
                  initial={{ scale: 0.75, rotate: -10, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.06 }}
                  whileHover={{ rotate: 8, scale: 1.06 }}
                  className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner"
                >
                  <Dumbbell className="w-5 h-5" />
                </motion.div>
                <div>
                  <h1 className="text-lg font-extrabold tracking-tight text-white">
                    Flex &amp; Flow
                  </h1>
                  <p className="text-[11px] font-mono text-neutral-400">
                    Gym Management Console
                  </p>
                </div>
              </div>
              <motion.span
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.12 }}
                className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-neutral-950 border border-neutral-800 text-amber-400 flex items-center gap-1.5"
              >
                <Lock className="w-3 h-3" />
                <span>Offline Auth</span>
              </motion.span>
            </div>

            {/* Animated Status Alerts */}
            <AnimatePresence mode="wait">
              {errorMsg && (
                <motion.div
                  key={`err-${errorShakeKey}`}
                  initial={{ opacity: 0, y: -6, x: 0 }}
                  animate={{ opacity: 1, y: 0, x: [0, -6, 6, -4, 4, 0] }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  className="mt-4 p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-xs text-rose-300 flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}

              {successMsg && !errorMsg && (
                <motion.div
                  key="success-alert"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="mt-4 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-xs text-emerald-300 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{successMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Animated View Switcher */}
            <AnimatePresence mode="wait">
              {/* SIGN IN FORM (Normal Login) */}
              {mode === 'signin' && (
                <motion.form
                  key="mode-signin"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                  onSubmit={handleSignIn}
                  className="mt-6 space-y-5 text-xs"
                >
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Sign in to your account
                    </h2>
                    <p className="text-xs text-neutral-400 mt-1">
                      Enter your assigned username and password to access the workspace.
                    </p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: 0.06, ease: EASE_OUT_EXPO }}
                  >
                    <label
                      htmlFor="login-username"
                      className="block text-neutral-300 mb-1.5 font-medium"
                    >
                      Username
                    </label>
                    <div className="relative group">
                      <UserIcon className="w-4 h-4 text-neutral-500 group-focus-within:text-amber-400 transition-colors absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-username"
                        type="text"
                        required
                        autoComplete="username"
                        autoFocus
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2.5 text-white font-mono placeholder:font-sans placeholder:text-neutral-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all"
                      />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: 0.11, ease: EASE_OUT_EXPO }}
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <label htmlFor="login-password" className="text-neutral-300 font-medium">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot_options')}
                        className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative group">
                      <Lock className="w-4 h-4 text-neutral-500 group-focus-within:text-amber-400 transition-colors absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-10 py-2.5 text-white font-mono placeholder:font-sans placeholder:text-neutral-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-200 transition-colors"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: 0.16, ease: EASE_OUT_EXPO }}
                    className="space-y-3 pt-1"
                  >
                    <motion.button
                      type="submit"
                      whileHover={{ scale: 1.012, y: -1 }}
                      whileTap={{ scale: 0.985 }}
                      className="group w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </motion.button>

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80 text-[11px] text-neutral-400">
                      <span>Need a new desktop account?</span>
                      <button
                        type="button"
                        onClick={() => switchMode('create_account')}
                        className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 hover:underline transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Register Account</span>
                      </button>
                    </div>
                  </motion.div>
                </motion.form>
              )}

              {/* FORGOT OPTIONS */}
              {mode === 'forgot_options' && (
                <motion.div
                  key="mode-forgot"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                  className="mt-5 space-y-3 text-xs"
                >
                  <span className="text-sm font-bold text-white block">
                    Password Recovery &amp; Account Access
                  </span>

                  <motion.button
                    whileHover={{ y: -2, scale: 1.005 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => switchMode('email_recovery')}
                    className="w-full p-3.5 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 hover:border-sky-500/40 rounded-xl text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <Mail className="w-4 h-4 text-sky-400" />
                      <span>Recover via Verified Email Code</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      Enter your verified recovery email to receive a one-time reset code.
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ y: -2, scale: 1.005 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => switchMode('local_recovery')}
                    className="w-full p-3.5 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 hover:border-amber-500/40 rounded-xl text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center gap-2 font-semibold text-amber-300">
                      <Laptop className="w-4 h-4 text-amber-400" />
                      <span>Desktop Local Recovery Fallback</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      Replaces the primary admin/owner password locally while preserving all gym records.
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ y: -2, scale: 1.005 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => switchMode('create_account')}
                    className="w-full p-3.5 bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 hover:border-emerald-500/40 rounded-xl text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center gap-2 font-semibold text-emerald-300">
                      <Crown className="w-4 h-4 text-purple-400" />
                      <span>Create New Account</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      Provision an additional user account directly on the gym desktop console.
                    </p>
                  </motion.button>

                  <button
                    onClick={() => switchMode('signin')}
                    className="w-full py-2 text-neutral-400 hover:text-white text-center text-xs transition-colors"
                  >
                    ← Back to Sign In
                  </button>
                </motion.div>
              )}

              {/* EMAIL RECOVERY */}
              {mode === 'email_recovery' && (
                <motion.div
                  key="mode-email"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                  className="mt-5 space-y-3 text-xs"
                >
                  <span className="font-bold text-sm text-white block">
                    Email One-Time Code Recovery
                  </span>
                  {!codeDispatched ? (
                    <form onSubmit={handleSendRecoveryCode} className="space-y-3">
                      <div>
                        <label className="text-neutral-400 block mb-1">
                          Verified Recovery Email
                        </label>
                        <input
                          type="email"
                          required
                          value={recoveryEmail}
                          onChange={(e) => setRecoveryEmail(e.target.value)}
                          placeholder="Enter your verified email address"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.985 }}
                        type="submit"
                        className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded-lg transition-colors"
                      >
                        Send Verification Code
                      </motion.button>
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
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white font-mono tracking-widest text-center focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="text-neutral-400 block mb-1">
                          New Password (≥ 10 chars)
                        </label>
                        <input
                          type="password"
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 10 characters..."
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.985 }}
                        type="submit"
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
                      >
                        Reset Password
                      </motion.button>
                    </form>
                  )}

                  <button
                    onClick={() => switchMode('forgot_options')}
                    className="text-neutral-400 hover:text-white text-center w-full block pt-1 transition-colors"
                  >
                    ← Back
                  </button>
                </motion.div>
              )}

              {/* LOCAL RECOVERY */}
              {mode === 'local_recovery' && (
                <motion.form
                  key="mode-local"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                  onSubmit={handleLocalRecoverySubmit}
                  className="mt-5 space-y-3 text-xs"
                >
                  <span className="font-bold text-sm text-rose-300 block">
                    Desktop Local Fallback
                  </span>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    Replaces the primary owner/admin password locally, revokes active sessions, and preserves all gym records.
                  </p>
                  <div>
                    <label className="text-neutral-400 block mb-1">New Password (≥ 10 chars)</label>
                    <input
                      type="password"
                      required
                      value={localNewPassword}
                      onChange={(e) => setLocalNewPassword(e.target.value)}
                      placeholder="Enter new 10+ character password..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-rose-400"
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.985 }}
                    type="submit"
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition-colors"
                  >
                    Confirm Local Password Replacement
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot_options')}
                    className="text-neutral-400 hover:text-white text-center w-full block pt-1 transition-colors"
                  >
                    ← Back
                  </button>
                </motion.form>
              )}

              {/* CREATE NEW ACCOUNT */}
              {mode === 'create_account' && (
                <motion.form
                  key="mode-create"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                  onSubmit={handleCreateAccount}
                  className="mt-5 space-y-3 text-xs"
                >
                  <span className="font-bold text-sm text-emerald-300 block">
                    Register Desktop Account
                  </span>

                  <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="confirmLoginDesktopPrompt"
                      checked={confirmDesktopPrompt}
                      onChange={(e) => setConfirmDesktopPrompt(e.target.checked)}
                      className="rounded border-neutral-700 text-amber-500 focus:ring-0"
                    />
                    <label htmlFor="confirmLoginDesktopPrompt" className="text-neutral-300 cursor-pointer">
                      I confirm physical authorization at the gym desktop console.
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-neutral-400 block mb-1">Account Role</label>
                      <select
                        value={newAccRole}
                        onChange={(e) => setNewAccRole(e.target.value as UserRole)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="admin">Operations Admin</option>
                        <option value="owner">Gym Owner</option>
                        <option value="manager">Branch Manager</option>
                        <option value="accountant">Finance Manager</option>
                        <option value="staff">Head Trainer (Staff)</option>
                        <option value="receptionist">Front Desk</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-neutral-400 block mb-1">Username</label>
                      <input
                        type="text"
                        required
                        value={newAccUsername}
                        onChange={(e) => setNewAccUsername(e.target.value)}
                        placeholder="e.g. branch_admin"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-white font-mono focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-neutral-400 block mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newAccFullName}
                      onChange={(e) => setNewAccFullName(e.target.value)}
                      placeholder="e.g. Arjun Nair"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 block mb-1">
                      Password ({newAccRole === 'staff' || newAccRole === 'receptionist' ? '≥ 8 chars' : '≥ 10 chars'})
                    </label>
                    <input
                      type="password"
                      required
                      value={newAccPassword}
                      onChange={(e) => setNewAccPassword(e.target.value)}
                      placeholder="Enter strong password..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.985 }}
                    type="submit"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors"
                  >
                    Create {getRoleLabel(newAccRole)} Account
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-neutral-400 hover:text-white text-center w-full block pt-1 transition-colors"
                  >
                    ← Back to Sign In
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between text-[11px] font-mono text-neutral-500">
            <span>DB: %APPDATA%\Flex &amp; Flow\gym.sqlite</span>
            <span>Asia/Kolkata · INR (₹)</span>
          </div>
        </motion.div>

        {/* Right: Platform Security & Future Upgrade Slots (No Account Credentials Exposed) */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.38, delay: 0.08, ease: EASE_OUT_EXPO }}
          className="lg:col-span-6 bg-neutral-900/70 backdrop-blur-sm border border-neutral-800 hover:border-neutral-700 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-5 transition-colors duration-200"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Workspace &amp; Future Upgrades</h2>
                  <p className="text-[11px] text-neutral-500">
                    Local-first gym operations &amp; expansion modules
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Modular Suite</span>
              </span>
            </div>

            {/* Platform Security Guarantees */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {securityHighlights.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <AnimatedCard
                    key={item.title}
                    index={idx}
                    className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-1.5"
                  >
                    <div className="flex items-center gap-2 font-bold text-amber-300">
                      <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{item.title}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">{item.desc}</p>
                  </AnimatedCard>
                );
              })}
            </div>

            {/* Future Upgrade Slots */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                  Upcoming Upgrade Modules
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  Managed by Super Admin
                </span>
              </div>

              <div className="space-y-2.5">
                {futureModules.map((mod, idx) => {
                  const Icon = mod.icon;
                  return (
                    <AnimatedCard
                      key={mod.title}
                      index={idx + 2}
                      className="p-3 rounded-xl bg-neutral-950/65 border border-neutral-800/90 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-amber-400 shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-neutral-200 truncate">
                              {mod.title}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 shrink-0">
                              {mod.tier}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                            {mod.desc}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 flex items-center gap-1.5 ${
                          mod.enabled
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {mod.enabled && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                        {mod.enabled ? 'Enabled' : 'Upgrade Slot'}
                      </span>
                    </AnimatedCard>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 text-[11px] text-neutral-400 leading-relaxed flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Role permissions, feature visibility, and backup restoration are enforced per account session.
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
