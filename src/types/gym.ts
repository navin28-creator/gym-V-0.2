export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'owner'
  | 'manager'
  | 'accountant'
  | 'staff'
  | 'receptionist';

export interface AdminPermissions {
  canManageMembers: boolean;
  canDeleteMembers: boolean;
  canViewMemberContactDetails: boolean;
  canManagePlans: boolean;
  canRecordPayments: boolean;
  canVoidAndDeletePayments: boolean;
  canPrintReceipts: boolean;
  canSendPaymentReminders: boolean;
  canViewAnalytics: boolean;
  canExportData: boolean;
  canViewAllActivity: boolean;
  canUndoActions: boolean;
  canManageBackups: boolean;
  canManageStaffAccounts: boolean;
  canManageTailscale: boolean;
  canAccessExpoMobile: boolean;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  passwordHash: string;
  recoveryEmail?: string;
  emailVerified: boolean;
  createdAt: string;
  permissions?: AdminPermissions;
}

export type MemberStatus = 'active' | 'expired' | 'pending_renewal' | 'frozen';

export interface Member {
  id: string;
  memberNumber: string; // e.g., FF-1001
  fullName: string;
  phone: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  status: MemberStatus;
  joinedDate: string; // YYYY-MM-DD
  avatarUrl?: string;
  fitnessGoal: string;
  healthNotes?: string;
  internalNotes?: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  durationDays: number;
  priceInr: number;
  category: 'Gym' | 'CrossFit' | 'Personal Training' | 'Combo';
  description: string;
}

export interface MemberMembership {
  id: string;
  memberId: string;
  planId: string;
  planName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalPriceInr: number;
  status: 'active' | 'expired' | 'cancelled';
  createdAt: string;
}

export type PaymentMethod = 'UPI' | 'Cash' | 'Bank Transfer' | 'Cheque' | 'POS Card';

export interface PaymentRecord {
  id: string;
  paymentNumber: string; // e.g., RCPT-2026-0042
  memberId: string;
  membershipId?: string;
  amountInr: number;
  method: PaymentMethod;
  referenceNumber: string; // UPI txn ID, UTR, or cheque no.
  paymentDate: string; // ISO string with Asia/Kolkata context
  recordedByUserId: string;
  recordedByUsername: string;
  isVoided: boolean;
  voidReason?: string;
  voidedAt?: string;
  voidedByUserId?: string;
  notes?: string;
}

export interface CheckInRecord {
  id: string;
  memberId: string;
  memberName: string;
  checkInTime: string; // ISO string
  recordedByUsername: string;
}

export type ActivityActionType =
  | 'create_member'
  | 'update_member'
  | 'delete_member'
  | 'create_plan'
  | 'delete_plan'
  | 'assign_membership'
  | 'cancel_membership'
  | 'delete_membership'
  | 'record_payment'
  | 'void_payment'
  | 'delete_payment'
  | 'undo_action'
  | 'backup_export'
  | 'backup_restore'
  | 'owner_created'
  | 'user_created'
  | 'delete_user'
  | 'update_permissions'
  | 'update_role'
  | 'revoke_session'
  | 'password_reset'
  | 'local_recovery'
  | 'member_checkin'
  | 'sqlite_migration'
  | 'integrity_check'
  | 'renewal_reminder_sent'
  | 'desktop_settings_updated';

export interface ActivityLogEntry {
  id: string;
  timestamp: string; // ISO string (Asia/Kolkata)
  userId: string;
  username: string;
  role: UserRole;
  actionType: ActivityActionType;
  targetType: 'member' | 'plan' | 'membership' | 'payment' | 'user' | 'system' | 'checkin';
  targetId: string;
  targetName?: string;
  description: string;
  reversalOfLogId?: string;
  isReversible: boolean;
  isReversed?: boolean;
  snapshotBefore?: any;
  snapshotAfter?: any;
}

export interface BackupConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword?: string;
  senderEmail: string;
  recipientEmail: string;
  backupEncryptionKey: string; // 32-byte Base64 key
  initialDelayMinutes: number;
  intervalHours: number;
  autoBackupEnabled: boolean;
  lastBackupTimestamp?: string;
  lastBackupStatus?: 'success' | 'failed' | 'scheduled';
}

export interface BackupArchiveRecord {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: string;
  sizeBytes: number;
  sha256Checksum: string;
  encrypted: boolean;
  verified: boolean;
  trigger: 'auto_daily' | 'manual' | 'pre_restore_safety' | 'pre_migration_safety';
  memberCount: number;
  paymentCount: number;
}

export interface IntegrityReport {
  status: 'healthy' | 'warning' | 'corrupted';
  checkedAt: string;
  sqliteIntegrityCheck: string;
  foreignKeyIssues: number;
  walMode: string;
  dbSizeBytes: number;
  dbPath: string;
  totalTables: number;
  recordCounts: {
    users: number;
    plans: number;
    members: number;
    memberships: number;
    payments: number;
    checkIns: number;
    activityLogs: number;
    reminderLogs: number;
  };
  autoRecoveredFromBackup?: string;
}

export interface DesktopSettings {
  minimizeToTray: boolean;
  launchAtStartup: boolean;
  desktopNotificationsEnabled: boolean;
  autoCheckUpdates: boolean;
  lastUpdateCheck?: string;
  updateStatus?: string;
  appVersion: string;
}

export interface ReminderLogEntry {
  id: string;
  memberId: string;
  memberName: string;
  channel: 'whatsapp' | 'sms' | 'desktop_notification' | 'copy';
  tier: 'expiring_soon' | 'due_today' | 'overdue' | 'balance_due';
  sentAt: string;
  balanceInr: number;
  dueDate?: string;
  sentByUsername: string;
  messagePreview: string;
}

export interface SmartReminderCandidate {
  member: Member;
  membership?: MemberMembership;
  tier: 'overdue' | 'due_today' | 'expiring_soon' | 'balance_due';
  daysRemaining?: number;
  balanceInr: number;
  dueDate?: string;
  urgencyScore: number;
  lastRemindedAt?: string;
}

export interface TailscaleState {
  nodeName: string;
  tailnetIp: string;
  tailnetDomain: string;
  port: number;
  isServing: boolean;
  activeSessions: {
    deviceId: string;
    deviceName: string;
    username: string;
    lastSeen: string;
    ip: string;
  }[];
}

export interface UpgradeModulesConfig {
  multiBranchEnabled: boolean;
  gstInvoicingEnabled: boolean;
  biometricGateEnabled: boolean;
  trainerPayrollEnabled: boolean;
}

export interface RuntimeInfo {
  runtime: 'electron' | 'server';
  sqlitePath: string;
  backupsDir: string;
  recoveryDir: string;
  walEnabled: boolean;
  legacyMigrationCompleted?: boolean;
}

export interface GymDatabase {
  version: number;
  dbPath: string;
  users: User[];
  plans: MembershipPlan[];
  members: Member[];
  memberships: MemberMembership[];
  payments: PaymentRecord[];
  checkIns: CheckInRecord[];
  activityLogs: ActivityLogEntry[];
  backupConfig: BackupConfig;
  tailscale: TailscaleState;
  upgradeModules?: UpgradeModulesConfig;
  reminderLogs?: ReminderLogEntry[];
  backupHistory?: BackupArchiveRecord[];
  desktopSettings?: DesktopSettings;
  integrityReport?: IntegrityReport;
  runtimeInfo?: RuntimeInfo;
}
