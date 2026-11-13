import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Member, PaymentRecord, User, UserRole } from '../types/gym';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  History,
  HardDriveDownload,
  Radio,
  Settings,
  Dumbbell,
  Layers,
  TrendingUp,
  Crown,
  SlidersHorizontal,
  LogOut,
  Shield,
  ShieldCheck,
  UserCheck,
  Briefcase,
  Calculator,
  ClipboardList,
  Smartphone,
  Search,
  X,
  ArrowUpRight,
  Keyboard,
} from 'lucide-react';
import { getRoleLabel, hasPermission, isAdminRole, isSuperAdminRole } from '../services/db';
import { formatINR } from '../services/crypto';

export type DesktopTab =
  | 'dashboard'
  | 'analytics'
  | 'members'
  | 'memberships'
  | 'payments'
  | 'attendance'
  | 'activity'
  | 'backups'
  | 'tailscale'
  | 'settings'
  | 'super_admin_permissions';

interface NavigationProps {
  currentTab: DesktopTab;
  onSelectTab: (tab: DesktopTab) => void;
  currentUser: User | null;
  activeMembersCount: number;
  todayCheckInsCount: number;
  members: Member[];
  payments: PaymentRecord[];
  onSelectMember: (member: Member) => void;
  onSelectPayment: (payment: PaymentRecord) => void;
  onSignOut: () => void;
  onOpenExpoMobile?: () => void;
  onOpenShortcuts?: () => void;
}

interface NavItem {
  id: DesktopTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string | number | null;
  shortcut?: string;
  highlightRose?: boolean;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

type SearchResultItem =
  | { type: 'member'; member: Member }
  | { type: 'payment'; payment: PaymentRecord; memberName: string };

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  activeMembersCount,
  members,
  payments,
  onSelectMember,
  onSelectPayment,
  onSignOut,
  onOpenExpoMobile,
  onOpenShortcuts,
}) => {
  const isOwnerOrAdmin = isAdminRole(currentUser?.role);
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);

  const canViewAnalytics = hasPermission(currentUser, 'canViewAnalytics');
  const canManageBackups = hasPermission(currentUser, 'canManageBackups');
  const canManageTailscale = hasPermission(currentUser, 'canManageTailscale');
  const canAccessExpoMobile = hasPermission(currentUser, 'canAccessExpoMobile');
  const canViewMemberContactDetails = hasPermission(currentUser, 'canViewMemberContactDetails');

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.id, m.fullName);
    }
    return map;
  }, [members]);

  const { matchedMembers, matchedPayments, flatResults } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        matchedMembers: [] as Member[],
        matchedPayments: [] as { payment: PaymentRecord; memberName: string }[],
        flatResults: [] as SearchResultItem[],
      };
    }

    const mResults = members
      .filter((m) => {
        const baseMatch =
          m.fullName.toLowerCase().includes(q) ||
          m.memberNumber.toLowerCase().includes(q) ||
          m.fitnessGoal.toLowerCase().includes(q);
        if (baseMatch) return true;
        if (canViewMemberContactDetails) {
          return m.phone.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
        }
        return false;
      })
      .slice(0, 5);

    const pResults = payments
      .map((p) => ({
        payment: p,
        memberName: memberNameMap.get(p.memberId) || 'Unknown Member',
      }))
      .filter(({ payment, memberName }) => {
        return (
          payment.paymentNumber.toLowerCase().includes(q) ||
          payment.referenceNumber.toLowerCase().includes(q) ||
          payment.method.toLowerCase().includes(q) ||
          payment.amountInr.toString().includes(q) ||
          memberName.toLowerCase().includes(q)
        );
      })
      .slice(0, 5);

    const flat: SearchResultItem[] = [
      ...mResults.map((member) => ({ type: 'member' as const, member })),
      ...pResults.map(({ payment, memberName }) => ({
        type: 'payment' as const,
        payment,
        memberName,
      })),
    ];

    return {
      matchedMembers: mResults,
      matchedPayments: pResults,
      flatResults: flat,
    };
  }, [searchQuery, members, payments, memberNameMap, canViewMemberContactDetails]);

  useEffect(() => {
    setActiveResultIdx(0);
  }, [searchQuery]);

  // Close search popover when clicking outside
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Global keyboard shortcut: '/' or Ctrl/Cmd+K focuses search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleChooseResult = (item: SearchResultItem) => {
    if (item.type === 'member') {
      onSelectMember(item.member);
    } else {
      onSelectPayment(item.payment);
    }
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchQuery('');
      searchInputRef.current?.blur();
      return;
    }
    if (!searchOpen || flatResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveResultIdx((prev) => (prev + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveResultIdx((prev) => (prev - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatResults[activeResultIdx];
      if (target) {
        handleChooseResult(target);
      }
    }
  };

  const renderRoleIcon = (role?: UserRole | null) => {
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

  const navGroups: NavGroup[] = [
    {
      id: 'operations',
      title: 'Gym Operations',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          badge: null,
          shortcut: '1',
        },
        {
          id: 'members',
          label: 'Members',
          icon: Users,
          badge: activeMembersCount,
          shortcut: '2',
        },
        {
          id: 'memberships',
          label: 'Memberships & Plans',
          icon: Layers,
          badge: null,
          shortcut: '3',
        },
      ],
    },
    {
      id: 'finance',
      title: 'Finance & Intelligence',
      items: [
        {
          id: 'payments',
          label: 'Payments Ledger',
          icon: CreditCard,
          badge: null,
          shortcut: '4',
        },
        ...(canViewAnalytics
          ? [
              {
                id: 'analytics' as DesktopTab,
                label: 'Analytics',
                icon: TrendingUp,
                badge: '12M',
                shortcut: '5',
              },
            ]
          : []),
      ],
    },
    {
      id: 'system',
      title: 'System & Security',
      items: [
        {
          id: 'activity',
          label: 'Activity & Undo Log',
          icon: History,
          badge: null,
          shortcut: '6',
        },
        ...(canManageBackups || isOwnerOrAdmin
          ? [
              {
                id: 'backups' as DesktopTab,
                label: 'Backups & Recovery',
                icon: HardDriveDownload,
                badge: canManageBackups ? 'AES-256' : 'Locked',
                shortcut: '7',
              },
            ]
          : []),
        ...(canManageTailscale
          ? [
              {
                id: 'tailscale' as DesktopTab,
                label: 'Tailscale & Mobile Hub',
                icon: Radio,
                badge: 'Port 3000',
                shortcut: '8',
              },
            ]
          : []),
        {
          id: 'settings',
          label: 'Account & Security',
          icon: Settings,
          badge: null,
          shortcut: '9',
        },
      ],
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'governance',
            title: 'Super Admin Governance',
            items: [
              {
                id: 'super_admin_permissions' as DesktopTab,
                label: 'Admin Permissions',
                icon: SlidersHorizontal,
                badge: 'Root',
                shortcut: '0',
                highlightRose: true,
              },
            ],
          },
        ]
      : []),
  ];

  const showDropdown = searchOpen && searchQuery.trim().length > 0;

  return (
    <aside className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col justify-between shrink-0 select-none relative">
      {/* Gym Brand Banner + Global Search */}
      <div className="p-4 border-b border-neutral-800 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              <span>Flex & Flow</span>
            </h1>
            <p className="text-[11px] text-neutral-400 font-mono">Single-Gym Desktop v1.2</p>
          </div>
        </div>

        <div className="px-2 py-1 bg-neutral-900 border border-neutral-800/80 rounded text-[11px] text-neutral-400 flex items-center justify-between font-mono">
          <span>Source of Truth:</span>
          <span className="text-amber-400">SQLite (Local)</span>
        </div>

        {/* Global Search Input */}
        <div ref={searchContainerRef} className="relative">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-neutral-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Find members or receipts..."
              aria-label="Global search across members and payments"
              className="w-full pl-8 pr-12 py-1.5 bg-neutral-900 border border-neutral-800 focus:border-amber-400/80 rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                className="absolute right-2 text-neutral-500 hover:text-white p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="absolute right-2 px-1.5 py-0.5 text-[9px] font-mono text-neutral-500 bg-neutral-950 border border-neutral-800 rounded pointer-events-none">
                /
              </kbd>
            )}
          </div>

          {/* Search Results Popover */}
          {showDropdown && (
            <div className="absolute left-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-neutral-900 border border-neutral-700/90 rounded-xl shadow-2xl z-50 divide-y divide-neutral-800">
              {flatResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-400">
                  No members or receipts matching{' '}
                  <span className="font-mono text-neutral-200">"{searchQuery}"</span>
                </div>
              ) : (
                <>
                  {matchedMembers.length > 0 && (
                    <div className="p-2 space-y-1">
                      <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3 h-3 text-amber-400" />
                          <span>Members</span>
                        </span>
                        <span>{matchedMembers.length}</span>
                      </div>

                      {matchedMembers.map((member, idx) => {
                        const isHighlighted = activeResultIdx === idx;
                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => handleChooseResult({ type: 'member', member })}
                            onMouseEnter={() => setActiveResultIdx(idx)}
                            className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                              isHighlighted
                                ? 'bg-amber-500/15 border border-amber-500/40'
                                : 'hover:bg-neutral-800/70 border border-transparent'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-white truncate">
                                  {member.fullName}
                                </span>
                                <span className="text-[10px] font-mono text-amber-300 shrink-0">
                                  {member.memberNumber}
                                </span>
                              </div>
                              <div className="text-[10px] text-neutral-400 font-mono truncate mt-0.5">
                                {canViewMemberContactDetails ? member.phone : 'Contact restricted'} ·{' '}
                                <span className="uppercase">{member.status.replace('_', ' ')}</span>
                              </div>
                            </div>
                            <ArrowUpRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {matchedPayments.length > 0 && (
                    <div className="p-2 space-y-1">
                      <div className="px-2 py-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                        <span className="flex items-center gap-1.5">
                          <CreditCard className="w-3 h-3 text-emerald-400" />
                          <span>Payments</span>
                        </span>
                        <span>{matchedPayments.length}</span>
                      </div>

                      {matchedPayments.map(({ payment, memberName }, pIdx) => {
                        const flatIdx = matchedMembers.length + pIdx;
                        const isHighlighted = activeResultIdx === flatIdx;
                        return (
                          <button
                            key={payment.id}
                            type="button"
                            onClick={() =>
                              handleChooseResult({ type: 'payment', payment, memberName })
                            }
                            onMouseEnter={() => setActiveResultIdx(flatIdx)}
                            className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                              isHighlighted
                                ? 'bg-amber-500/15 border border-amber-500/40'
                                : 'hover:bg-neutral-800/70 border border-transparent'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono font-semibold text-amber-300 truncate">
                                  {payment.paymentNumber}
                                </span>
                                {payment.isVoided && (
                                  <span className="text-[9px] font-mono px-1 bg-rose-950/70 text-rose-300 border border-rose-800 rounded">
                                    VOID
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-neutral-400 truncate mt-0.5">
                                {memberName} · {payment.method} · {payment.referenceNumber}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono font-bold text-emerald-400 block tabular-nums">
                                {formatINR(payment.amountInr)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="px-3 py-1.5 bg-neutral-950/70 text-[10px] font-mono text-neutral-500 flex items-center justify-between">
                    <span>↑↓ navigate · ↵ open</span>
                    <span>Esc close</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Grouped Nav List */}
      <nav className="p-3 space-y-4 flex-1 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.id} className="space-y-1">
            <div className="px-2.5 pb-1 flex items-center justify-between">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  group.id === 'governance' ? 'text-rose-400 flex items-center gap-1' : 'text-neutral-500'
                }`}
              >
                {group.id === 'governance' && <Crown className="w-3 h-3" />}
                <span>{group.title}</span>
              </span>
            </div>

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 text-left hover:translate-x-0.5 ${
                    isActive
                      ? item.highlightRose
                        ? 'bg-rose-500/15 text-white font-semibold border border-rose-500/40 shadow-xs'
                        : 'bg-neutral-800/90 text-white font-semibold border border-neutral-700/60 shadow-xs'
                      : item.highlightRose
                      ? 'text-rose-300/90 hover:text-white hover:bg-rose-500/10 border border-transparent hover:border-rose-500/25'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border border-transparent hover:border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? item.highlightRose
                            ? 'text-rose-400'
                            : 'text-amber-400'
                          : item.highlightRose
                          ? 'text-rose-400/80'
                          : 'text-neutral-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.badge !== null && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isActive
                            ? item.highlightRose
                              ? 'bg-rose-500/25 text-rose-200 font-bold'
                              : 'bg-amber-400/20 text-amber-300 font-bold'
                            : item.highlightRose
                            ? 'bg-rose-500/10 text-rose-300'
                            : 'bg-neutral-900 text-neutral-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.shortcut && (
                      <kbd className="text-[9px] font-mono px-1 py-0.5 rounded bg-neutral-900/90 text-neutral-500 border border-neutral-800/80">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        {/* Quick Expo Mobile button if Super Admin explicitly enabled it for non-Super-Admin accounts */}
        {!isSuperAdmin && canAccessExpoMobile && onOpenExpoMobile && (
          <div className="pt-2 border-t border-neutral-800/70">
            <button
              onClick={onOpenExpoMobile}
              title="Shortcut: X"
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all"
            >
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>Launch Android Expo</span>
              </div>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-950/60 text-amber-200 border border-amber-500/30">
                X
              </kbd>
            </button>
          </div>
        )}
      </nav>

      {/* Footer Signed-in Session & System Specs */}
      <div className="border-t border-neutral-800 bg-neutral-950/80">
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="w-full px-3 py-2 border-b border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400 hover:text-amber-300 hover:bg-neutral-900/70 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Keyboard className="w-3.5 h-3.5 text-amber-400/80" />
              <span>Keyboard Shortcuts</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-neutral-900 border border-neutral-800 rounded text-neutral-300">
              ?
            </kbd>
          </button>
        )}

        {currentUser && (
          <div className="p-3 border-b border-neutral-800/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                {renderRoleIcon(currentUser.role)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate font-mono">
                  {currentUser.username}
                </p>
                <p className="text-[10px] text-neutral-400 truncate">
                  {getRoleLabel(currentUser.role)}
                </p>
              </div>
            </div>

            <button
              onClick={onSignOut}
              className="p-1.5 rounded-lg bg-neutral-900 hover:bg-rose-950/60 border border-neutral-800 hover:border-rose-800/70 text-neutral-400 hover:text-rose-300 transition-colors shrink-0"
              title="Sign Out (Shift + L)"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="p-3 text-[11px] text-neutral-400 space-y-1 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Timezone</span>
            <span className="text-neutral-300">Asia/Kolkata</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Currency</span>
            <span className="text-neutral-300">INR (₹)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Storage</span>
            <span className="text-neutral-300 truncate max-w-[120px]" title="desktop/data/gym.sqlite">
              gym.sqlite
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
