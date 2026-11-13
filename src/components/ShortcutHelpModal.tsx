import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types/gym';
import { hasPermission, isAdminRole, isSuperAdminRole } from '../services/db';
import { Keyboard, X, Compass, Zap, Users, Layers, Crown } from 'lucide-react';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
}

interface ShortcutItem {
  keys: string[];
  label: string;
  available?: boolean;
}

interface ShortcutGroup {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  items: ShortcutItem[];
}

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);
  const isAdmin = isAdminRole(currentUser?.role);
  const canManageMembers = hasPermission(currentUser, 'canManageMembers');
  const canDeleteMembers = hasPermission(currentUser, 'canDeleteMembers');
  const canManagePlans = hasPermission(currentUser, 'canManagePlans');
  const canRecordPayments = hasPermission(currentUser, 'canRecordPayments');
  const canSendReminders = hasPermission(currentUser, 'canSendPaymentReminders');
  const canViewAnalytics = hasPermission(currentUser, 'canViewAnalytics');
  const canManageBackups = hasPermission(currentUser, 'canManageBackups');
  const canManageTailscale = hasPermission(currentUser, 'canManageTailscale');
  const canAccessExpoMobile = hasPermission(currentUser, 'canAccessExpoMobile');

  const groups: ShortcutGroup[] = [
    {
      title: 'Global Navigation',
      icon: Compass,
      accentClass: 'text-amber-400',
      items: [
        { keys: ['Ctrl / Cmd', 'K'], label: 'Focus Global Search (Members & Receipts)', available: true },
        { keys: ['/'], label: 'Quick Focus Global Search', available: true },
        { keys: ['1'], label: 'Go to Dashboard', available: true },
        { keys: ['2'], label: 'Go to Members Directory', available: true },
        { keys: ['3'], label: 'Go to Memberships & Plans', available: true },
        { keys: ['4'], label: 'Go to Payments Ledger', available: true },
        { keys: ['5'], label: 'Go to 12M Analytics', available: canViewAnalytics },
        { keys: ['6'], label: 'Go to Activity & Undo Log', available: true },
        { keys: ['7'], label: 'Go to Backups & Recovery', available: canManageBackups || isAdmin },
        { keys: ['8'], label: 'Go to Tailscale & Mobile Hub', available: canManageTailscale },
        { keys: ['9'], label: 'Go to Account & Security', available: true },
        { keys: ['0'], label: 'Go to Super Admin Permissions', available: isSuperAdmin },
        { keys: ['X'], label: 'Toggle Android Expo Mobile Preview', available: isSuperAdmin || canAccessExpoMobile },
        { keys: ['Shift', 'L'], label: 'Sign Out of Current Session', available: true },
        { keys: ['?'], label: 'Open / Close Keyboard Shortcuts', available: true },
        { keys: ['Esc'], label: 'Close Active Dialog or Drawer', available: true },
      ],
    },
    {
      title: 'Quick Actions',
      icon: Zap,
      accentClass: 'text-emerald-400',
      items: [
        { keys: ['N'], label: 'Enroll New Gym Member', available: canManageMembers },
        { keys: ['P'], label: 'Record External Payment', available: canRecordPayments },
        { keys: ['A'], label: 'Assign / Renew Membership Plan', available: canManageMembers },
      ],
    },
    {
      title: 'Members Directory',
      icon: Users,
      accentClass: 'text-sky-400',
      items: [
        { keys: ['F'], label: 'Focus Member Search Input', available: true },
        { keys: ['↑', '↓'], label: 'Select Previous / Next Member', available: true },
        { keys: ['E'], label: 'Edit Selected Member Profile', available: canManageMembers },
        { keys: ['R'], label: 'Send WhatsApp / SMS Payment Reminder', available: canSendReminders },
        { keys: ['Del'], label: 'Delete Selected Member (with confirmation)', available: canDeleteMembers },
      ],
    },
    {
      title: 'Plans & Payments',
      icon: Layers,
      accentClass: 'text-cyan-400',
      items: [
        { keys: ['C'], label: 'Create New Membership Plan (on Plans view)', available: canManagePlans },
        { keys: ['T'], label: 'Toggle Plan Catalog / Enrollments Tab', available: true },
        { keys: ['F'], label: 'Focus Receipt Search (on Payments view)', available: true },
      ],
    },
    ...(isSuperAdmin
      ? [
          {
            title: 'Super Admin Governance',
            icon: Crown,
            accentClass: 'text-rose-400',
            items: [
              { keys: ['C'], label: 'Toggle Provision Role Account Form', available: true },
              { keys: ['↑', '↓'], label: 'Select Previous / Next Governed Account', available: true },
              { keys: ['Del'], label: 'Delete Selected Governed Account', available: true },
            ],
          },
        ]
      : []),
  ];

  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => i.available !== false),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden text-neutral-100"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-800 bg-neutral-950/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Keyboard Shortcuts</h3>
                  <p className="text-[11px] text-neutral-400">
                    Single-key actions pause automatically while typing inside form fields
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[75vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5">
              {visibleGroups.map((group) => {
                const Icon = group.icon;
                return (
                  <div
                    key={group.title}
                    className="bg-neutral-950/60 border border-neutral-800/90 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2 pb-2 border-b border-neutral-800/80">
                      <Icon className={`w-4 h-4 ${group.accentClass}`} />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-200">
                        {group.title}
                      </h4>
                    </div>

                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <div
                          key={`${group.title}-${item.label}`}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="text-neutral-300">{item.label}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.keys.map((key, idx) => (
                              <React.Fragment key={key}>
                                {idx > 0 && (
                                  <span className="text-neutral-600 text-[10px]">+</span>
                                )}
                                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-amber-300 bg-neutral-900 border border-neutral-700 rounded shadow-2xs">
                                  {key}
                                </kbd>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-[11px] font-mono text-neutral-500">
              <span>Press ? anytime to toggle this reference</span>
              <span>Press Esc to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
