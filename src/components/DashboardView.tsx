import React, { useMemo } from 'react';
import { GymDatabase, User, Member, MemberMembership, ReminderLogEntry } from '../types/gym';
import { formatINR, formatKolkataDate, formatKolkataDateTime } from '../services/crypto';
import {
  dbService,
  getEffectivePermissions,
  getRoleLabel,
  hasPermission,
  isSuperAdminRole,
} from '../services/db';
import { compute12MonthAnalytics } from '../services/analytics';
import { AnimatedCard, AnimatedSectionPanel } from './MotionPrimitives';
import {
  Users,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  MessageSquare,
  Undo2,
  Clock,
  TrendingUp,
  Layers,
  History,
  HardDriveDownload,
  Radio,
  Settings,
  SlidersHorizontal,
  Crown,
} from 'lucide-react';
import { DesktopTab } from './Navigation';

interface DashboardViewProps {
  db: GymDatabase;
  currentUser: User | null;
  onNavigate: (tab: DesktopTab) => void;
  onOpenAddMember: () => void;
  onOpenRecordPayment: (memberId?: string) => void;
  onOpenQuickCheckIn: () => void;
  onOpenReminderModal: (
    member: Member,
    balance: number,
    dueDate?: string,
    tier?: ReminderLogEntry['tier']
  ) => void;
  onOpenUndoModal: (logId: string) => void;
  onSelectMember: (member: Member) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  db,
  currentUser,
  onNavigate,
  onOpenAddMember,
  onOpenRecordPayment,
  onOpenReminderModal,
  onOpenUndoModal,
  onSelectMember,
}) => {
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);
  const canViewAnalytics = hasPermission(currentUser, 'canViewAnalytics');
  const canRecordPayments = hasPermission(currentUser, 'canRecordPayments');
  const canManageMembers = hasPermission(currentUser, 'canManageMembers');
  const canViewMemberContactDetails = hasPermission(currentUser, 'canViewMemberContactDetails');
  const canSendPaymentReminders = hasPermission(currentUser, 'canSendPaymentReminders');
  const canViewAllActivity = hasPermission(currentUser, 'canViewAllActivity');
  const canUndoActions = hasPermission(currentUser, 'canUndoActions');
  const canManageBackups = hasPermission(currentUser, 'canManageBackups');
  const canManageTailscale = hasPermission(currentUser, 'canManageTailscale');

  // Metrics calculation
  const activeMembers = db.members.filter((m) => m.status === 'active');
  const frozenOrExpiredCount = db.members.filter(
    (m) => m.status === 'frozen' || m.status === 'expired'
  ).length;
  const expiringMembers = db.members.filter(
    (m) => m.status === 'pending_renewal' || m.status === 'expired'
  );

  // Monthly revenue in INR (valid payments from this current month)
  const currentMonthPrefix = new Date().toISOString().slice(0, 7);
  const validPayments = db.payments.filter((p) => !p.isVoided);
  const monthlyRevenueInr = validPayments
    .filter((p) => p.paymentDate.startsWith(currentMonthPrefix))
    .reduce((sum, p) => sum + p.amountInr, 0);
  const totalCollectedAllTimeInr = validPayments.reduce((sum, p) => sum + p.amountInr, 0);
  const voidedPaymentsCount = db.payments.filter((p) => p.isVoided).length;

  // Plan & Enrollment metrics
  const activeEnrollmentsCount = db.memberships.filter((m) => m.status === 'active').length;
  const minPlanPrice = db.plans.length
    ? Math.min(...db.plans.map((p) => p.priceInr))
    : 0;
  const maxPlanPrice = db.plans.length
    ? Math.max(...db.plans.map((p) => p.priceInr))
    : 0;

  // Analytics summary
  const analytics = useMemo(() => compute12MonthAnalytics(db), [db]);

  // Calculate total outstanding balances across all members
  let totalOutstandingDuesInr = 0;
  const membersWithDues: { member: Member; balance: number; membership?: MemberMembership }[] = [];

  db.members.forEach((member) => {
    const summary = dbService.getMemberFinancialSummary(member.id);
    if (summary.outstandingBalanceInr > 0) {
      totalOutstandingDuesInr += summary.outstandingBalanceInr;
      membersWithDues.push({
        member,
        balance: summary.outstandingBalanceInr,
        membership: summary.activeMembership,
      });
    }
  });

  // Activity metrics
  const scopedLogs = canViewAllActivity
    ? db.activityLogs
    : db.activityLogs.filter((l) => l.userId === currentUser?.id);
  const visibleLogs = scopedLogs.slice(0, 6);
  const undoableCount = scopedLogs.filter((l) => dbService.canUndoAction(l.id).canUndo).length;

  // Super admin permission summary across all non-super-admin accounts
  const governedAdmins = db.users.filter((u) => u.role !== 'super_admin');
  const totalAdminGrants = governedAdmins.reduce(
    (sum, acc) => sum + Object.values(getEffectivePermissions(acc)).filter(Boolean).length,
    0
  );

  // Smart Renewal & Payment Reminder Queue
  const smartReminders = dbService.getSmartReminders();

  // Upgrade modules summary
  const enabledUpgradesCount = db.upgradeModules
    ? Object.values(db.upgradeModules).filter(Boolean).length
    : 0;

  // Section overview cards (each navigates to its respective section)
  const sectionCards: {
    id: DesktopTab;
    title: string;
    category: string;
    primaryMetric: string;
    secondaryMetric: string;
    footerText: string;
    icon: React.ComponentType<{ className?: string }>;
    iconAccentClass: string;
    highlightRose?: boolean;
  }[] = [
    {
      id: 'members',
      title: 'Members Directory',
      category: 'Gym Operations',
      primaryMetric: `${db.members.length} Members`,
      secondaryMetric: `${activeMembers.length} active · ${frozenOrExpiredCount} inactive`,
      footerText: 'Profiles, health notes, renewals & balances',
      icon: Users,
      iconAccentClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    },
    {
      id: 'memberships',
      title: 'Memberships & Plans',
      category: 'Gym Operations',
      primaryMetric: `${db.plans.length} Plans`,
      secondaryMetric: `${activeEnrollmentsCount} active enrollments`,
      footerText:
        db.plans.length > 0
          ? `Tariffs ${formatINR(minPlanPrice)} – ${formatINR(maxPlanPrice)}`
          : 'Create or manage membership tiers',
      icon: Layers,
      iconAccentClass: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    },
    {
      id: 'payments',
      title: 'Payments Ledger',
      category: 'Finance',
      primaryMetric: formatINR(totalCollectedAllTimeInr),
      secondaryMetric: `${validPayments.length} receipts · ${voidedPaymentsCount} voided`,
      footerText: 'UPI, Cash, Bank Transfer, POS & receipts',
      icon: CreditCard,
      iconAccentClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    },
    ...(canViewAnalytics
      ? [
          {
            id: 'analytics' as DesktopTab,
            title: '12M Analytics',
            category: 'Intelligence',
            primaryMetric: formatINR(analytics.total12MonthRevenueInr),
            secondaryMetric: `${analytics.currentRetentionRatePercent}% retention · ${analytics.avgChurnRatePercent}% churn`,
            footerText: 'Revenue trends, signups & LTV breakdown',
            icon: TrendingUp,
            iconAccentClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
          },
        ]
      : []),
    {
      id: 'activity',
      title: 'Activity & Undo Log',
      category: 'Audit Trail',
      primaryMetric: `${scopedLogs.length} Events`,
      secondaryMetric: `${undoableCount} reversible actions ready`,
      footerText: canViewAllActivity
        ? 'Full gym audit log & safe reversals'
        : 'Personal activity & reversible entries',
      icon: History,
      iconAccentClass: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    },
    ...(canManageBackups
      ? [
          {
            id: 'backups' as DesktopTab,
            title: 'Backups & Recovery',
            category: 'Disaster Recovery',
            primaryMetric: db.backupConfig.autoBackupEnabled ? 'AES-256 Active' : 'Manual Only',
            secondaryMetric: db.backupConfig.lastBackupTimestamp
              ? `Last: ${formatKolkataDateTime(db.backupConfig.lastBackupTimestamp).split(',')[0]}`
              : 'No backup yet',
            footerText: db.backupConfig.recipientEmail
              ? `Target: ${db.backupConfig.recipientEmail}`
              : 'Configure SMTP destination & encryption key',
            icon: HardDriveDownload,
            iconAccentClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
          },
        ]
      : []),
    ...(canManageTailscale
      ? [
          {
            id: 'tailscale' as DesktopTab,
            title: 'Tailscale & Mobile Hub',
            category: 'Private Network',
            primaryMetric: db.tailscale.isServing ? 'Serving Port 3000' : 'Tunnel Paused',
            secondaryMetric: `${db.tailscale.activeSessions.length} active mobile device${
              db.tailscale.activeSessions.length === 1 ? '' : 's'
            }`,
            footerText: `${db.tailscale.tailnetDomain} (${db.tailscale.tailnetIp})`,
            icon: Radio,
            iconAccentClass: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
          },
        ]
      : []),
    {
      id: 'settings',
      title: 'Account & Security',
      category: 'Access & Upgrades',
      primaryMetric: `${db.users.length} Local Accounts`,
      secondaryMetric: `Signed in: ${getRoleLabel(currentUser?.role)}`,
      footerText: `${
        currentUser?.emailVerified ? 'Email verified' : 'Verify email'
      } · ${enabledUpgradesCount}/4 upgrade modules active`,
      icon: Settings,
      iconAccentClass: 'text-neutral-300 bg-neutral-800 border-neutral-700',
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'super_admin_permissions' as DesktopTab,
            title: 'Admin Permissions',
            category: 'Super Admin Only',
            primaryMetric: `${governedAdmins.length} Role Seats`,
            secondaryMetric: `${totalAdminGrants} / ${governedAdmins.length * 16} permissions active`,
            footerText: 'Assign roles & grant granular feature access',
            icon: SlidersHorizontal,
            iconAccentClass: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
            highlightRose: true,
          },
        ]
      : []),
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Welcome Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Gym Management Console
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Local SQLite instance · Single gym source-of-truth · Asia/Kolkata timezone
          </p>
        </div>

        {/* Quick Actions Strip */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canViewAnalytics && (
            <button
              onClick={() => onNavigate('analytics')}
              title="Shortcut: 5"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 rounded-lg transition-all hover:-translate-y-0.5"
            >
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>12M Analytics</span>
              <kbd className="ml-0.5 px-1 py-0.2 text-[9px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/70 rounded">
                5
              </kbd>
            </button>
          )}
          {canRecordPayments && (
            <button
              onClick={() => onOpenRecordPayment()}
              title="Shortcut: P"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-all hover:-translate-y-0.5"
            >
              <CreditCard className="w-4 h-4 text-sky-400" />
              <span>Record Payment</span>
              <kbd className="ml-0.5 px-1 py-0.2 text-[9px] font-mono bg-neutral-900 text-neutral-400 border border-neutral-700 rounded">
                P
              </kbd>
            </button>
          )}
          {canManageMembers && (
            <button
              onClick={onOpenAddMember}
              title="Shortcut: N"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-all hover:-translate-y-0.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Member</span>
              <kbd className="ml-0.5 px-1 py-0.2 text-[9px] font-mono bg-neutral-950/20 text-neutral-950 rounded">
                N
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AnimatedCard
          index={0}
          onClick={() => onNavigate('members')}
          className="group p-4 bg-neutral-900 border border-neutral-800 rounded-xl cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Active Lifters</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono tabular-nums">
              {activeMembers.length}
            </span>
            <span className="text-[11px] text-neutral-400 font-mono">
              of {db.members.length} enrolled
            </span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-400 flex items-center justify-between">
            <span>{expiringMembers.length} pending renewal / expired</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
          </div>
        </AnimatedCard>

        <AnimatedCard
          index={1}
          onClick={() => onNavigate('payments')}
          className="group p-4 bg-neutral-900 border border-neutral-800 rounded-xl cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Month Collections (INR)</span>
            <CreditCard className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono tabular-nums">
              {formatINR(monthlyRevenueInr)}
            </span>
            <span className="text-[11px] text-neutral-400 font-mono">External ledger</span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-400 flex items-center justify-between">
            <span>UPI, Cash, Bank Transfer, POS records</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
          </div>
        </AnimatedCard>

        <AnimatedCard
          index={2}
          onClick={() => onNavigate('members')}
          className="group p-4 bg-neutral-900 border border-neutral-800 rounded-xl cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Outstanding Balances</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
              {formatINR(totalOutstandingDuesInr)}
            </span>
            <span className="text-[11px] text-rose-400/80 font-mono">
              {membersWithDues.length} pending
            </span>
          </div>
          <div className="mt-1 text-[11px] text-neutral-400 flex items-center justify-between">
            <span>Instant 1-click WhatsApp reminder</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
          </div>
        </AnimatedCard>
      </div>

      {/* Section Overview Cards (Quick Jump Grid from Every Section) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Workspace Sections Overview</h3>
            <p className="text-[11px] text-neutral-400">
              Live snapshot from each module — click any card to jump directly to its section
            </p>
          </div>
          <span className="text-[11px] font-mono text-neutral-500">
            {sectionCards.length} active modules
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectionCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <AnimatedCard
                key={card.id}
                index={idx}
                onClick={() => onNavigate(card.id)}
                className={`group p-4 rounded-xl border cursor-pointer flex flex-col justify-between gap-3 ${
                  card.highlightRose
                    ? 'bg-neutral-900 border-rose-500/35 hover:border-rose-400/70'
                    : 'bg-neutral-900 border-neutral-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${card.iconAccentClass}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider block ${
                          card.highlightRose ? 'text-rose-400 flex items-center gap-1' : 'text-neutral-500'
                        }`}
                      >
                        {card.highlightRose && <Crown className="w-3 h-3 inline" />}
                        <span>{card.category}</span>
                      </span>
                      <h4 className="text-sm font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                        {card.title}
                      </h4>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-neutral-500 group-hover:text-amber-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                </div>

                <div>
                  <div className="text-lg font-bold text-white font-mono tabular-nums">
                    {card.primaryMetric}
                  </div>
                  <div className="text-xs text-neutral-300 mt-0.5">{card.secondaryMetric}</div>
                </div>

                <div className="pt-2 border-t border-neutral-800/80 text-[11px] text-neutral-400 truncate">
                  {card.footerText}
                </div>
              </AnimatedCard>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Smart Reminders + Overdue Dues (Left 7 cols) + Recent Activity & System Card (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Smart Renewal Reminders & Outstanding Balances */}
        <div className="lg:col-span-7 space-y-5">
          {/* Smart Membership Renewal Reminders */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  Smart Membership Renewal Reminders
                </h3>
              </div>
              <span className="text-xs font-mono text-emerald-400">
                {smartReminders.length} queued
              </span>
            </div>

            <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-800">
              {smartReminders.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-400">
                  No memberships expiring within 7 days, overdue, or carrying dues.
                </div>
              ) : (
                smartReminders.slice(0, 6).map((cand) => {
                  const tierBadge =
                    cand.tier === 'overdue'
                      ? {
                          label: cand.daysRemaining !== undefined ? `${Math.abs(cand.daysRemaining)}d OVERDUE` : 'OVERDUE',
                          cls: 'bg-rose-950/70 text-rose-300 border-rose-800/70',
                        }
                      : cand.tier === 'due_today'
                      ? {
                          label: 'DUE TODAY',
                          cls: 'bg-amber-950/70 text-amber-300 border-amber-800/70',
                        }
                      : cand.tier === 'expiring_soon'
                      ? {
                          label: `EXPIRES IN ${cand.daysRemaining}d`,
                          cls: 'bg-sky-950/70 text-sky-300 border-sky-800/70',
                        }
                      : {
                          label: 'BALANCE DUE',
                          cls: 'bg-purple-950/70 text-purple-300 border-purple-800/70',
                        };

                  return (
                    <div
                      key={cand.member.id}
                      className="p-3.5 flex items-center justify-between hover:bg-neutral-800/40 transition-colors gap-3"
                    >
                      <div
                        onClick={() => onSelectMember(cand.member)}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-200 text-xs hover:text-amber-400 transition-colors">
                            {cand.member.fullName}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border uppercase ${tierBadge.cls}`}
                          >
                            {tierBadge.label}
                          </span>
                          {cand.lastRemindedAt && (
                            <span className="text-[10px] font-mono text-neutral-500">
                              Reminded {formatKolkataDate(cand.lastRemindedAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1">
                          <span>{cand.membership?.planName || 'Membership'}</span>
                          {cand.dueDate && (
                            <>
                              <span>·</span>
                              <span>Due: {formatKolkataDate(cand.dueDate)}</span>
                            </>
                          )}
                          {cand.balanceInr > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-rose-400 font-mono font-semibold">
                                {formatINR(cand.balanceInr)} due
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canSendPaymentReminders && (
                          <button
                            onClick={() =>
                              onOpenReminderModal(cand.member, cand.balanceInr, cand.dueDate, cand.tier)
                            }
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-md transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Remind</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </AnimatedSectionPanel>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">
                Pending Renewals & Outstanding Balances
              </h3>
            </div>
            <span className="text-xs font-mono text-neutral-400">
              {membersWithDues.length} members
            </span>
          </div>

          <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-800">
            {membersWithDues.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                All member accounts are fully settled. No outstanding dues!
              </div>
            ) : (
              membersWithDues.map(({ member, balance, membership }) => (
                <div
                  key={member.id}
                  className="p-3.5 flex items-center justify-between hover:bg-neutral-800/40 transition-colors gap-3"
                >
                  <div
                    onClick={() => onSelectMember(member)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-200 text-xs hover:text-amber-400 transition-colors">
                        {member.fullName}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500">
                        {member.memberNumber}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded uppercase ${
                          member.status === 'active'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                            : member.status === 'pending_renewal'
                            ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                            : 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                        }`}
                      >
                        {member.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1">
                      <span>{canViewMemberContactDetails ? member.phone : 'Phone restricted'}</span>
                      <span>·</span>
                      <span className="truncate">{membership?.planName || 'General Membership'}</span>
                      {membership?.endDate && (
                        <>
                          <span>·</span>
                          <span>Due: {formatKolkataDate(membership.endDate)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions for member with dues */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-rose-400 font-mono tabular-nums">
                      {formatINR(balance)}
                    </span>
                    {canSendPaymentReminders && (
                      <button
                        onClick={() => onOpenReminderModal(member, balance, membership?.endDate)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-md transition-colors"
                        title="Prepare WhatsApp/SMS reminder"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Remind</span>
                      </button>
                    )}
                    {canRecordPayments && (
                      <button
                        onClick={() => onOpenRecordPayment(member.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors"
                        title="Record external payment"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-sky-400" />
                        <span>Settle</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </AnimatedSectionPanel>
        </div>

        {/* Right Column: Activity Log & Reversible Audit Trail */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-400" />
              <span>Activity & Undo Log</span>
            </h3>
            <button
              onClick={() => onNavigate('activity')}
              className="text-xs text-amber-400 hover:underline flex items-center gap-0.5"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <AnimatedSectionPanel
            delay={0.05}
            className="bg-neutral-900 border border-neutral-800 rounded-xl divide-y divide-neutral-800"
          >
            {visibleLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400">No recent activity.</div>
            ) : (
              visibleLogs.map((log) => {
                const checkUndo = dbService.canUndoAction(log.id);
                return (
                  <div
                    key={log.id}
                    className="p-3 space-y-1.5 text-xs hover:bg-neutral-800/35 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-neutral-300">{log.username}</span>
                        <span className="text-[10px] uppercase font-mono px-1 py-0.2 bg-neutral-800 text-neutral-400 rounded">
                          {log.role}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-500">
                        {formatKolkataDateTime(log.timestamp).split(',')[1]}
                      </span>
                    </div>

                    <p className="text-neutral-300 text-xs leading-snug">{log.description}</p>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      {log.reversalOfLogId ? (
                        <span className="text-purple-400 font-mono text-[10px]">
                          Linked Reversal Entry
                        </span>
                      ) : log.isReversed ? (
                        <span className="text-rose-400 font-mono text-[10px]">
                          Already Reversed
                        </span>
                      ) : (
                        <span className="text-neutral-500 font-mono text-[10px]">
                          {log.targetType}
                        </span>
                      )}

                      {canUndoActions && checkUndo.canUndo && (
                        <button
                          onClick={() => onOpenUndoModal(log.id)}
                          className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium px-2 py-0.5 rounded bg-amber-950/30 hover:bg-amber-950/60 border border-amber-800/40 transition-colors"
                          title="Undo this action safely"
                        >
                          <Undo2 className="w-3 h-3" />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </AnimatedSectionPanel>

          {/* Windows Desktop & Tailscale System Status Card */}
          <AnimatedCard
            index={sectionCards.length + 3}
            onClick={() => onNavigate(canManageTailscale ? 'tailscale' : 'settings')}
            className="group p-4 bg-neutral-950/60 border border-neutral-800 rounded-xl space-y-2 text-xs cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 font-semibold block uppercase font-mono text-[11px]">
                Offline-First Architecture
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-400 transition-colors" />
            </div>
            <p className="text-neutral-300 text-[11px] leading-relaxed">
              Flex & Flow writes directly to local SQLite (`%APPDATA%\Flex & Flow\gym.sqlite`). It functions completely without internet. Mobile staff connect over your private Tailscale network.
            </p>
            <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-neutral-400 border-t border-neutral-800/80">
              <span>Tailscale: {db.tailscale.tailnetIp}:{db.tailscale.port}</span>
              <span className={db.tailscale.isServing ? 'text-emerald-400' : 'text-neutral-500'}>
                {db.tailscale.isServing ? 'Serving Encrypted' : 'Tunnel Offline'}
              </span>
            </div>
          </AnimatedCard>
        </div>
      </div>
    </div>
  );
};
