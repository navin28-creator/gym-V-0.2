import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminPermissions, GymDatabase, User, UserRole } from '../types/gym';
import {
  dbService,
  FULL_ADMIN_PERMISSIONS,
  ZERO_PERMISSIONS,
  OWNER_DEFAULT_PERMISSIONS,
  OPERATIONS_ADMIN_PERMISSIONS,
  MANAGER_DEFAULT_PERMISSIONS,
  ACCOUNTANT_DEFAULT_PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  RECEPTIONIST_DEFAULT_PERMISSIONS,
  getEffectivePermissions,
  getRoleLabel,
  isSuperAdminRole,
} from '../services/db';
import { AnimatedCard, AnimatedSectionPanel } from './MotionPrimitives';
import {
  Crown,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  CreditCard,
  Radio,
  History,
  TrendingUp,
  Plus,
  Check,
  X,
  Lock,
  SlidersHorizontal,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  UserCog,
  Trash2,
  AlertTriangle,
} from 'lucide-react';

interface SuperAdminPermissionsViewProps {
  db: GymDatabase;
  currentUser: User | null;
}

interface PermissionDescriptor {
  key: keyof AdminPermissions;
  label: string;
  description: string;
  riskLevel: 'standard' | 'elevated' | 'critical';
}

interface PermissionDomainGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  items: PermissionDescriptor[];
}

export const PERMISSION_DOMAIN_GROUPS: PermissionDomainGroup[] = [
  {
    id: 'members_plans',
    title: 'Member & Plan Operations',
    subtitle: 'Directory lifecycle, sensitive PII contact visibility, plan catalog, and destructive deletes',
    icon: Users,
    accentClass: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    items: [
      {
        key: 'canManageMembers',
        label: 'Manage Member Profiles',
        description: 'Enroll new gym members, edit status/goals, and assign membership plans.',
        riskLevel: 'standard',
      },
      {
        key: 'canViewMemberContactDetails',
        label: 'View Member Contact & Health PII',
        description: 'Reveal phone numbers, emails, emergency contacts, and declared medical notes.',
        riskLevel: 'elevated',
      },
      {
        key: 'canManagePlans',
        label: 'Create & Delete Plans / Enrollments',
        description: 'Create new membership tiers and delete unused plans or unbilled enrollments.',
        riskLevel: 'elevated',
      },
      {
        key: 'canDeleteMembers',
        label: 'Delete Member Records',
        description: 'Permanently remove member profiles without active financial history from SQLite.',
        riskLevel: 'critical',
      },
    ],
  },
  {
    id: 'finance_billing',
    title: 'Financial Ledger & Billing',
    subtitle: 'INR fee collection, receipt vouchers, WhatsApp dues reminders, and void reversal',
    icon: CreditCard,
    accentClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    items: [
      {
        key: 'canRecordPayments',
        label: 'Record External Payments',
        description: 'Log UPI, Cash, Bank Transfer, Cheque, and POS payments into the gym ledger.',
        riskLevel: 'standard',
      },
      {
        key: 'canPrintReceipts',
        label: 'Print & View Receipt Vouchers',
        description: 'Generate formatted INR receipt vouchers and print/export member payment slips.',
        riskLevel: 'standard',
      },
      {
        key: 'canSendPaymentReminders',
        label: 'Send WhatsApp & SMS Reminders',
        description: 'Trigger 1-click pending balance and renewal reminders to member mobile numbers.',
        riskLevel: 'elevated',
      },
      {
        key: 'canVoidAndDeletePayments',
        label: 'Void & Delete Payment Vouchers',
        description: 'Void recorded receipts with audit reasons and delete voided vouchers from ledger.',
        riskLevel: 'critical',
      },
    ],
  },
  {
    id: 'analytics_export',
    title: 'Analytics & Data Export',
    subtitle: '12-month revenue intelligence and outbound database/snapshot file downloads',
    icon: TrendingUp,
    accentClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
    items: [
      {
        key: 'canViewAnalytics',
        label: 'View 12-Month Financial Analytics',
        description: 'Access trailing 12-month revenue charts, collection splits, and churn breakdowns.',
        riskLevel: 'standard',
      },
      {
        key: 'canExportData',
        label: 'Export SQLite, Encrypted & ZIP Snapshots',
        description: 'Download .sqlite database files, .sqlite.enc encrypted archives, and source ZIP.',
        riskLevel: 'critical',
      },
    ],
  },
  {
    id: 'audit_recovery',
    title: 'Audit Trail & Disaster Recovery',
    subtitle: 'Gym-wide activity inspection, safe reversal engine, and AES-256 restore keys',
    icon: History,
    accentClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    items: [
      {
        key: 'canViewAllActivity',
        label: 'View Full Gym Activity Audit',
        description: 'Inspect actions performed by every user account instead of only personal activity.',
        riskLevel: 'elevated',
      },
      {
        key: 'canUndoActions',
        label: 'Execute Safe Reversal / Undo Actions',
        description: 'Reverse eligible mistakes with linked reversal log entries across members and payments.',
        riskLevel: 'critical',
      },
      {
        key: 'canManageBackups',
        label: 'AES-256 Backups & SQLite Restore',
        description: 'Configure SMTP backup schedules, view 32-byte keys, and restore gym.sqlite snapshots.',
        riskLevel: 'critical',
      },
    ],
  },
  {
    id: 'team_network',
    title: 'Team, Roles & Infrastructure',
    subtitle: 'Staff account provisioning, Tailscale Serve bridge, and Android Expo mobile access',
    icon: Radio,
    accentClass: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    items: [
      {
        key: 'canManageStaffAccounts',
        label: 'Manage Staff & Front-Desk Accounts',
        description: 'Create basic staff/front-desk accounts and remove non-privileged user accounts.',
        riskLevel: 'elevated',
      },
      {
        key: 'canManageTailscale',
        label: 'Tailscale Hub & Session Revocation',
        description: 'Start/stop the Tailscale port 3000 mobile bridge and revoke connected Android devices.',
        riskLevel: 'elevated',
      },
      {
        key: 'canAccessExpoMobile',
        label: 'Access Android Expo Mobile Client',
        description: 'Launch and operate the remote Android Expo mobile companion workflow.',
        riskLevel: 'elevated',
      },
    ],
  },
];

const TOTAL_PERMISSIONS_COUNT = Object.keys(FULL_ADMIN_PERMISSIONS).length;

const GOVERNED_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Operations Admin' },
  { value: 'owner', label: 'Gym Owner' },
  { value: 'manager', label: 'Branch Manager' },
  { value: 'accountant', label: 'Finance Manager' },
  { value: 'staff', label: 'Head Trainer (Staff)' },
  { value: 'receptionist', label: 'Front Desk' },
];

const PERMISSION_PRESETS: {
  id: string;
  label: string;
  subtitle: string;
  permissions: AdminPermissions;
}[] = [
  {
    id: 'full',
    label: 'Full Access (All 16)',
    subtitle: '16/16 capabilities enabled',
    permissions: { ...FULL_ADMIN_PERMISSIONS },
  },
  {
    id: 'owner',
    label: 'Gym Owner Standard',
    subtitle: '10/16 (Ops, finance, audit — no root recovery)',
    permissions: { ...OWNER_DEFAULT_PERMISSIONS },
  },
  {
    id: 'ops',
    label: 'Operations Admin',
    subtitle: '9/16 (No destructive delete, export, or undo)',
    permissions: { ...OPERATIONS_ADMIN_PERMISSIONS },
  },
  {
    id: 'manager',
    label: 'Branch Manager',
    subtitle: '8/16 (Branch roster, plans, billing, analytics)',
    permissions: { ...MANAGER_DEFAULT_PERMISSIONS },
  },
  {
    id: 'accountant',
    label: 'Finance Manager',
    subtitle: '5/16 (Payments, receipts, reminders, analytics)',
    permissions: { ...ACCOUNTANT_DEFAULT_PERMISSIONS },
  },
  {
    id: 'receptionist',
    label: 'Front Desk',
    subtitle: '4/16 (Member intake, PII view, payments, receipts)',
    permissions: { ...RECEPTIONIST_DEFAULT_PERMISSIONS },
  },
  {
    id: 'staff',
    label: 'Head Trainer (Staff)',
    subtitle: '3/16 (Basic members, payments, reminders)',
    permissions: { ...STAFF_DEFAULT_PERMISSIONS },
  },
  {
    id: 'zero',
    label: 'Zero Permissions',
    subtitle: '0/16 (All guarded actions locked)',
    permissions: { ...ZERO_PERMISSIONS },
  },
];

type RoleFilterGroup = 'all' | 'admin_owner' | 'manager_finance' | 'staff_desk';

export const SuperAdminPermissionsView: React.FC<SuperAdminPermissionsViewProps> = ({
  db,
  currentUser,
}) => {
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);

  const governedAccounts = useMemo(
    () => db.users.filter((u) => u.role !== 'super_admin'),
    [db.users]
  );
  const superAdmins = useMemo(
    () => db.users.filter((u) => u.role === 'super_admin'),
    [db.users]
  );

  const [roleFilter, setRoleFilter] = useState<RoleFilterGroup>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>(
    governedAccounts[0]?.id || ''
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(
    null
  );

  // Quick Create Governed Account Form State
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>('manager');
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);

  const filteredAccounts = useMemo(() => {
    return governedAccounts.filter((acc) => {
      if (roleFilter === 'all') return true;
      if (roleFilter === 'admin_owner') return acc.role === 'admin' || acc.role === 'owner';
      if (roleFilter === 'manager_finance')
        return acc.role === 'manager' || acc.role === 'accountant';
      return acc.role === 'staff' || acc.role === 'receptionist';
    });
  }, [governedAccounts, roleFilter]);

  const selectedAccount =
    governedAccounts.find((u) => u.id === selectedUserId) ||
    filteredAccounts[0] ||
    governedAccounts[0] ||
    null;
  const selectedPermissions = selectedAccount
    ? getEffectivePermissions(selectedAccount)
    : null;

  // Contextual keyboard shortcuts for Super Admin Governance
  useEffect(() => {
    if (!isSuperAdmin) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeleteUser) {
          e.preventDefault();
          setConfirmDeleteUser(null);
          return;
        }
        if (createOpen) {
          e.preventDefault();
          setCreateOpen(false);
          return;
        }
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping) return;
      if (document.querySelector('.fixed.inset-0.z-50')) return;

      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        setCreateOpen((prev) => !prev);
      } else if (e.key === 'ArrowDown' && filteredAccounts.length > 0) {
        e.preventDefault();
        const currIdx = filteredAccounts.findIndex((a) => a.id === selectedAccount?.id);
        const nextIdx = currIdx === -1 ? 0 : (currIdx + 1) % filteredAccounts.length;
        setSelectedUserId(filteredAccounts[nextIdx].id);
      } else if (e.key === 'ArrowUp' && filteredAccounts.length > 0) {
        e.preventDefault();
        const currIdx = filteredAccounts.findIndex((a) => a.id === selectedAccount?.id);
        const prevIdx =
          currIdx === -1
            ? 0
            : (currIdx - 1 + filteredAccounts.length) % filteredAccounts.length;
        setSelectedUserId(filteredAccounts[prevIdx].id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAccount) {
        e.preventDefault();
        setConfirmDeleteUser(selectedAccount);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSuperAdmin, confirmDeleteUser, createOpen, filteredAccounts, selectedAccount]);

  if (!isSuperAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <AnimatedSectionPanel className="bg-neutral-900 border border-rose-500/30 rounded-2xl p-8 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Super Admin Governance Restricted</h2>
          <p className="text-sm text-neutral-400 max-w-lg mx-auto">
            Only a signed-in <span className="text-rose-300 font-semibold">Super Admin</span>{' '}
            account can assign roles, unlock restricted features, and grant or revoke permissions
            across Admin, Owner, Manager, Finance, Trainer, and Front-Desk accounts.
          </p>
        </AnimatedSectionPanel>
      </div>
    );
  }

  const totalPossibleGrants = governedAccounts.length * TOTAL_PERMISSIONS_COUNT;
  const totalActiveGrants = governedAccounts.reduce((sum, account) => {
    const perms = getEffectivePermissions(account);
    return sum + Object.values(perms).filter(Boolean).length;
  }, 0);

  const handleTogglePermission = (user: User, key: keyof AdminPermissions) => {
    const current = getEffectivePermissions(user);
    const nextValue = !current[key];
    const res = dbService.updateUserPermissions(user.id, { [key]: nextValue });
    if (res.success) {
      setFeedback({
        type: 'success',
        msg: `${nextValue ? 'Allowed' : 'Restricted'} permission for @${user.username}.`,
      });
    } else {
      setFeedback({ type: 'error', msg: res.error || 'Unable to update permission.' });
    }
  };

  const handleApplyPreset = (user: User, permissions: AdminPermissions, label: string) => {
    const res = dbService.updateUserPermissions(user.id, permissions);
    if (res.success) {
      setFeedback({
        type: 'success',
        msg: `Applied "${label}" template to @${user.username}.`,
      });
    } else {
      setFeedback({ type: 'error', msg: res.error || 'Failed to apply preset.' });
    }
  };

  const handleRoleChange = (user: User, nextRole: UserRole) => {
    if (user.role === nextRole) return;
    const res = dbService.updateUserRole(user.id, nextRole, true);
    if (res.success) {
      setFeedback({
        type: 'success',
        msg: `Reassigned @${user.username} to ${getRoleLabel(nextRole)} with role baseline permissions.`,
      });
    } else {
      setFeedback({ type: 'error', msg: res.error || 'Failed to reassign user role.' });
    }
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = dbService.createUserAccount({
      username: newUsername,
      fullName: newFullName,
      passwordPlain: newPassword,
      role: newRole,
    });
    if (res.success && res.user) {
      setFeedback({
        type: 'success',
        msg: `Created ${getRoleLabel(res.user.role)} account @${res.user.username}. Configure its 16 permissions below.`,
      });
      setRoleFilter('all');
      setSelectedUserId(res.user.id);
      setNewUsername('');
      setNewFullName('');
      setNewPassword('');
      setCreateOpen(false);
    } else {
      setFeedback({ type: 'error', msg: res.error || 'Could not create account.' });
    }
  };

  const handleDeleteGovernedAccount = (user: User) => {
    const res = dbService.deleteUserAccount(user.id);
    if (!res.success) {
      setFeedback({ type: 'error', msg: res.error || 'Failed to delete account.' });
    } else {
      const remaining = governedAccounts.filter((a) => a.id !== user.id);
      if (selectedUserId === user.id) {
        setSelectedUserId(remaining[0]?.id || '');
      }
      setFeedback({
        type: 'success',
        msg: `Deleted ${getRoleLabel(user.role)} account @${user.username} from local database.`,
      });
    }
    setConfirmDeleteUser(null);
  };

  const getRoleBadgeStyle = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'admin':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'manager':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'accountant':
        return 'bg-teal-500/15 text-teal-300 border-teal-500/30';
      case 'receptionist':
        return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
      case 'staff':
      default:
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Tier 1: Governance Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-rose-400 uppercase tracking-wider mb-1">
            <Crown className="w-3.5 h-3.5" />
            <span>Super Admin Exclusive Role & Permission Authority</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Roles & Granular Permission Governance
          </h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Assign user roles and explicitly unlock or restrict {TOTAL_PERMISSIONS_COUNT} features
            across Admins, Owners, Managers, Finance, Trainers, and Front-Desk seats.
          </p>
        </div>

        <button
          onClick={() => setCreateOpen((prev) => !prev)}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 transition-all shadow-lg shadow-amber-500/10 flex items-center gap-2 self-start md:self-auto"
          title="Shortcut: C"
        >
          <UserPlus className="w-4 h-4" />
          <span>{createOpen ? 'Close Provision Form' : 'Provision Role Account'}</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-neutral-950/20 text-neutral-950 rounded">
            C
          </kbd>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <AnimatedSectionPanel
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white p-1"
            aria-label="Dismiss message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </AnimatedSectionPanel>
      )}

      {/* Provision New Governed Account Panel */}
      {createOpen && (
        <AnimatedSectionPanel className="bg-neutral-900 border border-amber-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Provision New Role Account</h3>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">
              {newRole === 'staff' || newRole === 'receptionist'
                ? 'Minimum 8-character passphrase'
                : 'Minimum 10-character passphrase'}
            </span>
          </div>

          <form onSubmit={handleCreateAccount} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Assigned Role
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {GOVERNED_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g., south_manager"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="e.g., Rahul Nair"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Passphrase
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8–10 chars"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 shrink-0 transition-colors"
                >
                  Create
                </button>
              </div>
            </div>
          </form>
        </AnimatedSectionPanel>
      )}

      {/* Tier 1 KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnimatedCard
          index={0}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Governed Role Accounts
            </p>
            <p className="text-2xl font-bold text-white mt-1 tabular-nums">
              {governedAccounts.length}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Across 6 non-root role tiers under policy
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
            <Shield className="w-5 h-5" />
          </div>
        </AnimatedCard>

        <AnimatedCard
          index={1}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Active Feature Grants
            </p>
            <p className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
              {totalActiveGrants}{' '}
              <span className="text-sm font-normal text-neutral-500">/ {totalPossibleGrants}</span>
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Across 5 relationship permission domains
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
        </AnimatedCard>

        <AnimatedCard
          index={2}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Protected Root Authority
            </p>
            <p className="text-2xl font-bold text-rose-400 mt-1 tabular-nums">
              {superAdmins.length} Super Admin
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Unrestricted {TOTAL_PERMISSIONS_COUNT}/{TOTAL_PERMISSIONS_COUNT} root · @{currentUser?.username}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
            <Crown className="w-5 h-5" />
          </div>
        </AnimatedCard>
      </div>

      {/* Tier 2: Master-Detail Relationship Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: All Governed Accounts Directory */}
        <AnimatedSectionPanel className="lg:col-span-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Governed Accounts Directory</h3>
                <p className="text-[11px] text-neutral-400">
                  Select any seat to assign role & permissions
                </p>
              </div>
              <span className="text-[11px] font-mono text-neutral-500">
                {filteredAccounts.length}/{governedAccounts.length}
              </span>
            </div>

            {/* Role Filter Tabs */}
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'admin_owner', label: 'Admins & Owners' },
                  { id: 'manager_finance', label: 'Mgrs & Finance' },
                  { id: 'staff_desk', label: 'Staff & Desk' },
                ] as { id: RoleFilterGroup; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRoleFilter(tab.id)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    roleFilter === tab.id
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-500/40'
                      : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 space-y-2.5 max-h-[680px] overflow-y-auto">
            {filteredAccounts.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">
                No accounts in this filter group.
              </div>
            ) : (
              filteredAccounts.map((account, idx) => {
                const perms = getEffectivePermissions(account);
                const grantedCount = Object.values(perms).filter(Boolean).length;
                const isSelected = selectedAccount?.id === account.id;
                const pct = Math.round((grantedCount / TOTAL_PERMISSIONS_COUNT) * 100);

                return (
                  <AnimatedCard
                    key={account.id}
                    index={idx}
                    onClick={() => setSelectedUserId(account.id)}
                    className={`cursor-pointer rounded-xl p-3.5 border ${
                      isSelected
                        ? 'bg-neutral-800/90 border-amber-500/60 shadow-lg shadow-amber-500/5'
                        : 'bg-neutral-950/70 border-neutral-800 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {account.fullName}
                        </p>
                        <p className="text-xs font-mono text-neutral-400 truncate">
                          @{account.username}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${getRoleBadgeStyle(
                            account.role
                          )}`}
                        >
                          {getRoleLabel(account.role)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteUser(account);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-rose-950/70 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-700/70 hover:border-rose-500 transition-colors"
                          title={`Delete @${account.username}`}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-400">Allowed Features</span>
                        <span className="font-mono font-semibold text-neutral-200 tabular-nums">
                          {grantedCount} / {TOTAL_PERMISSIONS_COUNT}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            grantedCount >= 12
                              ? 'bg-emerald-400'
                              : grantedCount >= 6
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </AnimatedCard>
                );
              })
            )}

            {/* Inherent Super Admin Reference Box */}
            <div className="mt-3 pt-3 border-t border-neutral-800/80">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 px-1 mb-2">
                Root Authority (Always Unrestricted)
              </p>
              {superAdmins.map((sa) => (
                <div
                  key={sa.id}
                  className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Crown className="w-4 h-4 text-rose-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{sa.fullName}</p>
                      <p className="text-[11px] font-mono text-rose-300/80">@{sa.username}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/25 shrink-0">
                    {TOTAL_PERMISSIONS_COUNT} / {TOTAL_PERMISSIONS_COUNT} Root
                  </span>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSectionPanel>

        {/* Right Column: Selected Account Role & Permission Controls */}
        <div className="lg:col-span-8 space-y-5">
          {selectedAccount && selectedPermissions ? (
            <>
              {/* Account Header + Role Reassignment + Quick Templates */}
              <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-white">
                          {selectedAccount.fullName}
                        </h3>
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${getRoleBadgeStyle(
                            selectedAccount.role
                          )}`}
                        >
                          {getRoleLabel(selectedAccount.role)}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-neutral-400">
                        @{selectedAccount.username} ·{' '}
                        {selectedAccount.recoveryEmail || 'No recovery email'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() =>
                        handleApplyPreset(
                          selectedAccount,
                          FULL_ADMIN_PERMISSIONS,
                          'Full Access (All 16)'
                        )
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors"
                    >
                      Allow All ({TOTAL_PERMISSIONS_COUNT})
                    </button>
                    <button
                      onClick={() =>
                        handleApplyPreset(selectedAccount, ZERO_PERMISSIONS, 'Zero Permissions')
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
                    >
                      Restrict All
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteUser(selectedAccount)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/70 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-700/70 hover:border-rose-500 transition-colors"
                      title="Delete Account (Shortcut: Del)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Account</span>
                      <kbd className="px-1 py-0.5 text-[9px] font-mono bg-black/30 rounded">
                        Del
                      </kbd>
                    </button>
                  </div>
                </div>

                {/* Role Reassignment Box */}
                <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <UserCog className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-white">
                        Role Assignment (Super Admin Only)
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        Changing a role automatically applies that role's baseline permission template.
                      </p>
                    </div>
                  </div>
                  <select
                    value={selectedAccount.role}
                    onChange={(e) => handleRoleChange(selectedAccount, e.target.value as UserRole)}
                    className="px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-xs font-semibold text-white focus:outline-none focus:border-amber-400 shrink-0"
                  >
                    {GOVERNED_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preset Role Templates */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                    Quick Permission Profiles
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                    {PERMISSION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() =>
                          handleApplyPreset(selectedAccount, preset.permissions, preset.label)
                        }
                        className="p-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-amber-500/40 text-left transition-all"
                      >
                        <p className="text-xs font-semibold text-white">{preset.label}</p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">{preset.subtitle}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </AnimatedSectionPanel>

              {/* 5 Domain Groups */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PERMISSION_DOMAIN_GROUPS.map((group, groupIdx) => {
                  const DomainIcon = group.icon;
                  const domainGranted = group.items.filter(
                    (item) => selectedPermissions[item.key]
                  ).length;

                  return (
                    <AnimatedCard
                      key={group.id}
                      index={groupIdx}
                      className={`bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between space-y-4 ${
                        groupIdx === PERMISSION_DOMAIN_GROUPS.length - 1 &&
                        PERMISSION_DOMAIN_GROUPS.length % 2 === 1
                          ? 'md:col-span-2'
                          : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 pb-3 border-b border-neutral-800/80">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${group.accentClass}`}
                            >
                              <DomainIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white">{group.title}</h4>
                              <p className="text-[11px] text-neutral-400">{group.subtitle}</p>
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-neutral-300 bg-neutral-950 border border-neutral-800 px-2 py-0.5 rounded shrink-0 tabular-nums">
                            {domainGranted}/{group.items.length}
                          </span>
                        </div>

                        <div className="mt-3 space-y-3">
                          {group.items.map((perm) => {
                            const isEnabled = selectedPermissions[perm.key];
                            return (
                              <div
                                key={perm.key}
                                className={`p-3 rounded-lg border transition-colors ${
                                  isEnabled
                                    ? 'bg-neutral-950/90 border-neutral-800'
                                    : 'bg-neutral-950/40 border-neutral-800/50 opacity-85'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-xs font-semibold text-white">
                                        {perm.label}
                                      </p>
                                      {perm.riskLevel === 'critical' && (
                                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25">
                                          High Risk
                                        </span>
                                      )}
                                      {perm.riskLevel === 'elevated' && (
                                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                          Elevated
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                                      {perm.description}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isEnabled}
                                    onClick={() => handleTogglePermission(selectedAccount, perm.key)}
                                    className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                                      isEnabled
                                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                                        : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white hover:border-neutral-600'
                                    }`}
                                  >
                                    {isEnabled ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Allowed</span>
                                      </>
                                    ) : (
                                      <>
                                        <X className="w-3.5 h-3.5" />
                                        <span>Restricted</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </AnimatedCard>
                  );
                })}
              </div>
            </>
          ) : (
            <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-10 text-center">
              <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">No Governed Account Selected</p>
              <p className="text-xs text-neutral-400 mt-1">
                Create or select a role account from the directory to configure permissions.
              </p>
            </AnimatedSectionPanel>
          )}
        </div>
      </div>

      {/* Tier 3: Cross-Role Permission Matrix Table */}
      <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">
              Cross-Role Capability Matrix ({TOTAL_PERMISSIONS_COUNT} Permissions)
            </h3>
            <p className="text-xs text-neutral-400">
              Live overview of every Super Admin–gated capability across all role accounts. Click
              any cell to allow or restrict immediately.
            </p>
          </div>
          <span className="text-[11px] font-mono text-neutral-400">
            Super Admin enforces live policy
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-950/60 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <th className="py-3 px-4">Permission Scope</th>
                <th className="py-3 px-3">Domain</th>
                {governedAccounts.map((acc) => (
                  <th key={acc.id} className="py-3 px-3 text-center min-w-[110px]">
                    <div className="text-white normal-case text-xs font-bold truncate max-w-[130px] mx-auto">
                      {acc.username}
                    </div>
                    <div className="text-[10px] font-mono text-neutral-500 normal-case">
                      {getRoleLabel(acc.role)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/70 text-xs">
              {PERMISSION_DOMAIN_GROUPS.flatMap((group) =>
                group.items.map((perm) => (
                  <tr key={perm.key} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-medium text-neutral-200">{perm.label}</td>
                    <td className="py-2.5 px-3 text-[11px] text-neutral-400 whitespace-nowrap">
                      {group.title}
                    </td>
                    {governedAccounts.map((acc) => {
                      const perms = getEffectivePermissions(acc);
                      const enabled = perms[perm.key];
                      return (
                        <td key={acc.id} className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleTogglePermission(acc, perm.key)}
                            className={`inline-flex items-center justify-center w-8 h-7 rounded-md border transition-all ${
                              enabled
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                                : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'
                            }`}
                            title={`Toggle ${perm.label} for @${acc.username}`}
                          >
                            {enabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AnimatedSectionPanel>

      {/* Delete Governed Account Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmDeleteUser(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-neutral-900 border border-rose-500/35 rounded-xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5 text-rose-400">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Delete Governed Account</h3>
                    <span className="text-[11px] font-mono text-rose-300/80">
                      Super Admin Role Directory Action
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUser(null)}
                  className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white truncate">
                    {confirmDeleteUser.fullName}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border shrink-0 ${getRoleBadgeStyle(
                      confirmDeleteUser.role
                    )}`}
                  >
                    {getRoleLabel(confirmDeleteUser.role)}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400 flex items-center justify-between">
                  <span>@{confirmDeleteUser.username}</span>
                  <span>
                    {
                      Object.values(getEffectivePermissions(confirmDeleteUser)).filter(Boolean)
                        .length
                    }{' '}
                    / {TOTAL_PERMISSIONS_COUNT} permissions
                  </span>
                </div>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                Are you sure you want to permanently remove{' '}
                <strong className="text-white">@{confirmDeleteUser.username}</strong> from the
                local gym database? This account will immediately lose workspace access.
              </p>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800 text-xs">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUser(null)}
                  className="px-4 py-2 bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteGovernedAccount(confirmDeleteUser)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg transition-colors shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Account</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
