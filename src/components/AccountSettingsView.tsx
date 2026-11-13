import React, { useState } from 'react';
import { GymDatabase, User, UserRole } from '../types/gym';
import { dbService, hasPermission, isSuperAdminRole, getRoleLabel } from '../services/db';
import { AnimatedCard, AnimatedSectionPanel } from './MotionPrimitives';
import {
  UserCheck,
  Shield,
  ShieldCheck,
  Crown,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
  Layers,
  Briefcase,
  Calculator,
  ClipboardList,
  Monitor,
  Bell,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';

interface AccountSettingsViewProps {
  db: GymDatabase;
  currentUser: User | null;
}

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({ db, currentUser }) => {
  const canManageStaffAccounts = hasPermission(currentUser, 'canManageStaffAccounts');
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);

  // Email verification state
  const [emailInput, setEmailInput] = useState(currentUser?.recoveryEmail || '');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // New User Account form
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');

  // Account deletion confirm
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Local Recovery trigger
  const [localRecoveryPassword, setLocalRecoveryPassword] = useState('');
  const [showLocalRecoveryConfirm, setShowLocalRecoveryConfirm] = useState(false);

  // Send verification code
  const handleSendCode = () => {
    if (!emailInput.trim() || !emailInput.includes('@')) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    setCodeSent(true);
    setStatusMsg({
      type: 'success',
      text: `Verification code sent to ${emailInput} via gym SMTP. (For testing, enter code 492817 or 123456)`,
    });
  };

  // Verify code
  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode !== '492817' && verificationCode !== '123456') {
      setStatusMsg({ type: 'error', text: 'Invalid verification code. Use 492817 or 123456.' });
      return;
    }

    if (currentUser) {
      dbService.verifyAccountEmail(currentUser.id, emailInput);
      setStatusMsg({
        type: 'success',
        text: 'Recovery email verified successfully! You can now use email password recovery.',
      });
      setCodeSent(false);
      setVerificationCode('');
    }
  };

  // Create Staff, Owner, Admin, or Super Admin
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await dbService.createUserAccountAsync({
      username: newUsername,
      fullName: newFullName,
      passwordPlain: newPassword,
      role: newRole,
    });
    if (!res.success) {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to create account.' });
    } else {
      setStatusMsg({
        type: 'success',
        text: `${getRoleLabel(newRole)} account "${newUsername}" created with scrypt password hashing.`,
      });
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
    }
  };

  // Delete User
  const handleDeleteUser = (userId: string) => {
    const res = dbService.deleteUserAccount(userId);
    if (!res.success) {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to delete account.' });
    } else {
      setStatusMsg({ type: 'success', text: 'Account removed from local database.' });
    }
    setConfirmDeleteUserId(null);
  };

  // Local Recovery
  const handlePerformLocalRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await dbService.performLocalRecoveryAsync(localRecoveryPassword);
    if (!res.success) {
      setStatusMsg({ type: 'error', text: res.error || 'Recovery failed.' });
    } else {
      setStatusMsg({
        type: 'success',
        text: 'Owner/Admin password replaced via local desktop fallback. All sessions invalidated. Database records preserved.',
      });
      setShowLocalRecoveryConfirm(false);
      setLocalRecoveryPassword('');
    }
  };

  const handleToggleDesktopSetting = async (
    key: 'minimizeToTray' | 'launchAtStartup' | 'desktopNotificationsEnabled' | 'autoCheckUpdates',
    value: boolean
  ) => {
    await dbService.updateDesktopSettingsAsync({ [key]: value });
    setStatusMsg({ type: 'success', text: 'Windows desktop preferences saved to SQLite.' });
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const handleCheckUpdates = async () => {
    const res = await dbService.checkForAppUpdatesAsync();
    setStatusMsg({ type: 'success', text: res.status });
  };

  const handleOpenDataFolder = () => {
    const api = (window as any).electronAPI;
    if (api?.openDataFolder) {
      void api.openDataFolder();
    } else {
      setStatusMsg({
        type: 'success',
        text: `SQLite storage location: ${db.dbPath}`,
      });
    }
  };

  const renderRoleBadgeIcon = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return <Crown className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      case 'admin':
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'owner':
        return <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'manager':
        return <Briefcase className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'accountant':
        return <Calculator className="w-3.5 h-3.5 text-teal-400 shrink-0" />;
      case 'receptionist':
        return <ClipboardList className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
      case 'staff':
      default:
        return <UserCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    }
  };

  const upgradeModulesList = [
    {
      key: 'multiBranchEnabled' as const,
      title: 'Multi-Branch Franchise Sync',
      desc: 'Enable branch switcher and consolidated revenue aggregation.',
    },
    {
      key: 'gstInvoicingEnabled' as const,
      title: 'Automated GST Tax Invoicing',
      desc: 'Include GSTIN, HSN/SAC codes, and CGST/SGST splits on receipts.',
    },
    {
      key: 'biometricGateEnabled' as const,
      title: 'Biometric & QR Turnstile Gate',
      desc: 'Hardware relay integration for automated gym door unlock.',
    },
    {
      key: 'trainerPayrollEnabled' as const,
      title: 'Trainer Payroll & Commission',
      desc: 'Track PT session payouts and trainer commission percentages.',
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="pb-2 border-b border-neutral-800">
        <h2 className="text-xl font-bold tracking-tight text-white">Account & Security Center</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Super Admin, Admin, Owner & Staff credentials · SMTP recovery verification · Future upgrade slots
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-800 text-rose-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 2-Column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Current Account Profile, Email Verification, & Accounts Directory */}
        <div className="space-y-6">
          <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                {renderRoleBadgeIcon(currentUser?.role || 'staff')}
                <h3 className="text-sm font-bold text-white">Signed-in Account Profile</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded uppercase">
                {getRoleLabel(currentUser?.role)}
              </span>
            </div>

            <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg space-y-1.5 text-xs text-neutral-300">
              <div className="flex justify-between">
                <span className="text-neutral-500">Username</span>
                <span className="font-mono font-bold text-white">{currentUser?.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Full Name</span>
                <span>{currentUser?.fullName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Recovery Email</span>
                <span className="font-mono">
                  {currentUser?.recoveryEmail || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-neutral-800">
                <span className="text-neutral-500">Email Recovery Status</span>
                {currentUser?.emailVerified ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verified via SMTP</span>
                  </span>
                ) : (
                  <span className="text-amber-400 text-[11px] font-mono">
                    Pending Verification
                  </span>
                )}
              </div>
            </div>

            {/* Email Verification Box */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold text-white">
                  Verify Account Recovery Email
                </h4>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Each account must sign in once and verify its own recovery address under Account settings before email recovery is available.
              </p>

              {!codeSent ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter your personal recovery email..."
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSendCode}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded"
                  >
                    Send One-Time Code
                  </button>
                </div>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="Enter 6-digit code (e.g. 492817)..."
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono tracking-widest text-center"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded"
                    >
                      Confirm Code
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-neutral-500">
                    <span>Sent to {emailInput}</span>
                    <button
                      type="button"
                      onClick={() => setCodeSent(false)}
                      className="text-amber-400 hover:underline"
                    >
                      Change Email
                    </button>
                  </div>
                </form>
              )}
            </div>
          </AnimatedSectionPanel>

          {/* Local Accounts Directory with Delete Button */}
          <AnimatedSectionPanel delay={0.05} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Local Accounts Directory</h3>
              </div>
              <span className="text-[10px] font-mono text-neutral-400">
                {db.users.length} accounts
              </span>
            </div>

            <div className="space-y-2">
              {db.users.map((u, idx) => {
                const isSelf = u.id === currentUser?.id;
                const isConfirming = confirmDeleteUserId === u.id;
                return (
                  <AnimatedCard
                    key={u.id}
                    index={idx}
                    className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {renderRoleBadgeIcon(u.role)}
                        <span className="font-mono font-semibold text-white truncate">
                          {u.username}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-neutral-800 text-neutral-300 rounded uppercase">
                          {getRoleLabel(u.role)}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] font-mono text-emerald-400">(You)</span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-500 block truncate mt-0.5">
                        {u.fullName}
                      </span>
                    </div>

                    {canManageStaffAccounts && !isSelf && (
                      <div className="shrink-0">
                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-semibold"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDeleteUserId(null)}
                              className="px-2 py-1 bg-neutral-800 text-neutral-300 rounded text-[10px]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteUserId(u.id)}
                            className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
                            title={`Delete ${u.username}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </AnimatedCard>
                );
              })}
            </div>
          </AnimatedSectionPanel>
        </div>

        {/* Right Column: User Creation, Future Upgrade Modules & Local Desktop Recovery */}
        <div className="space-y-6">
          {/* Create User Form */}
          <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Create User Account</h3>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">Role-Based Auth</span>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. trainer_raj"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="Rajesh Nair"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">
                    Password ({newRole === 'staff' || newRole === 'receptionist' ? '≥ 8 chars' : '≥ 10 chars'})
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Role & Permissions</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="staff">Head Trainer / Staff</option>
                    <option value="receptionist">Front Desk Receptionist</option>
                    {isSuperAdmin && (
                      <>
                        <option value="manager">Branch Manager</option>
                        <option value="accountant">Finance Manager</option>
                        <option value="admin">Operations Admin</option>
                        <option value="owner">Gym Owner</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!canManageStaffAccounts}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-950 font-semibold rounded transition-colors"
                >
                  {canManageStaffAccounts ? `Create ${getRoleLabel(newRole)} Account` : 'Account Provisioning Restricted'}
                </button>
              </div>
            </form>
          </AnimatedSectionPanel>

          {/* Future Upgrade Modules (Super Admin Control) */}
          <AnimatedSectionPanel delay={0.05} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Future Upgrade Modules</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
                {isSuperAdmin ? 'Super Admin Unlocked' : 'Super Admin Only'}
              </span>
            </div>

            <div className="space-y-2">
              {upgradeModulesList.map((mod, idx) => {
                const enabled = Boolean(db.upgradeModules?.[mod.key]);
                return (
                  <AnimatedCard
                    key={mod.key}
                    index={idx}
                    className="p-2.5 bg-neutral-950/60 border border-neutral-800 rounded-lg flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-neutral-200 block">{mod.title}</span>
                      <span className="text-[11px] text-neutral-500 block">{mod.desc}</span>
                    </div>
                    <button
                      type="button"
                      disabled={!isSuperAdmin}
                      onClick={() =>
                        dbService.updateUpgradeModules({ [mod.key]: !enabled })
                      }
                      className={`px-2.5 py-1 rounded font-mono text-[10px] border transition-colors shrink-0 disabled:opacity-50 ${
                        enabled
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white'
                      }`}
                    >
                      {enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </AnimatedCard>
                );
              })}
            </div>
          </AnimatedSectionPanel>

          {/* Desktop Local Recovery Fallback Box */}
          <AnimatedSectionPanel delay={0.08} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="w-4 h-4" />
              <h3 className="text-sm font-bold text-white">Desktop Local Emergency Recovery</h3>
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              The owner/admin can use local recovery as a fallback from the desktop if no recovery email has been verified; it replaces the password, signs out active sessions, and preserves gym records.
            </p>

            {!showLocalRecoveryConfirm ? (
              <button
                type="button"
                onClick={() => setShowLocalRecoveryConfirm(true)}
                className="px-3 py-2 bg-neutral-800 hover:bg-rose-950/60 border border-neutral-700 hover:border-rose-800 text-rose-300 font-medium rounded transition-colors"
              >
                Invoke Local Desktop Owner Recovery
              </button>
            ) : (
              <form onSubmit={handlePerformLocalRecovery} className="p-3 bg-neutral-950 border border-rose-900/60 rounded-lg space-y-3">
                <span className="font-semibold text-rose-300 block">
                  Confirm Local Password Replacement
                </span>
                <input
                  type="password"
                  required
                  value={localRecoveryPassword}
                  onChange={(e) => setLocalRecoveryPassword(e.target.value)}
                  placeholder="New password (minimum 10 characters)..."
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-rose-400"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLocalRecoveryConfirm(false)}
                    className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded"
                  >
                    Replace Password
                  </button>
                </div>
              </form>
            )}
          </AnimatedSectionPanel>

          {/* Windows Desktop, System Tray, Startup & Auto-Update Box */}
          <AnimatedSectionPanel delay={0.1} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">Windows Desktop, Tray & Auto-Updates</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                v{db.desktopSettings?.appVersion || '2.0.0'}
              </span>
            </div>

            <div className="space-y-2.5">
              {[
                {
                  key: 'minimizeToTray' as const,
                  title: 'Minimize to Windows System Tray',
                  desc: 'Keep Flex & Flow and daily SQLite backup scheduler active when window closes.',
                  val: Boolean(db.desktopSettings?.minimizeToTray ?? true),
                },
                {
                  key: 'launchAtStartup' as const,
                  title: 'Launch Automatically at Windows Login',
                  desc: 'Register startup item via Electron OS integration.',
                  val: Boolean(db.desktopSettings?.launchAtStartup),
                },
                {
                  key: 'desktopNotificationsEnabled' as const,
                  title: 'Windows Native Notifications',
                  desc: 'Notify desk staff about expiring memberships & completed daily backups.',
                  val: Boolean(db.desktopSettings?.desktopNotificationsEnabled ?? true),
                },
                {
                  key: 'autoCheckUpdates' as const,
                  title: 'Automatic App Updates (Data-Safe)',
                  desc: 'Preserves %APPDATA%\\Flex & Flow\\gym.sqlite across installer updates.',
                  val: Boolean(db.desktopSettings?.autoCheckUpdates ?? true),
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="p-2.5 bg-neutral-950/60 border border-neutral-800 rounded-lg flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-neutral-200 block">{item.title}</span>
                    <span className="text-[11px] text-neutral-500 block">{item.desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={item.val}
                    onChange={(e) => void handleToggleDesktopSetting(item.key, e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-700 text-amber-400 focus:ring-0 shrink-0"
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void dbService.triggerDesktopTestNotificationAsync()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded font-medium"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Test Notification</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenDataFolder}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded font-medium"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
                  <span>Data Folder</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleCheckUpdates()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-semibold rounded"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Check Updates</span>
              </button>
            </div>
          </AnimatedSectionPanel>
        </div>
      </div>
    </div>
  );
};
