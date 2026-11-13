import {
  User,
  Member,
  MembershipPlan,
  MemberMembership,
  PaymentRecord,
  CheckInRecord,
  ActivityLogEntry,
  BackupConfig,
  TailscaleState,
  UserRole,
  AdminPermissions,
  GymDatabase,
  DesktopSettings,
  IntegrityReport,
  BackupArchiveRecord,
  SmartReminderCandidate,
  ReminderLogEntry,
} from '../types/gym';
import {
  FULL_ADMIN_PERMISSIONS,
  ZERO_PERMISSIONS,
  OWNER_DEFAULT_PERMISSIONS,
  OPERATIONS_ADMIN_PERMISSIONS,
  MANAGER_DEFAULT_PERMISSIONS,
  ACCOUNTANT_DEFAULT_PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  RECEPTIONIST_DEFAULT_PERMISSIONS,
  DEFAULT_PLANS,
  getDefaultPermissionsForRole,
  isAdminRole,
  isSuperAdminRole,
  getEffectivePermissions,
  hasPermission,
  getRoleLabel,
} from '../../shared/permissions';
import { generateRandomBackupKey, encryptSqliteBackup } from './crypto';

export {
  FULL_ADMIN_PERMISSIONS,
  ZERO_PERMISSIONS,
  OWNER_DEFAULT_PERMISSIONS,
  OPERATIONS_ADMIN_PERMISSIONS,
  MANAGER_DEFAULT_PERMISSIONS,
  ACCOUNTANT_DEFAULT_PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  RECEPTIONIST_DEFAULT_PERMISSIONS,
  getDefaultPermissionsForRole,
  isAdminRole,
  isSuperAdminRole,
  getEffectivePermissions,
  hasPermission,
  getRoleLabel,
};

const LEGACY_STORAGE_KEYS = [
  'flex_flow_gym_sqlite_prod_v1',
  'flex_flow_gym_sqlite_v1',
];
const MIGRATED_FLAG_KEY = 'flex_flow_sqlite_migrated_v1';
const LEGACY_ARCHIVE_KEY = 'flex_flow_legacy_pre_sqlite_archive_v1';
const AUTH_TOKEN_KEY = 'flex_flow_sqlite_session_token';

function getApiBase(): string {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.apiBaseUrl) {
    return (window as any).electronAPI.apiBaseUrl;
  }
  return '';
}

function createEmptyShellDatabase(): GymDatabase {
  return {
    version: 2,
    dbPath: '%APPDATA%\\Flex & Flow\\gym.sqlite',
    users: [],
    plans: [...DEFAULT_PLANS],
    members: [],
    memberships: [],
    payments: [],
    checkIns: [],
    activityLogs: [],
    backupConfig: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: '',
      smtpPassword: '',
      senderEmail: '',
      recipientEmail: '',
      backupEncryptionKey: generateRandomBackupKey(),
      initialDelayMinutes: 5,
      intervalHours: 24,
      autoBackupEnabled: true,
    },
    tailscale: {
      nodeName: 'gym-desktop-win11',
      tailnetIp: '100.64.0.1',
      tailnetDomain: 'gym-console.ts.net',
      port: 3000,
      isServing: false,
      activeSessions: [],
    },
    upgradeModules: {
      multiBranchEnabled: false,
      gstInvoicingEnabled: false,
      biometricGateEnabled: false,
      trainerPayrollEnabled: false,
    },
    reminderLogs: [],
    backupHistory: [],
    desktopSettings: {
      minimizeToTray: true,
      launchAtStartup: false,
      desktopNotificationsEnabled: true,
      autoCheckUpdates: true,
      appVersion: '2.0.0',
    },
  };
}

export interface LegacyMigrationState {
  status: 'none' | 'auto_migrated' | 'needs_confirmation' | 'dismissed';
  message?: string;
  legacyCounts?: { members: number; memberships: number; payments: number };
  sqliteCounts?: { members: number; memberships: number; payments: number };
  legacyPayload?: GymDatabase;
  safetyBackupFile?: string;
}

class DatabaseService {
  private db: GymDatabase;
  private currentUser: User | null = null;
  private sessionToken: string | null = null;
  private listeners: (() => void)[] = [];
  private smartReminders: SmartReminderCandidate[] = [];
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private syncQueue: Promise<void> = Promise.resolve();
  private lastBackendError: string | null = null;
  private migrationState: LegacyMigrationState = { status: 'none' };

  constructor() {
    this.db = createEmptyShellDatabase();
    try {
      this.sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      this.sessionToken = null;
    }
    void this.init();
  }

  public init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.bootstrapFromSqlite();
    return this.initPromise;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getLastError(): string | null {
    return this.lastBackendError;
  }

  public clearLastError(): void {
    this.lastBackendError = null;
    this.emit();
  }

  public getMigrationState(): LegacyMigrationState {
    return this.migrationState;
  }

  public getSmartReminders(): SmartReminderCandidate[] {
    return this.smartReminders;
  }

  public getSessionToken(): string | null {
    return this.sessionToken;
  }

  private async apiRequest<T = any>(
    path: string,
    options: { method?: string; body?: any } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.sessionToken) {
      headers.Authorization = `Bearer ${this.sessionToken}`;
    }

    const res = await fetch(`${getApiBase()}/api${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok && !data?.error && !data?.message) {
      throw new Error(`Server error (${res.status})`);
    }
    return data as T;
  }

  private enqueueWrite(task: () => Promise<void>): void {
    this.syncQueue = this.syncQueue
      .then(task)
      .catch((err) => {
        console.error('SQLite sync error:', err);
        this.lastBackendError = err?.message || 'SQLite persistence failed.';
        this.emit();
      });
  }

  private applyServerSnapshot(db: GymDatabase, reminders?: SmartReminderCandidate[]): void {
    this.db = db;
    if (reminders) {
      this.smartReminders = reminders;
    } else {
      this.smartReminders = this.computeLocalSmartReminders(db);
    }
    if (this.currentUser) {
      const refreshedUser = db.users.find((u) => u.id === this.currentUser!.id) || null;
      this.currentUser = refreshedUser;
    }
    this.emit();
  }

  private computeLocalSmartReminders(db: GymDatabase): SmartReminderCandidate[] {
    const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
    const dayMs = 86400000;
    const list: SmartReminderCandidate[] = [];

    for (const member of db.members) {
      if (member.status === 'frozen') continue;
      const memberMemberships = db.memberships.filter(
        (m) => m.memberId === member.id && m.status !== 'cancelled'
      );
      const totalBilled = memberMemberships.reduce((s, m) => s + m.totalPriceInr, 0);
      const totalPaid = db.payments
        .filter((p) => p.memberId === member.id && !p.isVoided)
        .reduce((s, p) => s + p.amountInr, 0);
      const balanceInr = Math.max(0, totalBilled - totalPaid);
      const latestMembership = memberMemberships
        .slice()
        .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
      const lastRemindedAt = (db.reminderLogs || []).find((r) => r.memberId === member.id)?.sentAt;

      let tier: SmartReminderCandidate['tier'] | null = null;
      let daysRemaining: number | undefined;
      let urgencyScore = 0;

      if (latestMembership) {
        daysRemaining = Math.round(
          (new Date(latestMembership.endDate).getTime() - todayMs) / dayMs
        );
        if (daysRemaining < 0 || member.status === 'expired') {
          tier = 'overdue';
          urgencyScore = 100 + Math.abs(daysRemaining);
        } else if (daysRemaining === 0) {
          tier = 'due_today';
          urgencyScore = 90;
        } else if (daysRemaining <= 7) {
          tier = 'expiring_soon';
          urgencyScore = 75 - daysRemaining * 5;
        }
      }

      if (!tier && (balanceInr > 0 || member.status === 'pending_renewal')) {
        tier = member.status === 'pending_renewal' ? 'due_today' : 'balance_due';
        urgencyScore = balanceInr > 0 ? 60 : 50;
      }

      if (tier) {
        if (balanceInr > 0) urgencyScore += 15;
        list.push({
          member,
          membership: latestMembership,
          tier,
          daysRemaining,
          balanceInr,
          dueDate: latestMembership?.endDate,
          urgencyScore,
          lastRemindedAt,
        });
      }
    }
    return list.sort((a, b) => b.urgencyScore - a.urgencyScore);
  }

  private readLegacyLocalStorage(): GymDatabase | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      if (localStorage.getItem(MIGRATED_FLAG_KEY) === 'true') return null;

      for (const key of LEGACY_STORAGE_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as GymDatabase;
        if (parsed && Array.isArray(parsed.members) && Array.isArray(parsed.users)) {
          const hasOperationalData =
            parsed.members.length > 0 ||
            (parsed.memberships?.length || 0) > 0 ||
            (parsed.payments?.length || 0) > 0 ||
            (parsed.checkIns?.length || 0) > 0;
          if (hasOperationalData) {
            return parsed;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private async bootstrapFromSqlite(): Promise<void> {
    try {
      const boot = await this.apiRequest<{
        success: boolean;
        db: GymDatabase;
        currentUser: User | null;
        reminders: SmartReminderCandidate[];
      }>('/bootstrap');

      if (boot.currentUser) {
        this.currentUser = boot.currentUser;
      } else if (this.sessionToken) {
        this.sessionToken = null;
        try {
          sessionStorage.removeItem(AUTH_TOKEN_KEY);
        } catch {}
      }
      this.applyServerSnapshot(boot.db, boot.reminders);

      // Safe localStorage -> SQLite migration check
      const legacy = this.readLegacyLocalStorage();
      if (legacy) {
        const inspect = await this.apiRequest<{
          sqliteHasData: boolean;
          sqliteCounts: { members: number; memberships: number; payments: number };
          legacyCounts: { members: number; memberships: number; payments: number };
        }>('/migrate/inspect', {
          method: 'POST',
          body: { legacyDb: legacy },
        });

        if (!inspect.sqliteHasData) {
          // Safe automatic migration into empty SQLite with verified safety snapshot
          localStorage.setItem(LEGACY_ARCHIVE_KEY, JSON.stringify(legacy));
          const migRes = await this.apiRequest<any>('/migrate/localstorage', {
            method: 'POST',
            body: { legacyDb: legacy, mode: 'auto_if_empty' },
          });
          if (migRes.success && migRes.db) {
            localStorage.setItem(MIGRATED_FLAG_KEY, 'true');
            for (const key of LEGACY_STORAGE_KEYS) {
              localStorage.removeItem(key);
            }
            this.applyServerSnapshot(migRes.db);
            this.migrationState = {
              status: 'auto_migrated',
              message: migRes.message,
              safetyBackupFile: migRes.safetyBackup?.fileName,
              legacyCounts: inspect.legacyCounts,
            };
          }
        } else {
          // Never overwrite existing SQLite data without confirmation + verified backup
          this.migrationState = {
            status: 'needs_confirmation',
            message: `Found ${inspect.legacyCounts.members} members and ${inspect.legacyCounts.payments} payments in legacy browser storage while SQLite already has ${inspect.sqliteCounts.members} members.`,
            legacyCounts: inspect.legacyCounts,
            sqliteCounts: inspect.sqliteCounts,
            legacyPayload: legacy,
          };
        }
      }
    } catch (err: any) {
      console.error('Failed to bootstrap SQLite backend:', err);
      this.lastBackendError =
        err?.message || 'Unable to connect to local SQLite backend on port 3000.';
    } finally {
      this.ready = true;
      this.emit();
    }
  }

  public async confirmLegacyMigration(
    action: 'merge' | 'replace' | 'dismiss'
  ): Promise<{ success: boolean; message: string }> {
    if (action === 'dismiss') {
      try {
        localStorage.setItem(MIGRATED_FLAG_KEY, 'true');
      } catch {}
      this.migrationState = { status: 'dismissed' };
      this.emit();
      return { success: true, message: 'Migration prompt dismissed.' };
    }

    const legacy = this.migrationState.legacyPayload;
    if (!legacy) {
      return { success: false, message: 'No legacy localStorage snapshot found.' };
    }

    try {
      localStorage.setItem(LEGACY_ARCHIVE_KEY, JSON.stringify(legacy));
      const res = await this.apiRequest<any>('/migrate/localstorage', {
        method: 'POST',
        body: { legacyDb: legacy, mode: action },
      });
      if (res.success && res.db) {
        localStorage.setItem(MIGRATED_FLAG_KEY, 'true');
        for (const key of LEGACY_STORAGE_KEYS) {
          localStorage.removeItem(key);
        }
        this.applyServerSnapshot(res.db);
        this.migrationState = {
          status: 'auto_migrated',
          message: res.message,
          safetyBackupFile: res.safetyBackup?.fileName,
        };
        this.emit();
        return { success: true, message: res.message };
      }
      return { success: false, message: res.message || 'Migration failed.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Migration request failed.' };
    }
  }

  public async refreshFromBackend(): Promise<void> {
    const boot = await this.apiRequest<any>('/bootstrap');
    if (boot?.db) {
      this.applyServerSnapshot(boot.db, boot.reminders);
    }
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  private notify(): void {
    this.smartReminders = this.computeLocalSmartReminders(this.db);
    this.emit();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public getDb(): GymDatabase {
    return this.db;
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  // ==================== AUTH & ACCOUNTS ====================

  public async authenticateAsync(
    username: string,
    passwordPlain: string
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await this.apiRequest<any>('/auth/login', {
        method: 'POST',
        body: { username, password: passwordPlain },
      });
      if (!res.success || !res.user || !res.token) {
        return { success: false, error: res.error || 'Authentication failed.' };
      }
      this.sessionToken = res.token;
      this.currentUser = res.user;
      try {
        sessionStorage.setItem(AUTH_TOKEN_KEY, res.token);
      } catch {}
      if (res.db) this.applyServerSnapshot(res.db);
      else this.emit();
      return { success: true, user: res.user };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Authentication request failed.' };
    }
  }

  public signOut(): void {
    const tok = this.sessionToken;
    this.currentUser = null;
    this.sessionToken = null;
    try {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {}
    this.emit();
    if (tok) {
      void fetch(`${getApiBase()}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
        },
      }).catch(() => {});
    }
  }

  public async createUserAccountAsync(params: {
    username: string;
    fullName: string;
    passwordPlain: string;
    role: UserRole;
  }): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const res = await this.apiRequest<any>('/auth/create-user', {
        method: 'POST',
        body: params,
      });
      if (res.db) this.applyServerSnapshot(res.db);
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create account.' };
    }
  }

  public createUserAccount(params: {
    username: string;
    fullName: string;
    passwordPlain: string;
    role: UserRole;
  }): { success: boolean; user?: User; error?: string } {
    if (params.role === 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only one Super Admin account is permitted on this system.',
      };
    }
    const isBasicStaffRole = params.role === 'staff' || params.role === 'receptionist';
    if (this.currentUser && this.currentUser.role !== 'super_admin' && !isBasicStaffRole) {
      return {
        success: false,
        error: 'Restricted: Only Super Admin can create privileged Admin, Owner, Manager, or Finance roles.',
      };
    }
    const minLen = isBasicStaffRole ? 8 : 10;
    if (params.passwordPlain.length < minLen) {
      return {
        success: false,
        error: `${getRoleLabel(params.role)} password must be at least ${minLen} characters long.`,
      };
    }
    if (
      this.db.users.some((u) => u.username.toLowerCase() === params.username.trim().toLowerCase())
    ) {
      return { success: false, error: 'Username is already taken.' };
    }

    const tempUser: User = {
      id: `usr-${params.role}-${Date.now()}`,
      username: params.username.trim(),
      fullName: params.fullName.trim() || params.username.trim(),
      role: params.role,
      passwordHash: 'scrypt:protected',
      emailVerified: false,
      createdAt: new Date().toISOString(),
      permissions: getDefaultPermissionsForRole(params.role),
    };
    this.db.users.push(tempUser);
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/auth/create-user', {
        method: 'POST',
        body: params,
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) {
        this.lastBackendError = res.error;
        await this.refreshFromBackend();
      }
    });

    return { success: true, user: tempUser };
  }

  public updateUserRole(
    userId: string,
    newRole: UserRole,
    applyRoleDefaults: boolean = true
  ): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only Super Admin accounts can change user roles.',
      };
    }
    if (newRole === 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only one Super Admin account is permitted on this system.',
      };
    }
    const target = this.db.users.find((u) => u.id === userId);
    if (!target) return { success: false, error: 'Target account not found.' };
    if (target.id === this.currentUser.id) {
      return { success: false, error: 'Cannot downgrade your own active Super Admin session.' };
    }

    target.role = newRole;
    if (applyRoleDefaults) {
      target.permissions = getDefaultPermissionsForRole(newRole);
    }
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/users/update-role', {
        method: 'POST',
        body: { userId, newRole, applyRoleDefaults },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) this.lastBackendError = res.error;
    });

    return { success: true };
  }

  public updateUserPermissions(
    userId: string,
    permissions: Partial<AdminPermissions>
  ): { success: boolean; error?: string } {
    if (this.currentUser?.role !== 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only Super Admin accounts can modify account permissions.',
      };
    }
    const target = this.db.users.find((u) => u.id === userId);
    if (!target) return { success: false, error: 'Target account not found.' };
    if (target.role === 'super_admin') {
      return {
        success: false,
        error: 'Super Admin accounts inherently hold unrestricted permissions.',
      };
    }

    target.permissions = {
      ...getEffectivePermissions(target),
      ...permissions,
    };
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/users/update-permissions', {
        method: 'POST',
        body: { userId, permissions },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) this.lastBackendError = res.error;
    });

    return { success: true };
  }

  public deleteUserAccount(userId: string): { success: boolean; error?: string } {
    if (this.currentUser?.id === userId) {
      return { success: false, error: 'You cannot delete the currently signed-in account.' };
    }
    const target = this.db.users.find((u) => u.id === userId);
    if (!target) return { success: false, error: 'Account not found.' };
    const adminUsers = this.db.users.filter((u) => isAdminRole(u.role));
    if (isAdminRole(target.role) && adminUsers.length <= 1) {
      return {
        success: false,
        error: 'At least one admin/owner account must remain in the database.',
      };
    }
    if (target.role === 'super_admin') {
      return { success: false, error: 'Cannot delete the last remaining Super Admin account.' };
    }

    this.db.users = this.db.users.filter((u) => u.id !== userId);
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/users/delete', {
        method: 'POST',
        body: { userId },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) {
        this.lastBackendError = res.error;
        await this.refreshFromBackend();
      }
    });

    return { success: true };
  }

  public async performLocalRecoveryAsync(
    newPasswordPlain: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiRequest<any>('/auth/recover-local', {
        method: 'POST',
        body: { newPasswordPlain },
      });
      if (res.success) {
        this.signOut();
        if (res.db) this.applyServerSnapshot(res.db);
      }
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Recovery failed.' };
    }
  }

  public async resetPasswordViaEmailAsync(
    email: string,
    code: string,
    newPasswordPlain: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiRequest<any>('/auth/recover-email', {
        method: 'POST',
        body: { email, code, newPasswordPlain },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Email recovery failed.' };
    }
  }

  public verifyAccountEmail(userId: string, email: string): { success: boolean; error?: string } {
    const user = this.db.users.find((u) => u.id === userId);
    if (!user) return { success: false, error: 'User not found' };
    user.recoveryEmail = email.trim();
    user.emailVerified = true;
    if (this.currentUser?.id === userId) {
      this.currentUser = { ...user };
    }
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/auth/verify-email', {
        method: 'POST',
        body: { userId, email },
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return { success: true };
  }

  // ==================== MEMBERS, PLANS, MEMBERSHIPS, PAYMENTS ====================

  public addMember(memberData: Omit<Member, 'id' | 'memberNumber'>): Member {
    const maxNum = this.db.members.reduce((max, m) => {
      const match = m.memberNumber.match(/(\d+)$/);
      const num = match ? parseInt(match[1], 10) : 1000;
      return Math.max(max, num);
    }, 1000);
    const newMember: Member = {
      ...memberData,
      id: `mem-${Date.now()}`,
      memberNumber: `FF-${maxNum + 1}`,
    };

    this.db.members.unshift(newMember);
    this.logActivity({
      actionType: 'create_member',
      targetType: 'member',
      targetId: newMember.id,
      targetName: newMember.fullName,
      description: `Added new member ${newMember.fullName} (${newMember.memberNumber}).`,
      isReversible: true,
      snapshotBefore: null,
      snapshotAfter: newMember,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/members/add', {
        method: 'POST',
        body: memberData,
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) this.lastBackendError = res.error;
    });

    return newMember;
  }

  public updateMember(id: string, updates: Partial<Member>): Member | null {
    const idx = this.db.members.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    const oldMember = { ...this.db.members[idx] };
    this.db.members[idx] = { ...this.db.members[idx], ...updates };

    this.logActivity({
      actionType: 'update_member',
      targetType: 'member',
      targetId: id,
      targetName: this.db.members[idx].fullName,
      description: `Updated member profile details for ${this.db.members[idx].fullName}.`,
      isReversible: true,
      snapshotBefore: oldMember,
      snapshotAfter: this.db.members[idx],
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/members/update', {
        method: 'POST',
        body: { id, updates },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) this.lastBackendError = res.error;
    });

    return this.db.members[idx];
  }

  public deleteMember(id: string): { success: boolean; error?: string } {
    const hasMemberships = this.db.memberships.some((m) => m.memberId === id);
    const hasPayments = this.db.payments.some((p) => p.memberId === id);
    if (hasMemberships || hasPayments) {
      return {
        success: false,
        error:
          'Safety restriction: This member has active financial or membership history and cannot be deleted. Consider freezing their account instead.',
      };
    }
    const member = this.db.members.find((m) => m.id === id);
    if (!member) return { success: false, error: 'Member not found.' };

    this.db.members = this.db.members.filter((m) => m.id !== id);
    this.db.checkIns = this.db.checkIns.filter((c) => c.memberId !== id);
    this.logActivity({
      actionType: 'delete_member',
      targetType: 'member',
      targetId: id,
      targetName: member.fullName,
      description: `Deleted empty member record ${member.fullName} (${member.memberNumber}).`,
      isReversible: true,
      snapshotBefore: member,
      snapshotAfter: null,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/members/delete', {
        method: 'POST',
        body: { id },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) {
        this.lastBackendError = res.error;
        await this.refreshFromBackend();
      }
    });

    return { success: true };
  }

  public createPlan(planData: Omit<MembershipPlan, 'id'>): MembershipPlan {
    const newPlan: MembershipPlan = { ...planData, id: `plan-${Date.now()}` };
    this.db.plans.push(newPlan);
    this.logActivity({
      actionType: 'create_plan',
      targetType: 'plan',
      targetId: newPlan.id,
      targetName: newPlan.name,
      description: `Created membership plan "${newPlan.name}" (₹${newPlan.priceInr.toLocaleString('en-IN')} / ${newPlan.durationDays} days).`,
      isReversible: true,
      snapshotBefore: null,
      snapshotAfter: newPlan,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/plans/create', {
        method: 'POST',
        body: planData,
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return newPlan;
  }

  public deletePlan(planId: string): { success: boolean; error?: string } {
    const plan = this.db.plans.find((p) => p.id === planId);
    if (!plan) return { success: false, error: 'Membership plan not found.' };

    const hasEnrollments = this.db.memberships.some((m) => m.planId === planId);
    this.db.plans = this.db.plans.filter((p) => p.id !== planId);
    this.logActivity({
      actionType: 'delete_plan',
      targetType: 'plan',
      targetId: plan.id,
      targetName: plan.name,
      description: `Deleted membership plan "${plan.name}" (₹${plan.priceInr.toLocaleString('en-IN')}).`,
      isReversible: !hasEnrollments,
      snapshotBefore: plan,
      snapshotAfter: null,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/plans/delete', {
        method: 'POST',
        body: { planId },
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return { success: true };
  }

  public assignMembership(
    memberId: string,
    planId: string,
    startDateStr?: string
  ): MemberMembership {
    const plan = this.db.plans.find((p) => p.id === planId) || this.db.plans[0];
    const member = this.db.members.find((m) => m.id === memberId);

    const start = startDateStr ? new Date(startDateStr) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.durationDays);

    const newMembership: MemberMembership = {
      id: `mship-${Date.now()}`,
      memberId,
      planId: plan.id,
      planName: plan.name,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      totalPriceInr: plan.priceInr,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    if (member && (member.status === 'expired' || member.status === 'pending_renewal')) {
      member.status = 'active';
    }
    this.db.memberships.unshift(newMembership);
    this.logActivity({
      actionType: 'assign_membership',
      targetType: 'membership',
      targetId: newMembership.id,
      targetName: `${plan.name} (${member?.fullName || 'Member'})`,
      description: `Assigned plan "${plan.name}" (₹${plan.priceInr}) to ${member?.fullName || 'member'}.`,
      isReversible: true,
      snapshotBefore: null,
      snapshotAfter: newMembership,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/memberships/assign', {
        method: 'POST',
        body: { memberId, planId, startDateStr },
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return newMembership;
  }

  public deleteMembership(membershipId: string): { success: boolean; error?: string } {
    const membership = this.db.memberships.find((m) => m.id === membershipId);
    if (!membership) return { success: false, error: 'Enrollment record not found.' };
    const hasValidPayment = this.db.payments.some(
      (p) => p.membershipId === membershipId && !p.isVoided
    );
    if (hasValidPayment) {
      return {
        success: false,
        error:
          'Safety restriction: A valid payment is linked to this enrollment. Void the payment first before deleting.',
      };
    }

    const member = this.db.members.find((m) => m.id === membership.memberId);
    this.db.memberships = this.db.memberships.filter((m) => m.id !== membershipId);
    this.logActivity({
      actionType: 'delete_membership',
      targetType: 'membership',
      targetId: membership.id,
      targetName: `${membership.planName} (${member?.fullName || 'Member'})`,
      description: `Deleted enrollment "${membership.planName}" for ${member?.fullName || 'member'}.`,
      isReversible: true,
      snapshotBefore: membership,
      snapshotAfter: null,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/memberships/delete', {
        method: 'POST',
        body: { membershipId },
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return { success: true };
  }

  public recordPayment(params: {
    memberId: string;
    membershipId?: string;
    amountInr: number;
    method: 'UPI' | 'Cash' | 'Bank Transfer' | 'Cheque' | 'POS Card';
    referenceNumber: string;
    notes?: string;
  }): PaymentRecord {
    const member = this.db.members.find((m) => m.id === params.memberId);
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = Math.floor(1000 + Math.random() * 9000);

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      paymentNumber: `RCPT-${datePrefix}-${randSuffix}`,
      memberId: params.memberId,
      membershipId: params.membershipId,
      amountInr: params.amountInr,
      method: params.method,
      referenceNumber:
        params.referenceNumber.trim() || `OFFLINE-${Date.now().toString().slice(-6)}`,
      paymentDate: new Date().toISOString(),
      recordedByUserId: this.currentUser?.id || 'usr-system',
      recordedByUsername: this.currentUser?.username || 'system',
      isVoided: false,
      notes: params.notes,
    };

    this.db.payments.unshift(newPayment);
    this.logActivity({
      actionType: 'record_payment',
      targetType: 'payment',
      targetId: newPayment.id,
      targetName: newPayment.paymentNumber,
      description: `Recorded external payment of ₹${params.amountInr.toLocaleString('en-IN')} (${params.method}) for ${member?.fullName || 'member'}.`,
      isReversible: true,
      snapshotBefore: null,
      snapshotAfter: newPayment,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/payments/record', {
        method: 'POST',
        body: params,
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return newPayment;
  }

  public voidPayment(paymentId: string, voidReason: string): { success: boolean; error?: string } {
    const payment = this.db.payments.find((p) => p.id === paymentId);
    if (!payment) return { success: false, error: 'Payment record not found.' };
    if (payment.isVoided) return { success: false, error: 'Payment is already voided.' };

    payment.isVoided = true;
    payment.voidReason = voidReason;
    payment.voidedAt = new Date().toISOString();
    payment.voidedByUserId = this.currentUser?.id;

    const member = this.db.members.find((m) => m.id === payment.memberId);
    this.logActivity({
      actionType: 'void_payment',
      targetType: 'payment',
      targetId: payment.id,
      targetName: payment.paymentNumber,
      description: `Voided payment ${payment.paymentNumber} of ₹${payment.amountInr.toLocaleString('en-IN')} for ${member?.fullName || 'member'}. Reason: ${voidReason}`,
      isReversible: false,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/payments/void', {
        method: 'POST',
        body: { paymentId, voidReason },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) {
        this.lastBackendError = res.error;
        await this.refreshFromBackend();
      }
    });

    return { success: true };
  }

  public deletePayment(paymentId: string): { success: boolean; error?: string } {
    const payment = this.db.payments.find((p) => p.id === paymentId);
    if (!payment) return { success: false, error: 'Payment record not found.' };
    if (!payment.isVoided) {
      return {
        success: false,
        error: 'Audit restriction: Void this payment first before deleting it from the ledger.',
      };
    }

    const member = this.db.members.find((m) => m.id === payment.memberId);
    this.db.payments = this.db.payments.filter((p) => p.id !== paymentId);
    this.logActivity({
      actionType: 'delete_payment',
      targetType: 'payment',
      targetId: payment.id,
      targetName: payment.paymentNumber,
      description: `Deleted voided payment voucher ${payment.paymentNumber} (₹${payment.amountInr.toLocaleString('en-IN')}) for ${member?.fullName || 'member'}.`,
      isReversible: false,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/payments/delete', {
        method: 'POST',
        body: { paymentId },
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return { success: true };
  }

  public recordCheckIn(memberId: string): { success: boolean; checkIn?: CheckInRecord; error?: string } {
    const member = this.db.members.find((m) => m.id === memberId);
    if (!member) return { success: false, error: 'Member not found.' };

    const newCheckIn: CheckInRecord = {
      id: `chk-${Date.now()}`,
      memberId: member.id,
      memberName: member.fullName,
      checkInTime: new Date().toISOString(),
      recordedByUsername: this.currentUser?.username || 'reception',
    };
    this.db.checkIns.unshift(newCheckIn);
    this.logActivity({
      actionType: 'member_checkin',
      targetType: 'checkin',
      targetId: newCheckIn.id,
      targetName: member.fullName,
      description: `Member ${member.fullName} checked in for workout.`,
      isReversible: false,
    });
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/checkins/record', {
        method: 'POST',
        body: { memberId },
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });

    return { success: true, checkIn: newCheckIn };
  }

  private logActivity(
    entry: Omit<ActivityLogEntry, 'id' | 'timestamp' | 'userId' | 'username' | 'role'>
  ): void {
    const newLog: ActivityLogEntry = {
      ...entry,
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId: this.currentUser?.id || 'usr-system',
      username: this.currentUser?.username || 'system',
      role: this.currentUser?.role || 'staff',
    };
    this.db.activityLogs.unshift(newLog);
  }

  public canUndoAction(logId: string): { canUndo: boolean; reason?: string } {
    const log = this.db.activityLogs.find((l) => l.id === logId);
    if (!log) return { canUndo: false, reason: 'Log entry not found.' };
    if (!log.isReversible) return { canUndo: false, reason: 'This system action is not reversible.' };
    if (log.isReversed) return { canUndo: false, reason: 'This action has already been reversed.' };

    if (log.actionType === 'record_payment') {
      const payment = this.db.payments.find((p) => p.id === log.targetId);
      if (!payment) return { canUndo: false, reason: 'Payment record no longer exists.' };
      if (payment.isVoided) return { canUndo: false, reason: 'Payment is already voided.' };
      return { canUndo: true };
    }
    if (log.actionType === 'create_member') {
      const hasMemberships = this.db.memberships.some((m) => m.memberId === log.targetId);
      const hasPayments = this.db.payments.some((p) => p.memberId === log.targetId);
      if (hasMemberships || hasPayments) {
        return {
          canUndo: false,
          reason: 'Cannot reverse: Member has subsequent active membership or payment records.',
        };
      }
      return { canUndo: true };
    }
    if (log.actionType === 'assign_membership') {
      const membership = this.db.memberships.find((m) => m.id === log.targetId);
      if (!membership) return { canUndo: false, reason: 'Membership record not found.' };
      const hasPayment = this.db.payments.some(
        (p) => p.membershipId === log.targetId && !p.isVoided
      );
      if (hasPayment) {
        return {
          canUndo: false,
          reason: 'Cannot reverse: A payment has already been credited towards this membership.',
        };
      }
      return { canUndo: true };
    }
    if (log.actionType === 'update_member') return { canUndo: true };
    if (log.actionType === 'delete_plan' && log.snapshotBefore) return { canUndo: true };
    if (log.actionType === 'delete_membership' && log.snapshotBefore) return { canUndo: true };
    if (log.actionType === 'delete_member' && log.snapshotBefore) return { canUndo: true };

    return { canUndo: false, reason: 'Action is not safe to reverse automatically.' };
  }

  public undoAction(logId: string): { success: boolean; error?: string } {
    const check = this.canUndoAction(logId);
    if (!check.canUndo) return { success: false, error: check.reason };

    const log = this.db.activityLogs.find((l) => l.id === logId)!;
    log.isReversed = true;
    this.notify();

    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/activity/undo', {
        method: 'POST',
        body: { logId },
      });
      if (res.db) this.applyServerSnapshot(res.db);
      if (!res.success) {
        this.lastBackendError = res.error;
        await this.refreshFromBackend();
      }
    });

    return { success: true };
  }

  public getMemberFinancialSummary(memberId: string): {
    totalBilledInr: number;
    totalPaidInr: number;
    outstandingBalanceInr: number;
    activeMembership?: MemberMembership;
    lastPaymentDate?: string;
  } {
    const memberships = this.db.memberships.filter(
      (m) => m.memberId === memberId && m.status !== 'cancelled'
    );
    const totalBilledInr = memberships.reduce((sum, m) => sum + m.totalPriceInr, 0);
    const validPayments = this.db.payments.filter((p) => p.memberId === memberId && !p.isVoided);
    const totalPaidInr = validPayments.reduce((sum, p) => sum + p.amountInr, 0);
    const outstandingBalanceInr = Math.max(0, totalBilledInr - totalPaidInr);
    const activeMembership = memberships.find((m) => m.status === 'active');
    const lastPayment = validPayments[0];

    return {
      totalBilledInr,
      totalPaidInr,
      outstandingBalanceInr,
      activeMembership,
      lastPaymentDate: lastPayment?.paymentDate,
    };
  }

  // ==================== SMART REMINDERS ====================

  public async logReminderSentAsync(params: {
    memberId: string;
    channel: ReminderLogEntry['channel'];
    tier: ReminderLogEntry['tier'];
    balanceInr: number;
    dueDate?: string;
    messagePreview: string;
  }): Promise<{ success: boolean }> {
    const res = await this.apiRequest<any>('/reminders/log', {
      method: 'POST',
      body: params,
    });
    if (res.db) this.applyServerSnapshot(res.db, res.reminders);
    return { success: Boolean(res.success) };
  }

  // ==================== GENUINE SQLITE BACKUPS, INTEGRITY & RESTORE ====================

  public async runIntegrityCheckAsync(): Promise<{
    success: boolean;
    report?: IntegrityReport;
    error?: string;
  }> {
    try {
      const res = await this.apiRequest<any>('/integrity/check', { method: 'POST' });
      if (res.db) this.applyServerSnapshot(res.db);
      return { success: Boolean(res.success), report: res.report };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Integrity check failed.' };
    }
  }

  public async downloadGenuineSqliteFile(): Promise<{ success: boolean; error?: string }> {
    try {
      const headers: Record<string, string> = {};
      if (this.sessionToken) headers.Authorization = `Bearer ${this.sessionToken}`;
      const res = await fetch(`${getApiBase()}/api/backups/export-sqlite`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData?.error || 'Export permission denied.' };
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gym-${new Date().toISOString().slice(0, 10)}.sqlite`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Download failed.' };
    }
  }

  public async createEncryptedBackupOnDiskAsync(): Promise<{
    success: boolean;
    record?: BackupArchiveRecord;
    error?: string;
  }> {
    try {
      const res = await this.apiRequest<any>('/backups/create', { method: 'POST' });
      if (res.db) this.applyServerSnapshot(res.db);
      return { success: Boolean(res.success), record: res.record, error: res.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create encrypted backup.' };
    }
  }

  public async downloadVaultBackupFile(record: BackupArchiveRecord): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.sessionToken) headers.Authorization = `Bearer ${this.sessionToken}`;
    const res = await fetch(`${getApiBase()}/api/backups/download/${record.id}`, { headers });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public async generateEncryptedBackupBlob(): Promise<{ blob: Blob; rawBytes: Uint8Array }> {
    const rawString = JSON.stringify(this.db, null, 2);
    const encrypted = await encryptSqliteBackup(rawString, this.db.backupConfig.backupEncryptionKey);
    const blob = new Blob([encrypted.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    return { blob, rawBytes: encrypted };
  }

  public async verifyBackupOnBackendAsync(params: {
    backupId?: string;
    encryptedBase64?: string;
    keyOverride?: string;
  }): Promise<{
    valid: boolean;
    error?: string;
    summary?: {
      memberCount: number;
      membershipCount: number;
      paymentCount: number;
      userCount: number;
      createdAt?: string;
      sqliteBinaryVerified: boolean;
      sha256Match: boolean;
    };
  }> {
    return this.apiRequest('/backups/verify', { method: 'POST', body: params });
  }

  public async restoreVerifiedBackupAsync(params: {
    backupId?: string;
    plainJsonString?: string;
    encryptedBase64?: string;
    keyOverride?: string;
    confirmed: boolean;
  }): Promise<{ success: boolean; error?: string; safetyBackup?: BackupArchiveRecord }> {
    const res = await this.apiRequest<any>('/backups/restore', {
      method: 'POST',
      body: params,
    });
    if (res.db) this.applyServerSnapshot(res.db);
    return res;
  }

  public updateBackupConfig(config: Partial<BackupConfig>): void {
    this.db.backupConfig = { ...this.db.backupConfig, ...config };
    this.notify();
    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/backups/config', {
        method: 'POST',
        body: config,
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });
  }

  public updateTailscaleStatus(status: Partial<TailscaleState>): void {
    this.db.tailscale = { ...this.db.tailscale, ...status };
    this.notify();
    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/tailscale/update', {
        method: 'POST',
        body: status,
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });
  }

  public revokeTailscaleSession(deviceId: string): void {
    this.db.tailscale.activeSessions = this.db.tailscale.activeSessions.filter(
      (s) => s.deviceId !== deviceId
    );
    this.notify();
    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/tailscale/revoke', {
        method: 'POST',
        body: { deviceId },
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });
  }

  public updateUpgradeModules(updates: Partial<NonNullable<GymDatabase['upgradeModules']>>): void {
    if (this.currentUser?.role !== 'super_admin') return;
    this.db.upgradeModules = {
      multiBranchEnabled: false,
      gstInvoicingEnabled: false,
      biometricGateEnabled: false,
      trainerPayrollEnabled: false,
      ...(this.db.upgradeModules || {}),
      ...updates,
    };
    this.notify();
    this.enqueueWrite(async () => {
      const res = await this.apiRequest<any>('/upgrades/update', {
        method: 'POST',
        body: updates,
      });
      if (res.db) this.applyServerSnapshot(res.db);
    });
  }

  public async updateDesktopSettingsAsync(
    updates: Partial<DesktopSettings>
  ): Promise<{ success: boolean; desktopSettings?: DesktopSettings }> {
    const res = await this.apiRequest<any>('/desktop/settings', {
      method: 'POST',
      body: updates,
    });
    if (res.db) this.applyServerSnapshot(res.db);
    return res;
  }

  public async checkForAppUpdatesAsync(): Promise<{ status: string; version?: string }> {
    const res = await this.apiRequest<any>('/desktop/check-updates', { method: 'POST' });
    if (res.db) this.applyServerSnapshot(res.db);
    return { status: res.status || 'Checked.', version: res.version };
  }

  public async triggerDesktopTestNotificationAsync(title?: string, body?: string): Promise<void> {
    if ((window as any).electronAPI?.showNotification) {
      await (window as any).electronAPI.showNotification(
        title || 'Flex & Flow Desktop Notification',
        body || 'Windows system tray & notifications are active.'
      );
      return;
    }
    await this.apiRequest('/desktop/notify-test', {
      method: 'POST',
      body: { title, body },
    });
  }

  public async clearAllDataForClientAsync(options?: {
    resetPlansToDefault?: boolean;
    clearNonSuperAdminUsers?: boolean;
    confirmed?: boolean;
  }): Promise<{ success: boolean; error?: string; safetyBackup?: BackupArchiveRecord }> {
    if (this.currentUser?.role !== 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only Super Admin can perform a production database clear.',
      };
    }
    const res = await this.apiRequest<any>('/admin/clear-all', {
      method: 'POST',
      body: { ...options, confirmed: options?.confirmed ?? true },
    });
    if (res.db) this.applyServerSnapshot(res.db);
    return res;
  }
}

export const dbService = new DatabaseService();
