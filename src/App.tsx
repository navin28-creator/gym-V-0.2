/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MotionConfig, AnimatePresence } from 'motion/react';
import { dbService, hasPermission, isAdminRole, isSuperAdminRole, LegacyMigrationState } from './services/db';
import { GymDatabase, Member, ReminderLogEntry, User } from './types/gym';
import { Database, AlertTriangle, CheckCircle2, X, ShieldCheck } from 'lucide-react';
import { WindowsTitleBar } from './components/WindowsTitleBar';
import { Navigation, DesktopTab } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { AnalyticsView } from './components/AnalyticsView';
import { MembersView } from './components/MembersView';
import { MembershipsView } from './components/MembershipsView';
import { PaymentsView } from './components/PaymentsView';
import { ActivityLogView } from './components/ActivityLogView';
import { BackupsView } from './components/BackupsView';
import { TailscaleHubView } from './components/TailscaleHubView';
import { AccountSettingsView } from './components/AccountSettingsView';
import { SuperAdminPermissionsView } from './components/SuperAdminPermissionsView';
import { AndroidExpoView } from './components/AndroidExpoView';
import { LoginPage } from './components/LoginPage';
import { AuthModal } from './components/AuthModal';
import { UndoModal } from './components/UndoModal';
import { ReceiptModal } from './components/ReceiptModal';
import { WhatsAppReminderModal } from './components/WhatsAppReminderModal';
import { ShortcutHelpModal } from './components/ShortcutHelpModal';
import { SectionWrapper } from './components/MotionPrimitives';
import {
  AddMemberModal,
  RecordPaymentModal,
  AssignMembershipModal,
  QuickCheckInModal,
} from './components/ActionModals';

export default function App() {
  const [db, setDb] = useState<GymDatabase>(dbService.getDb());
  const [currentUser, setCurrentUser] = useState<User | null>(dbService.getCurrentUser());
  const [currentTab, setCurrentTab] = useState<DesktopTab>('dashboard');
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile' | 'split'>('desktop');

  // Modals & Drawers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [recordPaymentData, setRecordPaymentData] = useState<{ isOpen: boolean; memberId?: string }>({
    isOpen: false,
  });
  const [assignMembershipData, setAssignMembershipData] = useState<{ isOpen: boolean; memberId?: string }>({
    isOpen: false,
  });
  const [quickCheckInOpen, setQuickCheckInOpen] = useState(false);
  const [undoModalLogId, setUndoModalLogId] = useState<string | null>(null);

  const [reminderModalData, setReminderModalData] = useState<{
    member: Member;
    balance: number;
    dueDate?: string;
    tier?: ReminderLogEntry['tier'];
  } | null>(null);

  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [focusedPaymentId, setFocusedPaymentId] = useState<string | null>(null);
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);

  const [dbReady, setDbReady] = useState<boolean>(dbService.isReady());
  const [backendError, setBackendError] = useState<string | null>(dbService.getLastError());
  const [migrationState, setMigrationState] = useState<LegacyMigrationState>(dbService.getMigrationState());
  const [migrationBannerDismissed, setMigrationBannerDismissed] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);

  // Sync with Database Service subscriptions
  useEffect(() => {
    const unsubscribe = dbService.subscribe(() => {
      setDb({ ...dbService.getDb() });
      setCurrentUser(dbService.getCurrentUser());
      setDbReady(dbService.isReady());
      setBackendError(dbService.getLastError());
      setMigrationState({ ...dbService.getMigrationState() });
    });
    return () => unsubscribe();
  }, []);

  // Automatically redirect away from Super Admin or permission-restricted tabs if account switches
  useEffect(() => {
    if (!currentUser) return;
    if (currentTab === 'super_admin_permissions' && !isSuperAdminRole(currentUser.role)) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'analytics' && !hasPermission(currentUser, 'canViewAnalytics')) {
      setCurrentTab('dashboard');
    } else if (currentTab === 'tailscale' && !hasPermission(currentUser, 'canManageTailscale')) {
      setCurrentTab('dashboard');
    }

    if (!isSuperAdminRole(currentUser.role) && !hasPermission(currentUser, 'canAccessExpoMobile') && viewMode !== 'desktop') {
      setViewMode('desktop');
    }
  }, [currentUser, currentTab, viewMode]);

  const handleSignOut = () => {
    dbService.signOut();
    setSelectedMember(null);
    setFocusedPaymentId(null);
    setShortcutModalOpen(false);
    setCurrentTab('dashboard');
  };

  // Global keyboard shortcuts for navigation, quick actions, and closing modals
  useEffect(() => {
    if (!currentUser) return;

    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (shortcutModalOpen) {
          e.preventDefault();
          setShortcutModalOpen(false);
          return;
        }
        if (authModalOpen) {
          e.preventDefault();
          setAuthModalOpen(false);
          return;
        }
        if (undoModalLogId) {
          e.preventDefault();
          setUndoModalLogId(null);
          return;
        }
        if (receiptPaymentId) {
          e.preventDefault();
          setReceiptPaymentId(null);
          return;
        }
        if (reminderModalData) {
          e.preventDefault();
          setReminderModalData(null);
          return;
        }
        if (addMemberOpen) {
          e.preventDefault();
          setAddMemberOpen(false);
          return;
        }
        if (recordPaymentData.isOpen) {
          e.preventDefault();
          setRecordPaymentData({ isOpen: false });
          return;
        }
        if (assignMembershipData.isOpen) {
          e.preventDefault();
          setAssignMembershipData({ isOpen: false });
          return;
        }
        if (quickCheckInOpen) {
          e.preventDefault();
          setQuickCheckInOpen(false);
          return;
        }
        return;
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

      if (e.key === '?') {
        e.preventDefault();
        setShortcutModalOpen((prev) => !prev);
        return;
      }

      // Do not trigger global action/navigation shortcuts while any modal dialog is open
      if (document.querySelector('.fixed.inset-0.z-50')) return;

      const key = e.key.toLowerCase();

      // Shift+L: Sign out
      if (e.shiftKey && key === 'l') {
        e.preventDefault();
        handleSignOut();
        return;
      }

      if (e.shiftKey) return;

      // Tab navigation shortcuts (1-9, 0)
      if (key === '1') {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('dashboard');
      } else if (key === '2') {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('members');
      } else if (key === '3') {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('memberships');
      } else if (key === '4') {
        e.preventDefault();
        setCurrentTab('payments');
      } else if (key === '5' && hasPermission(currentUser, 'canViewAnalytics')) {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('analytics');
      } else if (key === '6') {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('activity');
      } else if (
        key === '7' &&
        (hasPermission(currentUser, 'canManageBackups') || isAdminRole(currentUser.role))
      ) {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('backups');
      } else if (key === '8' && hasPermission(currentUser, 'canManageTailscale')) {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('tailscale');
      } else if (key === '9') {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('settings');
      } else if (key === '0' && isSuperAdminRole(currentUser.role)) {
        e.preventDefault();
        setFocusedPaymentId(null);
        setCurrentTab('super_admin_permissions');
      } else if (key === 'n' && hasPermission(currentUser, 'canManageMembers')) {
        e.preventDefault();
        setAddMemberOpen(true);
      } else if (key === 'p' && hasPermission(currentUser, 'canRecordPayments')) {
        e.preventDefault();
        setRecordPaymentData({ isOpen: true, memberId: selectedMember?.id });
      } else if (key === 'a' && hasPermission(currentUser, 'canManageMembers')) {
        e.preventDefault();
        setAssignMembershipData({ isOpen: true, memberId: selectedMember?.id });
      } else if (
        key === 'x' &&
        (isSuperAdminRole(currentUser.role) || hasPermission(currentUser, 'canAccessExpoMobile'))
      ) {
        e.preventDefault();
        setViewMode((prev) => (prev === 'mobile' ? 'desktop' : 'mobile'));
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [
    currentUser,
    shortcutModalOpen,
    authModalOpen,
    undoModalLogId,
    receiptPaymentId,
    reminderModalData,
    addMemberOpen,
    recordPaymentData.isOpen,
    assignMembershipData.isOpen,
    quickCheckInOpen,
    selectedMember,
  ]);

  const activeMembersCount = db.members.filter((m) => m.status === 'active').length;
  const todayCheckInsCount = db.checkIns.length;

  const paymentForReceipt = receiptPaymentId
    ? db.payments.find((p) => p.id === receiptPaymentId)
    : null;
  const memberForReceipt = paymentForReceipt
    ? db.members.find((m) => m.id === paymentForReceipt.memberId)
    : null;

  const renderActiveDesktopTab = () => {
    switch (currentTab) {
      case 'analytics':
        return <AnalyticsView db={db} currentUser={currentUser} />;
      case 'members':
        return (
          <MembersView
            db={db}
            currentUser={currentUser}
            onOpenAddMember={() => setAddMemberOpen(true)}
            onOpenRecordPayment={(memberId) => setRecordPaymentData({ isOpen: true, memberId })}
            onOpenAssignMembership={(memberId) =>
              setAssignMembershipData({ isOpen: true, memberId })
            }
            onOpenReminderModal={(member, balance, dueDate) =>
              setReminderModalData({ member, balance, dueDate })
            }
            onOpenReceiptModal={(paymentId) => setReceiptPaymentId(paymentId)}
            selectedMember={selectedMember}
            setSelectedMember={setSelectedMember}
          />
        );
      case 'memberships':
        return (
          <MembershipsView
            db={db}
            currentUser={currentUser}
            onOpenAssignMembership={(memberId) =>
              setAssignMembershipData({ isOpen: true, memberId })
            }
            onSelectMemberById={(memberId) => {
              const member = db.members.find((m) => m.id === memberId);
              if (member) {
                setSelectedMember(member);
                setCurrentTab('members');
              }
            }}
          />
        );
      case 'payments':
        return (
          <PaymentsView
            db={db}
            currentUser={currentUser}
            onOpenRecordPayment={() => setRecordPaymentData({ isOpen: true })}
            onOpenReceiptModal={(paymentId) => setReceiptPaymentId(paymentId)}
            onSelectMemberById={(memberId) => {
              const member = db.members.find((m) => m.id === memberId);
              if (member) {
                setSelectedMember(member);
                setCurrentTab('members');
              }
            }}
            focusedPaymentId={focusedPaymentId}
            onClearFocusedPayment={() => setFocusedPaymentId(null)}
          />
        );
      case 'activity':
        return (
          <ActivityLogView
            db={db}
            currentUser={currentUser}
            onOpenUndoModal={(logId) => setUndoModalLogId(logId)}
          />
        );
      case 'backups':
        return <BackupsView db={db} currentUser={currentUser} />;
      case 'tailscale':
        return (
          <TailscaleHubView
            db={db}
            currentUser={currentUser}
            onLaunchMobileSimulator={() => setViewMode('mobile')}
          />
        );
      case 'settings':
        return <AccountSettingsView db={db} currentUser={currentUser} />;
      case 'super_admin_permissions':
        return isSuperAdminRole(currentUser?.role) ? (
          <SuperAdminPermissionsView db={db} currentUser={currentUser} />
        ) : (
          <DashboardView
            db={db}
            currentUser={currentUser}
            onNavigate={setCurrentTab}
            onOpenAddMember={() => setAddMemberOpen(true)}
            onOpenRecordPayment={(memberId) => setRecordPaymentData({ isOpen: true, memberId })}
            onOpenQuickCheckIn={() => setQuickCheckInOpen(true)}
            onOpenReminderModal={(member, balance, dueDate, tier) =>
              setReminderModalData({ member, balance, dueDate, tier })
            }
            onOpenUndoModal={(logId) => setUndoModalLogId(logId)}
            onSelectMember={(member) => {
              setSelectedMember(member);
              setCurrentTab('members');
            }}
          />
        );
      case 'dashboard':
      case 'attendance':
      default:
        return (
          <DashboardView
            db={db}
            currentUser={currentUser}
            onNavigate={setCurrentTab}
            onOpenAddMember={() => setAddMemberOpen(true)}
            onOpenRecordPayment={(memberId) => setRecordPaymentData({ isOpen: true, memberId })}
            onOpenQuickCheckIn={() => setQuickCheckInOpen(true)}
            onOpenReminderModal={(member, balance, dueDate, tier) =>
              setReminderModalData({ member, balance, dueDate, tier })
            }
            onOpenUndoModal={(logId) => setUndoModalLogId(logId)}
            onSelectMember={(member) => {
              setSelectedMember(member);
              setCurrentTab('members');
            }}
          />
        );
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden font-sans selection:bg-amber-500/30 selection:text-amber-200">
        {/* Windows 11 Desktop Title Bar (Super Admin Exclusive) */}
        {isSuperAdminRole(currentUser?.role) && (
          <WindowsTitleBar
            currentUser={currentUser}
            tailscale={db.tailscale}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onOpenAuth={() => setAuthModalOpen(true)}
            onSignOut={handleSignOut}
            onOpenTailscaleModal={() => {
              if (hasPermission(currentUser, 'canManageTailscale')) {
                setCurrentTab('tailscale');
              }
            }}
          />
        )}

        {/* Safe Backend Error & Migration Notices */}
        {backendError && (
          <div className="px-4 py-2 bg-rose-950/90 border-b border-rose-800 text-rose-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{backendError}</span>
            </div>
            <button
              type="button"
              onClick={() => dbService.clearLastError()}
              className="p-1 text-rose-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {migrationState.status === 'auto_migrated' && !migrationBannerDismissed && (
          <div className="px-4 py-2 bg-emerald-950/80 border-b border-emerald-800 text-emerald-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {migrationState.message || 'Legacy browser data safely migrated to SQLite.'}
                {migrationState.safetyBackupFile && ` (Safety archive: ${migrationState.safetyBackupFile})`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMigrationBannerDismissed(true)}
              className="p-1 text-emerald-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Workspace Frame */}
        {!dbReady ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-400 text-xs">
            <Database className="w-8 h-8 text-amber-400 animate-pulse" />
            <span className="font-mono tracking-wide">Connecting to local SQLite engine (WAL mode)...</span>
          </div>
        ) : (
        <AnimatePresence mode="wait">
          {!currentUser ? (
            <SectionWrapper key="login-view" className="flex-1 overflow-y-auto">
              <LoginPage db={db} />
            </SectionWrapper>
          ) : (
            <SectionWrapper key="workspace-view" className="flex-1 flex overflow-hidden">
              {/* Render Windows Desktop UI if in desktop or split mode */}
              {(viewMode === 'desktop' || viewMode === 'split') && (
                <div
                  className={`flex flex-1 overflow-hidden ${
                    viewMode === 'split' ? 'border-r-2 border-neutral-800' : ''
                  }`}
                >
                  {/* Desktop Navigation Sidebar */}
                  <Navigation
                    currentTab={currentTab}
                    onSelectTab={(tab) => {
                      if (tab !== 'payments') setFocusedPaymentId(null);
                      setCurrentTab(tab);
                    }}
                    currentUser={currentUser}
                    activeMembersCount={activeMembersCount}
                    todayCheckInsCount={todayCheckInsCount}
                    members={db.members}
                    payments={db.payments}
                    onSelectMember={(member) => {
                      setSelectedMember(member);
                      setCurrentTab('members');
                    }}
                    onSelectPayment={(payment) => {
                      setFocusedPaymentId(payment.id);
                      setCurrentTab('payments');
                    }}
                    onSignOut={handleSignOut}
                    onOpenExpoMobile={() => setViewMode('mobile')}
                    onOpenShortcuts={() => setShortcutModalOpen(true)}
                  />

                  {/* Active Desktop Viewport with Section Opening Transition */}
                  <main className="flex-1 overflow-y-auto bg-neutral-950">
                    <AnimatePresence mode="wait">
                      <SectionWrapper key={currentTab}>{renderActiveDesktopTab()}</SectionWrapper>
                    </AnimatePresence>
                  </main>
                </div>
              )}

              {/* Render Android Expo Client Simulator if in mobile or split mode */}
              {(viewMode === 'mobile' || viewMode === 'split') && (
                <div
                  className={`${
                    viewMode === 'split' ? 'w-[440px] shrink-0 overflow-y-auto' : 'flex-1 overflow-y-auto'
                  }`}
                >
                  <AndroidExpoView
                    db={db}
                    currentUser={currentUser}
                    onOpenReminderModal={(member, balance, dueDate) =>
                      setReminderModalData({ member, balance, dueDate })
                    }
                    onOpenReceiptModal={(paymentId) => setReceiptPaymentId(paymentId)}
                    onBackToDesktop={() => setViewMode('desktop')}
                  />
                </div>
              )}
            </SectionWrapper>
          )}
        </AnimatePresence>
        )}

        {/* Legacy localStorage Safe Migration Confirmation Modal */}
        {migrationState.status === 'needs_confirmation' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg bg-neutral-900 border border-amber-800/70 rounded-xl p-6 space-y-4 text-xs shadow-2xl">
              <div className="flex items-center gap-2.5 text-amber-400 border-b border-neutral-800 pb-3">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Legacy Browser Data Detected</h3>
              </div>

              <p className="text-neutral-300 leading-relaxed">
                {migrationState.message ||
                  'Existing browser storage records were found alongside your active SQLite database.'}
              </p>

              <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-950 border border-neutral-800 rounded-lg font-mono text-[11px]">
                <div>
                  <span className="text-neutral-500 block uppercase text-[10px]">Legacy Storage</span>
                  <span className="text-amber-300">
                    {migrationState.legacyCounts?.members || 0} members · {migrationState.legacyCounts?.payments || 0} payments
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 block uppercase text-[10px]">Active SQLite</span>
                  <span className="text-emerald-300">
                    {migrationState.sqliteCounts?.members || 0} members · {migrationState.sqliteCounts?.payments || 0} payments
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-neutral-400">
                Before any merge or replace, Flex & Flow automatically creates a verified AES-256 pre-migration safety backup on disk.
              </p>

              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  disabled={migrationBusy}
                  onClick={async () => {
                    setMigrationBusy(true);
                    await dbService.confirmLegacyMigration('dismiss');
                    setMigrationBusy(false);
                  }}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-medium"
                >
                  Keep Current SQLite Only
                </button>
                <button
                  type="button"
                  disabled={migrationBusy}
                  onClick={async () => {
                    setMigrationBusy(true);
                    await dbService.confirmLegacyMigration('replace');
                    setMigrationBusy(false);
                  }}
                  className="px-3 py-2 bg-rose-950 hover:bg-rose-800 text-rose-200 border border-rose-800 rounded font-semibold"
                >
                  Backup & Replace SQLite
                </button>
                <button
                  type="button"
                  disabled={migrationBusy}
                  onClick={async () => {
                    setMigrationBusy(true);
                    await dbService.confirmLegacyMigration('merge');
                    setMigrationBusy(false);
                  }}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded"
                >
                  {migrationBusy ? 'Migrating...' : 'Merge Safely (Recommended)'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Modals */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          currentUser={currentUser}
          db={db}
        />

        <UndoModal
          logId={undoModalLogId}
          db={db}
          onClose={() => setUndoModalLogId(null)}
        />

        {paymentForReceipt && memberForReceipt && (
          <ReceiptModal
            payment={paymentForReceipt}
            member={memberForReceipt}
            db={db}
            onClose={() => setReceiptPaymentId(null)}
          />
        )}

        {reminderModalData && (
          <WhatsAppReminderModal
            member={reminderModalData.member}
            outstandingBalanceInr={reminderModalData.balance}
            dueDate={reminderModalData.dueDate}
            tier={reminderModalData.tier}
            onClose={() => setReminderModalData(null)}
          />
        )}

        <AddMemberModal
          isOpen={addMemberOpen}
          onClose={() => setAddMemberOpen(false)}
          onMemberCreated={(newMember) => {
            setSelectedMember(newMember);
            setCurrentTab('members');
          }}
        />

        <RecordPaymentModal
          isOpen={recordPaymentData.isOpen}
          initialMemberId={recordPaymentData.memberId}
          db={db}
          onClose={() => setRecordPaymentData({ isOpen: false })}
          onPaymentRecorded={(paymentId) => {
            setReceiptPaymentId(paymentId);
          }}
        />

        <AssignMembershipModal
          isOpen={assignMembershipData.isOpen}
          initialMemberId={assignMembershipData.memberId}
          db={db}
          onClose={() => setAssignMembershipData({ isOpen: false })}
        />

        <QuickCheckInModal
          isOpen={quickCheckInOpen}
          db={db}
          onClose={() => setQuickCheckInOpen(false)}
        />

        <ShortcutHelpModal
          isOpen={shortcutModalOpen}
          onClose={() => setShortcutModalOpen(false)}
          currentUser={currentUser}
        />
      </div>
    </MotionConfig>
  );
}
