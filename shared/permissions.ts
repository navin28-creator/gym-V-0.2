import type { AdminPermissions, MembershipPlan, User, UserRole } from '../src/types/gym';

export const FULL_ADMIN_PERMISSIONS: AdminPermissions = {
  canManageMembers: true,
  canDeleteMembers: true,
  canViewMemberContactDetails: true,
  canManagePlans: true,
  canRecordPayments: true,
  canVoidAndDeletePayments: true,
  canPrintReceipts: true,
  canSendPaymentReminders: true,
  canViewAnalytics: true,
  canExportData: true,
  canViewAllActivity: true,
  canUndoActions: true,
  canManageBackups: true,
  canManageStaffAccounts: true,
  canManageTailscale: true,
  canAccessExpoMobile: true,
};

export const ZERO_PERMISSIONS: AdminPermissions = {
  canManageMembers: false,
  canDeleteMembers: false,
  canViewMemberContactDetails: false,
  canManagePlans: false,
  canRecordPayments: false,
  canVoidAndDeletePayments: false,
  canPrintReceipts: false,
  canSendPaymentReminders: false,
  canViewAnalytics: false,
  canExportData: false,
  canViewAllActivity: false,
  canUndoActions: false,
  canManageBackups: false,
  canManageStaffAccounts: false,
  canManageTailscale: false,
  canAccessExpoMobile: false,
};

export const OWNER_DEFAULT_PERMISSIONS: AdminPermissions = {
  canManageMembers: true,
  canDeleteMembers: false,
  canViewMemberContactDetails: true,
  canManagePlans: true,
  canRecordPayments: true,
  canVoidAndDeletePayments: true,
  canPrintReceipts: true,
  canSendPaymentReminders: true,
  canViewAnalytics: true,
  canExportData: false,
  canViewAllActivity: true,
  canUndoActions: false,
  canManageBackups: false,
  canManageStaffAccounts: false,
  canManageTailscale: false,
  canAccessExpoMobile: false,
};

export const OPERATIONS_ADMIN_PERMISSIONS: AdminPermissions = {
  canManageMembers: true,
  canDeleteMembers: false,
  canViewMemberContactDetails: true,
  canManagePlans: true,
  canRecordPayments: true,
  canVoidAndDeletePayments: false,
  canPrintReceipts: true,
  canSendPaymentReminders: true,
  canViewAnalytics: true,
  canExportData: false,
  canViewAllActivity: true,
  canUndoActions: false,
  canManageBackups: false,
  canManageStaffAccounts: false,
  canManageTailscale: false,
  canAccessExpoMobile: false,
};

export const MANAGER_DEFAULT_PERMISSIONS: AdminPermissions = {
  canManageMembers: true,
  canDeleteMembers: false,
  canViewMemberContactDetails: true,
  canManagePlans: true,
  canRecordPayments: true,
  canVoidAndDeletePayments: false,
  canPrintReceipts: true,
  canSendPaymentReminders: true,
  canViewAnalytics: true,
  canExportData: false,
  canViewAllActivity: false,
  canUndoActions: false,
  canManageBackups: false,
  canManageStaffAccounts: false,
  canManageTailscale: false,
  canAccessExpoMobile: false,
};

export const ACCOUNTANT_DEFAULT_PERMISSIONS: AdminPermissions = {
  canManageMembers: false,
  canDeleteMembers: false,
  canViewMemberContactDetails: false,
  canManagePlans: false,
  canRecordPayments: true,
  canVoidAndDeletePayments: false,
  canPrintReceipts: true,
  canSendPaymentReminders: true,
  canViewAnalytics: true,
  canExportData: false,
  canViewAllActivity: true,
  canUndoActions: false,
  canManageBackups: false,
  canManageStaffAccounts: false,
  canManageTailscale: false,
  canAccessExpoMobile: false,
};

export const STAFF_DEFAULT_PERMISSIONS: AdminPermissions = {
  canManageMembers: true,
  canDeleteMembers: false,
  canViewMemberContactDetails: false,
  canManagePlans: false,
  canRecordPayments: true,
  canVoidAndDeletePayments: false,
  canPrintReceipts: false,
  canSendPaymentReminders: true,
  canViewAnalytics: false,
  canExportData: false,
  canViewAllActivity: false,
  canUndoActions: false,
  canManageBackups: false,
  canManageStaffAccounts: false,
  canManageTailscale: false,
  canAccessExpoMobile: false,
};

export const RECEPTIONIST_DEFAULT_PERMISSIONS: AdminPermissions = {
  canManageMembers: true,
  canDeleteMembers: false,
  canViewMemberContactDetails: true,
  canManagePlans: false,
  canRecordPayments: true,
  canVoidAndDeletePayments: false,
  canPrintReceipts: true,
  canSendPaymentReminders: false,
  canViewAnalytics: false,
  canExportData: false,
  canViewAllActivity: false,
  canUndoActions: false,
  canManageBackups: false,
  canManageStaffAccounts: false,
  canManageTailscale: false,
  canAccessExpoMobile: false,
};

export function getDefaultPermissionsForRole(role?: UserRole | null): AdminPermissions {
  switch (role) {
    case 'super_admin':
      return { ...FULL_ADMIN_PERMISSIONS };
    case 'owner':
      return { ...OWNER_DEFAULT_PERMISSIONS };
    case 'admin':
      return { ...OPERATIONS_ADMIN_PERMISSIONS };
    case 'manager':
      return { ...MANAGER_DEFAULT_PERMISSIONS };
    case 'accountant':
      return { ...ACCOUNTANT_DEFAULT_PERMISSIONS };
    case 'receptionist':
      return { ...RECEPTIONIST_DEFAULT_PERMISSIONS };
    case 'staff':
    default:
      return { ...STAFF_DEFAULT_PERMISSIONS };
  }
}

export function isAdminRole(role?: UserRole | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'owner' || role === 'manager';
}

export function isSuperAdminRole(role?: UserRole | null): boolean {
  return role === 'super_admin';
}

export function getEffectivePermissions(user?: User | null): AdminPermissions {
  if (!user) return { ...ZERO_PERMISSIONS };
  if (user.role === 'super_admin') return { ...FULL_ADMIN_PERMISSIONS };
  const roleDefaults = getDefaultPermissionsForRole(user.role);
  return {
    ...roleDefaults,
    ...(user.permissions || {}),
  };
}

export function hasPermission(
  user: User | null | undefined,
  perm: keyof AdminPermissions
): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return Boolean(getEffectivePermissions(user)[perm]);
}

export function getRoleLabel(role?: UserRole | null): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Operations Admin';
    case 'owner':
      return 'Gym Owner';
    case 'manager':
      return 'Branch Manager';
    case 'accountant':
      return 'Finance Manager';
    case 'receptionist':
      return 'Front Desk';
    case 'staff':
    default:
      return 'Head Trainer (Staff)';
  }
}

export const DEFAULT_PLANS: MembershipPlan[] = [
  {
    id: 'plan-1',
    name: 'Monthly Strength & Cardio',
    durationDays: 30,
    priceInr: 1800,
    category: 'Gym',
    description: 'Full gym floor access, cardio theater, locker room, and initial fitness assessment.',
  },
  {
    id: 'plan-2',
    name: 'Quarterly Pro Transformation',
    durationDays: 90,
    priceInr: 4800,
    category: 'Gym',
    description: 'Quarterly membership with 1 body composition scan per month and diet consultation.',
  },
  {
    id: 'plan-3',
    name: 'Half-Yearly Flex Saver',
    durationDays: 180,
    priceInr: 8500,
    category: 'Gym',
    description: '6-month access with 1 guest pass per month and 15% discount on personal training.',
  },
  {
    id: 'plan-4',
    name: 'Annual Elite Unlimited',
    durationDays: 365,
    priceInr: 15000,
    category: 'Combo',
    description: '365 days 24/7 access, steam bath, CrossFit arena, and 2 free PT sessions.',
  },
  {
    id: 'plan-5',
    name: 'Personal Training 12-Pack',
    durationDays: 45,
    priceInr: 7200,
    category: 'Personal Training',
    description: '12 one-on-one sessions with certified strength coach and nutrition planning.',
  },
  {
    id: 'plan-6',
    name: 'Single Day Drop-In Pass',
    durationDays: 1,
    priceInr: 300,
    category: 'Gym',
    description: 'Single day workout pass including steam and locker access.',
  },
];
