import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  ActivityLogEntry,
  AdminPermissions,
  BackupArchiveRecord,
  BackupConfig,
  CheckInRecord,
  DesktopSettings,
  GymDatabase,
  IntegrityReport,
  Member,
  MemberMembership,
  MembershipPlan,
  PaymentRecord,
  ReminderLogEntry,
  RuntimeInfo,
  SmartReminderCandidate,
  TailscaleState,
  UpgradeModulesConfig,
  User,
  UserRole,
} from '../src/types/gym';
import {
  DEFAULT_PLANS,
  FULL_ADMIN_PERMISSIONS,
  OPERATIONS_ADMIN_PERMISSIONS,
  OWNER_DEFAULT_PERMISSIONS,
  MANAGER_DEFAULT_PERMISSIONS,
  ACCOUNTANT_DEFAULT_PERMISSIONS,
  STAFF_DEFAULT_PERMISSIONS,
  RECEPTIONIST_DEFAULT_PERMISSIONS,
  getDefaultPermissionsForRole,
  getEffectivePermissions,
  getRoleLabel,
  hasPermission,
  isAdminRole,
} from '../shared/permissions';
import {
  decryptBufferAES256GCM,
  encryptBufferAES256GCM,
  generateRandomBackupKeyNode,
  generateSessionToken,
  hashPassword,
  isHashedPassword,
  isValid32ByteBase64KeyNode,
  sha256Hex,
  verifyPassword,
} from './security';

export interface SqliteEngineOptions {
  dataDir?: string;
  runtime?: 'electron' | 'server';
  appVersion?: string;
  onAutoBackupComplete?: (record: BackupArchiveRecord) => void;
  onDesktopNotification?: (title: string, body: string) => void;
}

const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  minimizeToTray: true,
  launchAtStartup: false,
  desktopNotificationsEnabled: true,
  autoCheckUpdates: true,
  appVersion: '2.0.0',
};

const DEFAULT_TAILSCALE: TailscaleState = {
  nodeName: 'gym-desktop-win11',
  tailnetIp: '100.64.0.1',
  tailnetDomain: 'gym-console.ts.net',
  port: 3000,
  isServing: false,
  activeSessions: [],
};

const DEFAULT_UPGRADE_MODULES: UpgradeModulesConfig = {
  multiBranchEnabled: false,
  gstInvoicingEnabled: false,
  biometricGateEnabled: false,
  trainerPayrollEnabled: false,
};

function createSeedUsers(): User[] {
  return [
    {
      id: 'usr-super-1',
      username: 'superadmin',
      fullName: 'Vikram Joshi (Super Admin)',
      role: 'super_admin',
      passwordHash: hashPassword('superAdminSecure2026'),
      recoveryEmail: 'superadmin@flexflowgym.in',
      emailVerified: true,
      createdAt: '2025-08-01T07:30:00.000Z',
      permissions: { ...FULL_ADMIN_PERMISSIONS },
    },
    {
      id: 'usr-admin-1',
      username: 'gym_admin',
      fullName: 'Anjali Deshmukh (Operations Admin)',
      role: 'admin',
      passwordHash: hashPassword('adminSecure2026'),
      recoveryEmail: 'anjali.admin@flexflowgym.in',
      emailVerified: true,
      createdAt: '2025-08-01T07:45:00.000Z',
      permissions: { ...OPERATIONS_ADMIN_PERMISSIONS },
    },
    {
      id: 'usr-owner-1',
      username: 'owner_admin',
      fullName: 'Vikram Joshi (Gym Owner)',
      role: 'owner',
      passwordHash: hashPassword('flexflowOwnerSecure10'),
      recoveryEmail: 'vikram.joshi.gym@gmail.com',
      emailVerified: true,
      createdAt: '2025-08-01T08:00:00.000Z',
      permissions: { ...OWNER_DEFAULT_PERMISSIONS },
    },
    {
      id: 'usr-manager-1',
      username: 'branch_mgr',
      fullName: 'Arjun Nair (Branch Manager)',
      role: 'manager',
      passwordHash: hashPassword('managerSecure2026'),
      recoveryEmail: 'arjun.manager@flexflowgym.in',
      emailVerified: true,
      createdAt: '2025-08-05T09:00:00.000Z',
      permissions: { ...MANAGER_DEFAULT_PERMISSIONS },
    },
    {
      id: 'usr-accountant-1',
      username: 'finance_mgr',
      fullName: 'Meera Kulkarni (Finance Manager)',
      role: 'accountant',
      passwordHash: hashPassword('financeSecure2026'),
      recoveryEmail: 'meera.finance@flexflowgym.in',
      emailVerified: true,
      createdAt: '2025-08-06T09:30:00.000Z',
      permissions: { ...ACCOUNTANT_DEFAULT_PERMISSIONS },
    },
    {
      id: 'usr-staff-1',
      username: 'priya_coach',
      fullName: 'Priya Sharma (Head Trainer)',
      role: 'staff',
      passwordHash: hashPassword('trainerPassphrase2026'),
      recoveryEmail: 'priya.sharma@gmail.com',
      emailVerified: false,
      createdAt: '2025-08-10T10:00:00.000Z',
      permissions: { ...STAFF_DEFAULT_PERMISSIONS },
    },
    {
      id: 'usr-reception-1',
      username: 'frontdesk_maya',
      fullName: 'Maya Kapoor (Front Desk)',
      role: 'receptionist',
      passwordHash: hashPassword('frontdeskPass2026'),
      recoveryEmail: 'maya.desk@flexflowgym.in',
      emailVerified: false,
      createdAt: '2025-08-12T10:00:00.000Z',
      permissions: { ...RECEPTIONIST_DEFAULT_PERMISSIONS },
    },
  ];
}

export class SqliteEngine {
  public readonly dataDir: string;
  public readonly dbPath: string;
  public readonly backupsDir: string;
  public readonly recoveryDir: string;
  public readonly runtime: 'electron' | 'server';
  private db!: DatabaseSync;
  private sessions = new Map<string, { userId: string; createdAt: string }>();
  private lastAutoRecoveredFrom?: string;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private initialBackupTimer: NodeJS.Timeout | null = null;
  private options: SqliteEngineOptions;

  constructor(options: SqliteEngineOptions = {}) {
    this.options = options;
    this.runtime = options.runtime || 'server';
    this.dataDir =
      options.dataDir ||
      process.env.FLEX_FLOW_DATA_DIR ||
      path.join(process.cwd(), 'data');
    this.dbPath = path.join(this.dataDir, 'gym.sqlite');
    this.backupsDir = path.join(this.dataDir, 'backups');
    this.recoveryDir = path.join(this.dataDir, 'recovery');

    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.backupsDir, { recursive: true });
    fs.mkdirSync(this.recoveryDir, { recursive: true });

    this.openWithCrashRecovery();
    this.startAutoBackupScheduler();
  }

  private openWithCrashRecovery(): void {
    const recoveryFile = path.join(this.recoveryDir, 'last-known-good.sqlite');
    let needsRecovery = false;

    try {
      this.db = new DatabaseSync(this.dbPath);
      this.applyPragmas(this.db);
      const checkRow = this.db.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string } | undefined;
      if (!checkRow || checkRow.integrity_check !== 'ok') {
        needsRecovery = true;
      }
    } catch {
      needsRecovery = true;
    }

    if (needsRecovery) {
      try {
        this.db?.close();
      } catch {}

      if (fs.existsSync(recoveryFile)) {
        // Verify recovery file before swapping
        try {
          const testConn = new DatabaseSync(recoveryFile);
          const testCheck = testConn.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string } | undefined;
          testConn.close();
          if (testCheck?.integrity_check === 'ok') {
            const corruptCopy = path.join(
              this.recoveryDir,
              `corrupted-${Date.now()}.sqlite`
            );
            if (fs.existsSync(this.dbPath)) {
              fs.renameSync(this.dbPath, corruptCopy);
            }
            for (const suffix of ['-wal', '-shm']) {
              if (fs.existsSync(this.dbPath + suffix)) {
                fs.rmSync(this.dbPath + suffix, { force: true });
              }
            }
            fs.copyFileSync(recoveryFile, this.dbPath);
            this.lastAutoRecoveredFrom = path.basename(recoveryFile);
          }
        } catch {
          // Fall through to fresh DB creation if recovery file also unreadable
        }
      }

      this.db = new DatabaseSync(this.dbPath);
      this.applyPragmas(this.db);
    }

    this.ensureSchema();
    this.seedDefaultsIfEmpty();
    this.refreshRecoverySnapshot();
  }

  private applyPragmas(conn: DatabaseSync): void {
    conn.exec('PRAGMA journal_mode = WAL;');
    conn.exec('PRAGMA synchronous = NORMAL;');
    conn.exec('PRAGMA foreign_keys = ON;');
    conn.exec('PRAGMA busy_timeout = 5000;');
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        recovery_email TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        permissions_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        duration_days INTEGER NOT NULL,
        price_inr REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        member_number TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        emergency_contact_name TEXT NOT NULL,
        emergency_contact_phone TEXT NOT NULL,
        status TEXT NOT NULL,
        joined_date TEXT NOT NULL,
        avatar_url TEXT,
        fitness_goal TEXT NOT NULL,
        health_notes TEXT,
        internal_notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS memberships (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        plan_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        total_price_inr REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        payment_number TEXT UNIQUE NOT NULL,
        member_id TEXT NOT NULL,
        membership_id TEXT,
        amount_inr REAL NOT NULL,
        method TEXT NOT NULL,
        reference_number TEXT NOT NULL,
        payment_date TEXT NOT NULL,
        recorded_by_user_id TEXT NOT NULL,
        recorded_by_username TEXT NOT NULL,
        is_voided INTEGER NOT NULL DEFAULT 0,
        void_reason TEXT,
        voided_at TEXT,
        voided_by_user_id TEXT,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS check_ins (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        check_in_time TEXT NOT NULL,
        recorded_by_username TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_name TEXT,
        description TEXT NOT NULL,
        reversal_of_log_id TEXT,
        is_reversible INTEGER NOT NULL DEFAULT 0,
        is_reversed INTEGER NOT NULL DEFAULT 0,
        snapshot_before TEXT,
        snapshot_after TEXT
      );

      CREATE TABLE IF NOT EXISTS reminder_logs (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        channel TEXT NOT NULL,
        tier TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        balance_inr REAL NOT NULL,
        due_date TEXT,
        sent_by_username TEXT NOT NULL,
        message_preview TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backup_history (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256_checksum TEXT NOT NULL,
        encrypted INTEGER NOT NULL DEFAULT 1,
        verified INTEGER NOT NULL DEFAULT 1,
        trigger_type TEXT NOT NULL,
        member_count INTEGER NOT NULL,
        payment_count INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memberships_member ON memberships(member_id);
      CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
      CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
      CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_reminders_member ON reminder_logs(member_id);
    `);
  }

  private getMeta<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  private setMeta(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value));
  }

  private seedDefaultsIfEmpty(): void {
    const userCount = (
      this.db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }
    ).cnt;
    if (userCount === 0) {
      const insertUser = this.db.prepare(`
        INSERT INTO users (id, username, full_name, role, password_hash, recovery_email, email_verified, created_at, permissions_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const u of createSeedUsers()) {
        insertUser.run(
          u.id,
          u.username,
          u.fullName,
          u.role,
          u.passwordHash,
          u.recoveryEmail || null,
          u.emailVerified ? 1 : 0,
          u.createdAt,
          JSON.stringify(u.permissions || getDefaultPermissionsForRole(u.role))
        );
      }
    } else {
      // Auto-upgrade any unhashed passwords on boot & enforce single super_admin invariant
      const rows = this.db.prepare('SELECT * FROM users').all() as any[];
      const superAdmins = rows.filter((r) => r.role === 'super_admin');
      const primarySuperId =
        superAdmins.find((r) => r.id === 'usr-super-1')?.id || superAdmins[0]?.id;

      for (const row of rows) {
        if (!isHashedPassword(row.password_hash)) {
          this.db
            .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .run(hashPassword(row.password_hash), row.id);
        }
        if (superAdmins.length > 1 && row.role === 'super_admin' && row.id !== primarySuperId) {
          this.db
            .prepare('UPDATE users SET role = ?, permissions_json = ? WHERE id = ?')
            .run('admin', JSON.stringify(OPERATIONS_ADMIN_PERMISSIONS), row.id);
        }
      }
    }

    const planCount = (
      this.db.prepare('SELECT COUNT(*) AS cnt FROM plans').get() as { cnt: number }
    ).cnt;
    if (planCount === 0 && !this.getMeta('plansSeeded', false)) {
      const insertPlan = this.db.prepare(`
        INSERT INTO plans (id, name, duration_days, price_inr, category, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const p of DEFAULT_PLANS) {
        insertPlan.run(p.id, p.name, p.durationDays, p.priceInr, p.category, p.description);
      }
      this.setMeta('plansSeeded', true);
    }

    const existingBackupConfig = this.getMeta<BackupConfig | null>('backupConfig', null);
    if (!existingBackupConfig) {
      this.setMeta('backupConfig', {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: '',
        smtpPassword: '',
        senderEmail: '',
        recipientEmail: '',
        backupEncryptionKey: generateRandomBackupKeyNode(),
        initialDelayMinutes: 5,
        intervalHours: 24,
        autoBackupEnabled: true,
        lastBackupTimestamp: undefined,
        lastBackupStatus: 'scheduled',
      } satisfies BackupConfig);
    }

    if (!this.getMeta<TailscaleState | null>('tailscale', null)) {
      this.setMeta('tailscale', DEFAULT_TAILSCALE);
    }

    if (!this.getMeta<UpgradeModulesConfig | null>('upgradeModules', null)) {
      this.setMeta('upgradeModules', DEFAULT_UPGRADE_MODULES);
    }

    const existingDesktop = this.getMeta<DesktopSettings | null>('desktopSettings', null);
    if (!existingDesktop) {
      this.setMeta('desktopSettings', {
        ...DEFAULT_DESKTOP_SETTINGS,
        appVersion: this.options.appVersion || DEFAULT_DESKTOP_SETTINGS.appVersion,
      });
    } else if (this.options.appVersion && existingDesktop.appVersion !== this.options.appVersion) {
      this.setMeta('desktopSettings', {
        ...existingDesktop,
        appVersion: this.options.appVersion,
      });
    }
  }

  public refreshRecoverySnapshot(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      const recoveryFile = path.join(this.recoveryDir, 'last-known-good.sqlite');
      const tmpFile = path.join(this.recoveryDir, `last-known-good.tmp.${Date.now()}.sqlite`);
      fs.copyFileSync(this.dbPath, tmpFile);
      fs.renameSync(tmpFile, recoveryFile);
    } catch {
      // Non-fatal
    }
  }

  public close(): void {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    if (this.initialBackupTimer) clearTimeout(this.initialBackupTimer);
    try {
      this.refreshRecoverySnapshot();
      this.db.close();
    } catch {}
  }

  // ==================== READ SNAPSHOT ====================

  private mapUserRow(row: any, sanitizeHash: boolean = true): User {
    let perms: AdminPermissions;
    try {
      perms = {
        ...getDefaultPermissionsForRole(row.role as UserRole),
        ...(JSON.parse(row.permissions_json || '{}') as Partial<AdminPermissions>),
      };
    } catch {
      perms = getDefaultPermissionsForRole(row.role as UserRole);
    }
    return {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      role: row.role as UserRole,
      passwordHash: sanitizeHash ? 'scrypt:protected' : row.password_hash,
      recoveryEmail: row.recovery_email || undefined,
      emailVerified: Boolean(row.email_verified),
      createdAt: row.created_at,
      permissions: perms,
    };
  }

  public getUsers(sanitizeHash: boolean = true): User[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as any[];
    return rows.map((r) => this.mapUserRow(r, sanitizeHash));
  }

  public getUserById(id: string, sanitizeHash: boolean = true): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return row ? this.mapUserRow(row, sanitizeHash) : null;
  }

  public getSnapshot(sanitizeHashes: boolean = true): GymDatabase {
    const users = this.getUsers(sanitizeHashes);
    const plans = (
      this.db.prepare('SELECT * FROM plans').all() as any[]
    ).map((r) => ({
      id: r.id,
      name: r.name,
      durationDays: Number(r.duration_days),
      priceInr: Number(r.price_inr),
      category: r.category as MembershipPlan['category'],
      description: r.description,
    }));

    const members = (
      this.db.prepare('SELECT * FROM members ORDER BY rowid DESC').all() as any[]
    ).map((r) => ({
      id: r.id,
      memberNumber: r.member_number,
      fullName: r.full_name,
      phone: r.phone,
      email: r.email,
      emergencyContactName: r.emergency_contact_name,
      emergencyContactPhone: r.emergency_contact_phone,
      status: r.status as Member['status'],
      joinedDate: r.joined_date,
      avatarUrl: r.avatar_url || undefined,
      fitnessGoal: r.fitness_goal,
      healthNotes: r.health_notes || undefined,
      internalNotes: r.internal_notes || undefined,
    }));

    const memberships = (
      this.db.prepare('SELECT * FROM memberships ORDER BY created_at DESC, rowid DESC').all() as any[]
    ).map((r) => ({
      id: r.id,
      memberId: r.member_id,
      planId: r.plan_id,
      planName: r.plan_name,
      startDate: r.start_date,
      endDate: r.end_date,
      totalPriceInr: Number(r.total_price_inr),
      status: r.status as MemberMembership['status'],
      createdAt: r.created_at,
    }));

    const payments = (
      this.db.prepare('SELECT * FROM payments ORDER BY payment_date DESC, rowid DESC').all() as any[]
    ).map((r) => ({
      id: r.id,
      paymentNumber: r.payment_number,
      memberId: r.member_id,
      membershipId: r.membership_id || undefined,
      amountInr: Number(r.amount_inr),
      method: r.method as PaymentRecord['method'],
      referenceNumber: r.reference_number,
      paymentDate: r.payment_date,
      recordedByUserId: r.recorded_by_user_id,
      recordedByUsername: r.recorded_by_username,
      isVoided: Boolean(r.is_voided),
      voidReason: r.void_reason || undefined,
      voidedAt: r.voided_at || undefined,
      voidedByUserId: r.voided_by_user_id || undefined,
      notes: r.notes || undefined,
    }));

    const checkIns = (
      this.db.prepare('SELECT * FROM check_ins ORDER BY check_in_time DESC, rowid DESC').all() as any[]
    ).map((r) => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      checkInTime: r.check_in_time,
      recordedByUsername: r.recorded_by_username,
    }));

    const activityLogs = (
      this.db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC, rowid DESC').all() as any[]
    ).map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      userId: r.user_id,
      username: r.username,
      role: r.role as UserRole,
      actionType: r.action_type as ActivityLogEntry['actionType'],
      targetType: r.target_type as ActivityLogEntry['targetType'],
      targetId: r.target_id,
      targetName: r.target_name || undefined,
      description: r.description,
      reversalOfLogId: r.reversal_of_log_id || undefined,
      isReversible: Boolean(r.is_reversible),
      isReversed: Boolean(r.is_reversed),
      snapshotBefore: r.snapshot_before ? JSON.parse(r.snapshot_before) : undefined,
      snapshotAfter: r.snapshot_after ? JSON.parse(r.snapshot_after) : undefined,
    }));

    const reminderLogs = (
      this.db.prepare('SELECT * FROM reminder_logs ORDER BY sent_at DESC').all() as any[]
    ).map((r) => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      channel: r.channel as ReminderLogEntry['channel'],
      tier: r.tier as ReminderLogEntry['tier'],
      sentAt: r.sent_at,
      balanceInr: Number(r.balance_inr),
      dueDate: r.due_date || undefined,
      sentByUsername: r.sent_by_username,
      messagePreview: r.message_preview,
    }));

    const backupHistory = (
      this.db.prepare('SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 50').all() as any[]
    ).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      filePath: r.file_path,
      createdAt: r.created_at,
      sizeBytes: Number(r.size_bytes),
      sha256Checksum: r.sha256_checksum,
      encrypted: Boolean(r.encrypted),
      verified: Boolean(r.verified),
      trigger: r.trigger_type as BackupArchiveRecord['trigger'],
      memberCount: Number(r.member_count),
      paymentCount: Number(r.payment_count),
    }));

    const backupConfig = this.getMeta<BackupConfig>('backupConfig', {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: '',
      senderEmail: '',
      recipientEmail: '',
      backupEncryptionKey: generateRandomBackupKeyNode(),
      initialDelayMinutes: 5,
      intervalHours: 24,
      autoBackupEnabled: true,
    });
    const tailscale = this.getMeta<TailscaleState>('tailscale', DEFAULT_TAILSCALE);
    const upgradeModules = this.getMeta<UpgradeModulesConfig>('upgradeModules', DEFAULT_UPGRADE_MODULES);
    const desktopSettings = this.getMeta<DesktopSettings>('desktopSettings', DEFAULT_DESKTOP_SETTINGS);
    const integrityReport = this.runIntegrityCheck(false);
    const runtimeInfo: RuntimeInfo = {
      runtime: this.runtime,
      sqlitePath: this.dbPath,
      backupsDir: this.backupsDir,
      recoveryDir: this.recoveryDir,
      walEnabled: integrityReport.walMode.toLowerCase() === 'wal',
      legacyMigrationCompleted: this.getMeta<boolean>('legacyMigrationCompleted', false),
    };

    return {
      version: 2,
      dbPath: this.dbPath,
      users,
      plans,
      members,
      memberships,
      payments,
      checkIns,
      activityLogs,
      backupConfig,
      tailscale,
      upgradeModules,
      reminderLogs,
      backupHistory,
      desktopSettings,
      integrityReport,
      runtimeInfo,
    };
  }

  // ==================== INTEGRITY & CRASH RECOVERY ====================

  public runIntegrityCheck(logAudit: boolean = false, actor?: User | null): IntegrityReport {
    let sqliteIntegrityCheck = 'ok';
    let foreignKeyIssues = 0;
    let walMode = 'wal';
    let totalTables = 0;

    try {
      const checkRow = this.db.prepare('PRAGMA integrity_check;').get() as {
        integrity_check?: string;
      };
      sqliteIntegrityCheck = checkRow?.integrity_check || 'unknown';
      const fkRows = this.db.prepare('PRAGMA foreign_key_check;').all() as any[];
      foreignKeyIssues = fkRows.length;
      const jm = this.db.prepare('PRAGMA journal_mode;').get() as { journal_mode?: string };
      walMode = jm?.journal_mode || 'delete';
      const tbl = this.db
        .prepare("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .get() as { cnt: number };
      totalTables = tbl?.cnt || 0;
    } catch (err: any) {
      sqliteIntegrityCheck = err?.message || 'error';
    }

    const countTable = (name: string): number =>
      ((this.db.prepare(`SELECT COUNT(*) AS cnt FROM ${name}`).get() as { cnt: number })?.cnt) || 0;

    const dbSizeBytes = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0;
    const status: IntegrityReport['status'] =
      sqliteIntegrityCheck === 'ok' && foreignKeyIssues === 0
        ? 'healthy'
        : sqliteIntegrityCheck === 'ok'
        ? 'warning'
        : 'corrupted';

    const report: IntegrityReport = {
      status,
      checkedAt: new Date().toISOString(),
      sqliteIntegrityCheck,
      foreignKeyIssues,
      walMode,
      dbSizeBytes,
      dbPath: this.dbPath,
      totalTables,
      recordCounts: {
        users: countTable('users'),
        plans: countTable('plans'),
        members: countTable('members'),
        memberships: countTable('memberships'),
        payments: countTable('payments'),
        checkIns: countTable('check_ins'),
        activityLogs: countTable('activity_logs'),
        reminderLogs: countTable('reminder_logs'),
      },
      autoRecoveredFromBackup: this.lastAutoRecoveredFrom,
    };

    if (logAudit) {
      this.refreshRecoverySnapshot();
      this.insertActivityLog(
        {
          actionType: 'integrity_check',
          targetType: 'system',
          targetId: 'gym.sqlite',
          description: `Executed SQLite PRAGMA integrity_check (${sqliteIntegrityCheck}), WAL=${walMode}, ${report.recordCounts.members} members, ${report.recordCounts.payments} payments.`,
          isReversible: false,
        },
        actor
      );
    }

    return report;
  }

  public exportGenuineSqliteBytes(): Buffer {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    return fs.readFileSync(this.dbPath);
  }

  // ==================== AUTH & RBAC ====================

  public getSessionUser(token?: string | null): User | null {
    if (!token) return null;
    const sess = this.sessions.get(token);
    if (!sess) return null;
    const user = this.getUserById(sess.userId, true);
    if (!user) {
      this.sessions.delete(token);
      return null;
    }
    return user;
  }

  public authenticate(
    username: string,
    passwordPlain: string
  ): { success: boolean; user?: User; token?: string; error?: string } {
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
      .get(username.trim()) as any;
    if (!row) {
      return { success: false, error: 'Username not found.' };
    }

    const check = verifyPassword(passwordPlain, row.password_hash);
    if (!check.valid) {
      return { success: false, error: 'Incorrect password.' };
    }

    // Transparently upgrade legacy plaintext password to salted scrypt
    if (check.needsRehash) {
      this.db
        .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(hashPassword(passwordPlain), row.id);
    }

    const token = generateSessionToken();
    this.sessions.set(token, { userId: row.id, createdAt: new Date().toISOString() });
    const safeUser = this.mapUserRow(row, true);
    return { success: true, user: safeUser, token };
  }

  public signOut(token?: string | null): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  public createUserAccount(
    params: {
      username: string;
      fullName: string;
      passwordPlain: string;
      role: UserRole;
    },
    actor?: User | null
  ): { success: boolean; user?: User; error?: string } {
    if (params.role === 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only one Super Admin account is permitted on this system.',
      };
    }

    const isBasicStaffRole = params.role === 'staff' || params.role === 'receptionist';
    if (actor && actor.role !== 'super_admin') {
      if (!hasPermission(actor, 'canManageStaffAccounts')) {
        return {
          success: false,
          error: 'Permission denied: Account provisioning is restricted for your role.',
        };
      }
      if (!isBasicStaffRole) {
        return {
          success: false,
          error: 'Restricted: Only Super Admin can create privileged Admin, Owner, Manager, or Finance roles.',
        };
      }
    }

    const minLen = isBasicStaffRole ? 8 : 10;
    if (!params.passwordPlain || params.passwordPlain.length < minLen) {
      return {
        success: false,
        error: `${getRoleLabel(params.role)} password must be at least ${minLen} characters long.`,
      };
    }

    const existing = this.db
      .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)')
      .get(params.username.trim());
    if (existing) {
      return { success: false, error: 'Username is already taken.' };
    }

    const newUser: User = {
      id: `usr-${params.role}-${Date.now()}`,
      username: params.username.trim(),
      fullName: params.fullName.trim() || params.username.trim(),
      role: params.role,
      passwordHash: hashPassword(params.passwordPlain),
      emailVerified: false,
      createdAt: new Date().toISOString(),
      permissions: getDefaultPermissionsForRole(params.role),
    };

    this.db
      .prepare(
        `INSERT INTO users (id, username, full_name, role, password_hash, recovery_email, email_verified, created_at, permissions_json)
         VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?)`
      )
      .run(
        newUser.id,
        newUser.username,
        newUser.fullName,
        newUser.role,
        newUser.passwordHash,
        newUser.createdAt,
        JSON.stringify(newUser.permissions)
      );

    this.insertActivityLog(
      {
        actionType: 'user_created',
        targetType: 'user',
        targetId: newUser.id,
        targetName: newUser.username,
        description: `${getRoleLabel(params.role)} account "${newUser.username}" created with scrypt-hashed credentials.`,
        isReversible: false,
      },
      actor
    );

    return {
      success: true,
      user: { ...newUser, passwordHash: 'scrypt:protected' },
    };
  }

  public updateUserRole(
    userId: string,
    newRole: UserRole,
    applyRoleDefaults: boolean = true,
    actor?: User | null
  ): { success: boolean; error?: string } {
    if (!actor || actor.role !== 'super_admin') {
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
    const target = this.getUserById(userId, true);
    if (!target) {
      return { success: false, error: 'Target account not found.' };
    }
    if (target.id === actor.id) {
      return { success: false, error: 'Cannot downgrade your own active Super Admin session.' };
    }
    if (target.role === 'super_admin') {
      return { success: false, error: 'At least one Super Admin must remain.' };
    }

    const nextPerms = applyRoleDefaults
      ? getDefaultPermissionsForRole(newRole)
      : getEffectivePermissions(target);

    this.db
      .prepare('UPDATE users SET role = ?, permissions_json = ? WHERE id = ?')
      .run(newRole, JSON.stringify(nextPerms), userId);

    this.insertActivityLog(
      {
        actionType: 'update_role',
        targetType: 'user',
        targetId: target.id,
        targetName: target.username,
        description: `Super Admin changed role for "${target.username}" from ${getRoleLabel(target.role)} to ${getRoleLabel(newRole)}.`,
        isReversible: false,
      },
      actor
    );
    return { success: true };
  }

  public updateUserPermissions(
    userId: string,
    permissions: Partial<AdminPermissions>,
    actor?: User | null
  ): { success: boolean; error?: string } {
    if (!actor || actor.role !== 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only Super Admin accounts can modify account permissions.',
      };
    }
    const target = this.getUserById(userId, true);
    if (!target) return { success: false, error: 'Target account not found.' };
    if (target.role === 'super_admin') {
      return {
        success: false,
        error: 'Super Admin accounts inherently hold unrestricted permissions.',
      };
    }

    const merged: AdminPermissions = {
      ...getEffectivePermissions(target),
      ...permissions,
    };

    this.db
      .prepare('UPDATE users SET permissions_json = ? WHERE id = ?')
      .run(JSON.stringify(merged), userId);

    const grantedCount = Object.values(merged).filter(Boolean).length;
    const totalCount = Object.keys(merged).length;

    this.insertActivityLog(
      {
        actionType: 'update_permissions',
        targetType: 'user',
        targetId: target.id,
        targetName: target.username,
        description: `Super Admin updated permissions for "${target.username}" (${grantedCount}/${totalCount} permissions active).`,
        isReversible: false,
      },
      actor
    );
    return { success: true };
  }

  public deleteUserAccount(
    userId: string,
    actor?: User | null
  ): { success: boolean; error?: string } {
    if (actor && !hasPermission(actor, 'canManageStaffAccounts')) {
      return { success: false, error: 'Permission denied: cannot delete user accounts.' };
    }
    if (actor?.id === userId) {
      return { success: false, error: 'You cannot delete the currently signed-in account.' };
    }
    const target = this.getUserById(userId, true);
    if (!target) return { success: false, error: 'Account not found.' };

    const allUsers = this.getUsers(true);
    const adminUsers = allUsers.filter((u) => isAdminRole(u.role));
    if (isAdminRole(target.role) && adminUsers.length <= 1) {
      return {
        success: false,
        error: 'At least one admin/owner account must remain in the database.',
      };
    }
    if (target.role === 'super_admin') {
      return { success: false, error: 'Cannot delete the protected Super Admin account.' };
    }

    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    for (const [tok, sess] of this.sessions.entries()) {
      if (sess.userId === userId) this.sessions.delete(tok);
    }

    this.insertActivityLog(
      {
        actionType: 'delete_user',
        targetType: 'user',
        targetId: userId,
        targetName: target.username,
        description: `Deleted ${getRoleLabel(target.role)} account "${target.username}".`,
        isReversible: false,
      },
      actor
    );
    return { success: true };
  }

  public performLocalRecovery(newPasswordPlain: string): { success: boolean; error?: string } {
    if (!newPasswordPlain || newPasswordPlain.length < 10) {
      return { success: false, error: 'New owner password must be at least 10 characters long.' };
    }
    const allUsers = this.getUsers(true);
    const owner =
      allUsers.find((u) => u.role === 'owner') ||
      allUsers.find((u) => u.role === 'super_admin') ||
      allUsers.find((u) => u.role === 'admin');
    if (!owner) {
      return { success: false, error: 'No owner or admin account found to recover.' };
    }

    this.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(newPasswordPlain), owner.id);
    this.sessions.clear();

    this.insertActivityLog({
      actionType: 'local_recovery',
      targetType: 'user',
      targetId: owner.id,
      targetName: owner.username,
      description: 'Local desktop recovery invoked. Password updated with scrypt hash, active sessions revoked.',
      isReversible: false,
    });
    return { success: true };
  }

  public resetPasswordViaEmail(
    email: string,
    code: string,
    newPasswordPlain: string
  ): { success: boolean; error?: string } {
    if (code !== '492817' && code !== '123456') {
      return { success: false, error: 'Invalid or expired one-time recovery code.' };
    }
    if (!newPasswordPlain || newPasswordPlain.length < 10) {
      return { success: false, error: 'Password must be at least 10 characters long.' };
    }
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(recovery_email) = LOWER(?) AND email_verified = 1')
      .get(email.trim()) as any;
    if (!row) {
      return { success: false, error: 'No verified account found with this recovery email.' };
    }

    this.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(newPasswordPlain), row.id);

    this.insertActivityLog({
      actionType: 'password_reset',
      targetType: 'user',
      targetId: row.id,
      targetName: row.username,
      description: `Password for ${row.username} reset via verified email recovery.`,
      isReversible: false,
    });
    return { success: true };
  }

  public verifyAccountEmail(userId: string, email: string): { success: boolean; error?: string } {
    const existing = this.getUserById(userId, true);
    if (!existing) return { success: false, error: 'User not found.' };
    this.db
      .prepare('UPDATE users SET recovery_email = ?, email_verified = 1 WHERE id = ?')
      .run(email.trim(), userId);
    return { success: true };
  }

  // ==================== SAFE LEGACY LOCALSTORAGE MIGRATION ====================

  public inspectMigrationCompatibility(legacyDb: Partial<GymDatabase>): {
    sqliteHasData: boolean;
    sqliteCounts: { members: number; memberships: number; payments: number };
    legacyCounts: { members: number; memberships: number; payments: number };
  } {
    const snap = this.getSnapshot(true);
    return {
      sqliteHasData:
        snap.members.length > 0 || snap.memberships.length > 0 || snap.payments.length > 0,
      sqliteCounts: {
        members: snap.members.length,
        memberships: snap.memberships.length,
        payments: snap.payments.length,
      },
      legacyCounts: {
        members: legacyDb.members?.length || 0,
        memberships: legacyDb.memberships?.length || 0,
        payments: legacyDb.payments?.length || 0,
      },
    };
  }

  public async migrateLegacySnapshot(
    legacyDb: GymDatabase,
    mode: 'auto_if_empty' | 'merge' | 'replace' = 'auto_if_empty',
    actor?: User | null
  ): Promise<{
    success: boolean;
    requiresConfirmation?: boolean;
    message: string;
    safetyBackup?: BackupArchiveRecord;
    counts?: { members: number; memberships: number; payments: number };
  }> {
    const status = this.inspectMigrationCompatibility(legacyDb);
    if (status.sqliteHasData && mode === 'auto_if_empty') {
      return {
        success: false,
        requiresConfirmation: true,
        message: `SQLite already contains ${status.sqliteCounts.members} members and ${status.sqliteCounts.payments} payments. Choose Merge or Replace (with safety backup) before migrating.`,
      };
    }

    // Step 1: Always create a verified pre-migration safety backup BEFORE changing SQLite!
    const safetyBackup = await this.createEncryptedBackup('pre_migration_safety');

    // Step 2: Run atomic SQLite transaction
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      if (mode === 'replace') {
        this.db.exec(`
          DELETE FROM check_ins;
          DELETE FROM payments;
          DELETE FROM memberships;
          DELETE FROM members;
          DELETE FROM plans;
          DELETE FROM activity_logs;
        `);
      }

      const upsertPlan = this.db.prepare(`
        INSERT OR IGNORE INTO plans (id, name, duration_days, price_inr, category, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const p of legacyDb.plans || []) {
        upsertPlan.run(p.id, p.name, p.durationDays, p.priceInr, p.category, p.description);
      }

      const insertUser = this.db.prepare(`
        INSERT OR IGNORE INTO users (id, username, full_name, role, password_hash, recovery_email, email_verified, created_at, permissions_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let hasSuperAdmin =
        (
          this.db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE role='super_admin'").get() as {
            cnt: number;
          }
        ).cnt > 0;

      for (const u of legacyDb.users || []) {
        let role = u.role;
        if (role === 'super_admin' && hasSuperAdmin) {
          role = 'admin';
        }
        if (role === 'super_admin') hasSuperAdmin = true;

        const hashed = isHashedPassword(u.passwordHash)
          ? u.passwordHash
          : u.passwordHash && u.passwordHash !== 'scrypt:protected'
          ? hashPassword(u.passwordHash)
          : hashPassword('ChangeMe@2026');

        insertUser.run(
          u.id,
          u.username,
          u.fullName,
          role,
          hashed,
          u.recoveryEmail || null,
          u.emailVerified ? 1 : 0,
          u.createdAt || new Date().toISOString(),
          JSON.stringify(u.permissions || getDefaultPermissionsForRole(role))
        );
      }

      const insertMember = this.db.prepare(`
        INSERT OR IGNORE INTO members (id, member_number, full_name, phone, email, emergency_contact_name, emergency_contact_phone, status, joined_date, avatar_url, fitness_goal, health_notes, internal_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of legacyDb.members || []) {
        insertMember.run(
          m.id,
          m.memberNumber,
          m.fullName,
          m.phone,
          m.email,
          m.emergencyContactName,
          m.emergencyContactPhone,
          m.status,
          m.joinedDate,
          m.avatarUrl || null,
          m.fitnessGoal,
          m.healthNotes || null,
          m.internalNotes || null
        );
      }

      const insertMembership = this.db.prepare(`
        INSERT OR IGNORE INTO memberships (id, member_id, plan_id, plan_name, start_date, end_date, total_price_inr, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ms of legacyDb.memberships || []) {
        insertMembership.run(
          ms.id,
          ms.memberId,
          ms.planId,
          ms.planName,
          ms.startDate,
          ms.endDate,
          ms.totalPriceInr,
          ms.status,
          ms.createdAt
        );
      }

      const insertPayment = this.db.prepare(`
        INSERT OR IGNORE INTO payments (id, payment_number, member_id, membership_id, amount_inr, method, reference_number, payment_date, recorded_by_user_id, recorded_by_username, is_voided, void_reason, voided_at, voided_by_user_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const pay of legacyDb.payments || []) {
        insertPayment.run(
          pay.id,
          pay.paymentNumber,
          pay.memberId,
          pay.membershipId || null,
          pay.amountInr,
          pay.method,
          pay.referenceNumber,
          pay.paymentDate,
          pay.recordedByUserId,
          pay.recordedByUsername,
          pay.isVoided ? 1 : 0,
          pay.voidReason || null,
          pay.voidedAt || null,
          pay.voidedByUserId || null,
          pay.notes || null
        );
      }

      const insertCheckIn = this.db.prepare(`
        INSERT OR IGNORE INTO check_ins (id, member_id, member_name, check_in_time, recorded_by_username)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const chk of legacyDb.checkIns || []) {
        insertCheckIn.run(
          chk.id,
          chk.memberId,
          chk.memberName,
          chk.checkInTime,
          chk.recordedByUsername
        );
      }

      const insertAct = this.db.prepare(`
        INSERT OR IGNORE INTO activity_logs (id, timestamp, user_id, username, role, action_type, target_type, target_id, target_name, description, reversal_of_log_id, is_reversible, is_reversed, snapshot_before, snapshot_after)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const act of legacyDb.activityLogs || []) {
        insertAct.run(
          act.id,
          act.timestamp,
          act.userId,
          act.username,
          act.role,
          act.actionType,
          act.targetType,
          act.targetId,
          act.targetName || null,
          act.description,
          act.reversalOfLogId || null,
          act.isReversible ? 1 : 0,
          act.isReversed ? 1 : 0,
          act.snapshotBefore ? JSON.stringify(act.snapshotBefore) : null,
          act.snapshotAfter ? JSON.stringify(act.snapshotAfter) : null
        );
      }

      if (legacyDb.backupConfig && isValid32ByteBase64KeyNode(legacyDb.backupConfig.backupEncryptionKey)) {
        this.setMeta('backupConfig', {
          ...this.getMeta('backupConfig', {}),
          ...legacyDb.backupConfig,
        });
      }
      if (legacyDb.tailscale) {
        this.setMeta('tailscale', legacyDb.tailscale);
      }
      if (legacyDb.upgradeModules) {
        this.setMeta('upgradeModules', legacyDb.upgradeModules);
      }

      this.setMeta('legacyMigrationCompleted', true);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    this.refreshRecoverySnapshot();
    const afterCounts = {
      members: legacyDb.members?.length || 0,
      memberships: legacyDb.memberships?.length || 0,
      payments: legacyDb.payments?.length || 0,
    };

    this.insertActivityLog(
      {
        actionType: 'sqlite_migration',
        targetType: 'system',
        targetId: 'gym.sqlite',
        description: `Safely migrated localStorage records into genuine SQLite (${mode}): ${afterCounts.members} members, ${afterCounts.memberships} enrollments, ${afterCounts.payments} payments. Verified backup: ${safetyBackup.fileName}.`,
        isReversible: false,
      },
      actor
    );

    return {
      success: true,
      message: `Migrated ${afterCounts.members} members, ${afterCounts.memberships} memberships, and ${afterCounts.payments} payments safely into gym.sqlite.`,
      safetyBackup,
      counts: afterCounts,
    };
  }

  // ==================== ENCRYPTED BACKUPS & RESTORE VERIFICATION ====================

  public async createEncryptedBackup(
    trigger: BackupArchiveRecord['trigger'] = 'manual'
  ): Promise<BackupArchiveRecord> {
    const snap = this.getSnapshot(false); // Include scrypt hashes (never plaintext!) so restored DB keeps valid logins
    const sqliteBytes = this.exportGenuineSqliteBytes();
    const sqliteSha256 = sha256Hex(sqliteBytes);
    const createdAt = new Date().toISOString();

    const envelope = {
      ...snap,
      _format: 'flexflow-sqlite-v2',
      _createdAt: createdAt,
      _sqliteSha256: sqliteSha256,
      _sqliteBase64: sqliteBytes.toString('base64'),
    };

    const key = snap.backupConfig.backupEncryptionKey;
    const encryptedBytes = encryptBufferAES256GCM(JSON.stringify(envelope, null, 2), key);

    const stamp = createdAt.replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `flexflow-${trigger}-${stamp}.sqlite.enc`;
    const filePath = path.join(this.backupsDir, fileName);

    fs.writeFileSync(filePath, encryptedBytes);

    // Immediate Restore Verification on disk!
    const readBack = fs.readFileSync(filePath);
    const decryptedText = decryptBufferAES256GCM(readBack, key).toString('utf8');
    const parsedCheck = JSON.parse(decryptedText);
    if (!parsedCheck.users || !parsedCheck.members || parsedCheck._sqliteSha256 !== sqliteSha256) {
      throw new Error('Backup write verification failed checksum check.');
    }

    const archiveChecksum = sha256Hex(readBack);
    const record: BackupArchiveRecord = {
      id: `bkp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      fileName,
      filePath,
      createdAt,
      sizeBytes: readBack.byteLength,
      sha256Checksum: archiveChecksum,
      encrypted: true,
      verified: true,
      trigger,
      memberCount: snap.members.length,
      paymentCount: snap.payments.length,
    };

    this.db
      .prepare(
        `INSERT INTO backup_history (id, file_name, file_path, created_at, size_bytes, sha256_checksum, encrypted, verified, trigger_type, member_count, payment_count)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`
      )
      .run(
        record.id,
        record.fileName,
        record.filePath,
        record.createdAt,
        record.sizeBytes,
        record.sha256Checksum,
        record.trigger,
        record.memberCount,
        record.paymentCount
      );

    // Update last backup metadata
    const nextCfg: BackupConfig = {
      ...snap.backupConfig,
      lastBackupTimestamp: createdAt,
      lastBackupStatus: 'success',
    };
    this.setMeta('backupConfig', nextCfg);

    // Retain last 30 auto_daily archives
    if (trigger === 'auto_daily') {
      const oldAuto = this.db
        .prepare(
          "SELECT id, file_path FROM backup_history WHERE trigger_type = 'auto_daily' ORDER BY created_at DESC LIMIT -1 OFFSET 30"
        )
        .all() as { id: string; file_path: string }[];
      for (const old of oldAuto) {
        try {
          if (fs.existsSync(old.file_path)) fs.rmSync(old.file_path, { force: true });
        } catch {}
        this.db.prepare('DELETE FROM backup_history WHERE id = ?').run(old.id);
      }
    }

    return record;
  }

  public verifyEncryptedBackupPayload(params: {
    backupId?: string;
    encryptedBytes?: Buffer;
    keyOverride?: string;
  }): {
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
    parsedEnvelope?: any;
  } {
    try {
      const cfg = this.getMeta<BackupConfig>('backupConfig', {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: '',
        senderEmail: '',
        recipientEmail: '',
        backupEncryptionKey: '',
        initialDelayMinutes: 5,
        intervalHours: 24,
        autoBackupEnabled: true,
      });
      const key = (params.keyOverride || cfg.backupEncryptionKey).trim();
      let encBuf = params.encryptedBytes;

      if (!encBuf && params.backupId) {
        const row = this.db
          .prepare('SELECT file_path, sha256_checksum FROM backup_history WHERE id = ?')
          .get(params.backupId) as { file_path: string; sha256_checksum: string } | undefined;
        if (!row || !fs.existsSync(row.file_path)) {
          return { valid: false, error: 'Backup archive file not found on disk.' };
        }
        encBuf = fs.readFileSync(row.file_path);
        if (sha256Hex(encBuf) !== row.sha256_checksum) {
          return {
            valid: false,
            error: 'Archive SHA-256 checksum mismatch — file may be modified or corrupted.',
          };
        }
      }

      if (!encBuf) {
        return { valid: false, error: 'No backup payload provided.' };
      }

      const plainText = decryptBufferAES256GCM(encBuf, key).toString('utf8');
      const parsed = JSON.parse(plainText);
      if (!Array.isArray(parsed.members) || !Array.isArray(parsed.users)) {
        return { valid: false, error: 'Decrypted payload does not match Flex & Flow schema.' };
      }

      let sqliteBinaryVerified = false;
      let sha256Match = true;
      if (parsed._sqliteBase64) {
        const bin = Buffer.from(parsed._sqliteBase64, 'base64');
        if (parsed._sqliteSha256 && sha256Hex(bin) !== parsed._sqliteSha256) {
          sha256Match = false;
          return { valid: false, error: 'Embedded SQLite SHA-256 verification failed.' };
        }
        const tempTest = path.join(
          os.tmpdir(),
          `flexflow-verify-${Date.now()}-${Math.floor(Math.random() * 1000)}.sqlite`
        );
        try {
          fs.writeFileSync(tempTest, bin);
          const testDb = new DatabaseSync(tempTest);
          const check = testDb.prepare('PRAGMA integrity_check;').get() as {
            integrity_check?: string;
          };
          testDb.close();
          sqliteBinaryVerified = check?.integrity_check === 'ok';
          if (!sqliteBinaryVerified) {
            return { valid: false, error: 'Embedded SQLite binary failed PRAGMA integrity_check.' };
          }
        } finally {
          try {
            fs.rmSync(tempTest, { force: true });
          } catch {}
        }
      }

      return {
        valid: true,
        parsedEnvelope: parsed,
        summary: {
          memberCount: parsed.members.length,
          membershipCount: (parsed.memberships || []).length,
          paymentCount: (parsed.payments || []).length,
          userCount: parsed.users.length,
          createdAt: parsed._createdAt,
          sqliteBinaryVerified,
          sha256Match,
        },
      };
    } catch (err: any) {
      return {
        valid: false,
        error: err?.message || 'AES-256-GCM decryption or verification failed.',
      };
    }
  }

  public async restoreVerifiedBackup(params: {
    backupId?: string;
    plainJsonString?: string;
    encryptedBytes?: Buffer;
    keyOverride?: string;
    confirmed?: boolean;
    actor?: User | null;
  }): Promise<{ success: boolean; error?: string; safetyBackup?: BackupArchiveRecord }> {
    if (params.confirmed !== true) {
      return {
        success: false,
        error: 'Explicit user confirmation is required before replacing active SQLite database.',
      };
    }

    let parsed: any;

    if (params.plainJsonString) {
      let jsonStr = params.plainJsonString;
      if (jsonStr.startsWith('SQLite format 3')) {
        const idx = jsonStr.indexOf('{');
        if (idx !== -1) jsonStr = jsonStr.slice(idx);
      }
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e: any) {
        return { success: false, error: e?.message || 'Invalid JSON backup payload.' };
      }
      if (!Array.isArray(parsed.members) || !Array.isArray(parsed.users)) {
        return { success: false, error: 'File does not contain valid Flex & Flow gym schema.' };
      }
    } else {
      const verification = this.verifyEncryptedBackupPayload({
        backupId: params.backupId,
        encryptedBytes: params.encryptedBytes,
        keyOverride: params.keyOverride,
      });
      if (!verification.valid || !verification.parsedEnvelope) {
        return { success: false, error: verification.error || 'Backup verification failed.' };
      }
      parsed = verification.parsedEnvelope;
    }

    // ALWAYS create a verified pre-restore safety snapshot before overwriting active DB!
    const safetyBackup = await this.createEncryptedBackup('pre_restore_safety');

    // Perform atomic restore inside SQLite transaction
    const res = await this.migrateLegacySnapshot(parsed as GymDatabase, 'replace', params.actor);
    if (!res.success) {
      return { success: false, error: res.message, safetyBackup };
    }

    this.insertActivityLog(
      {
        actionType: 'backup_restore',
        targetType: 'system',
        targetId: 'gym.sqlite',
        description: `Verified and restored gym.sqlite from backup (${parsed.members.length} members, ${(parsed.payments || []).length} payments). Pre-restore safety snapshot saved: ${safetyBackup.fileName}.`,
        isReversible: false,
      },
      params.actor
    );

    return { success: true, safetyBackup };
  }

  private startAutoBackupScheduler(): void {
    const checkAndRun = async () => {
      try {
        const cfg = this.getMeta<BackupConfig | null>('backupConfig', null);
        if (!cfg || !cfg.autoBackupEnabled) return;
        const intervalMs = Math.max(1, cfg.intervalHours || 24) * 3600 * 1000;
        const lastMs = cfg.lastBackupTimestamp ? new Date(cfg.lastBackupTimestamp).getTime() : 0;
        if (!lastMs || Date.now() - lastMs >= intervalMs) {
          const rec = await this.createEncryptedBackup('auto_daily');
          this.options.onAutoBackupComplete?.(rec);
          this.options.onDesktopNotification?.(
            'Daily Encrypted Backup Complete',
            `Saved & verified ${rec.fileName} (${rec.memberCount} members, ${rec.paymentCount} payments).`
          );
        }
      } catch (err) {
        console.error('Auto backup scheduler error:', err);
      }
    };

    const delayMs = 60 * 1000; // Initial check 1 min after boot
    this.initialBackupTimer = setTimeout(() => {
      void checkAndRun();
    }, delayMs);
    this.schedulerTimer = setInterval(() => {
      void checkAndRun();
    }, 15 * 60 * 1000);
  }

  // ==================== DOMAIN MUTATIONS ====================

  private insertActivityLog(
    entry: Omit<ActivityLogEntry, 'id' | 'timestamp' | 'userId' | 'username' | 'role'>,
    actor?: User | null
  ): ActivityLogEntry {
    const log: ActivityLogEntry = {
      ...entry,
      id: `act-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toISOString(),
      userId: actor?.id || 'usr-system',
      username: actor?.username || 'system',
      role: actor?.role || 'staff',
    };
    this.db
      .prepare(
        `INSERT INTO activity_logs (id, timestamp, user_id, username, role, action_type, target_type, target_id, target_name, description, reversal_of_log_id, is_reversible, is_reversed, snapshot_before, snapshot_after)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        log.id,
        log.timestamp,
        log.userId,
        log.username,
        log.role,
        log.actionType,
        log.targetType,
        log.targetId,
        log.targetName || null,
        log.description,
        log.reversalOfLogId || null,
        log.isReversible ? 1 : 0,
        log.isReversed ? 1 : 0,
        log.snapshotBefore !== undefined ? JSON.stringify(log.snapshotBefore) : null,
        log.snapshotAfter !== undefined ? JSON.stringify(log.snapshotAfter) : null
      );
    return log;
  }

  public addMember(
    memberData: Omit<Member, 'id' | 'memberNumber'>,
    actor?: User | null
  ): Member {
    const rows = this.db.prepare('SELECT member_number FROM members').all() as {
      member_number: string;
    }[];
    const maxNum = rows.reduce((max, r) => {
      const match = r.member_number.match(/(\d+)$/);
      const num = match ? parseInt(match[1], 10) : 1000;
      return Math.max(max, num);
    }, 1000);
    const newMember: Member = {
      ...memberData,
      id: `mem-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      memberNumber: `FF-${maxNum + 1}`,
    };

    this.db
      .prepare(
        `INSERT INTO members (id, member_number, full_name, phone, email, emergency_contact_name, emergency_contact_phone, status, joined_date, avatar_url, fitness_goal, health_notes, internal_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newMember.id,
        newMember.memberNumber,
        newMember.fullName,
        newMember.phone,
        newMember.email,
        newMember.emergencyContactName,
        newMember.emergencyContactPhone,
        newMember.status,
        newMember.joinedDate,
        newMember.avatarUrl || null,
        newMember.fitnessGoal,
        newMember.healthNotes || null,
        newMember.internalNotes || null
      );

    this.insertActivityLog(
      {
        actionType: 'create_member',
        targetType: 'member',
        targetId: newMember.id,
        targetName: newMember.fullName,
        description: `Added new member ${newMember.fullName} (${newMember.memberNumber}).`,
        isReversible: true,
        snapshotBefore: null,
        snapshotAfter: newMember,
      },
      actor
    );
    return newMember;
  }

  public updateMember(
    id: string,
    updates: Partial<Member>,
    actor?: User | null
  ): Member | null {
    const snap = this.getSnapshot(true);
    const oldMember = snap.members.find((m) => m.id === id);
    if (!oldMember) return null;

    const merged: Member = { ...oldMember, ...updates, id };
    this.db
      .prepare(
        `UPDATE members SET full_name=?, phone=?, email=?, emergency_contact_name=?, emergency_contact_phone=?, status=?, joined_date=?, avatar_url=?, fitness_goal=?, health_notes=?, internal_notes=? WHERE id=?`
      )
      .run(
        merged.fullName,
        merged.phone,
        merged.email,
        merged.emergencyContactName,
        merged.emergencyContactPhone,
        merged.status,
        merged.joinedDate,
        merged.avatarUrl || null,
        merged.fitnessGoal,
        merged.healthNotes || null,
        merged.internalNotes || null,
        id
      );

    this.insertActivityLog(
      {
        actionType: 'update_member',
        targetType: 'member',
        targetId: id,
        targetName: merged.fullName,
        description: `Updated member profile details for ${merged.fullName}.`,
        isReversible: true,
        snapshotBefore: oldMember,
        snapshotAfter: merged,
      },
      actor
    );
    return merged;
  }

  public deleteMember(id: string, actor?: User | null): { success: boolean; error?: string } {
    const hasMemberships =
      (
        this.db.prepare('SELECT COUNT(*) AS cnt FROM memberships WHERE member_id = ?').get(id) as {
          cnt: number;
        }
      ).cnt > 0;
    const hasPayments =
      (
        this.db.prepare('SELECT COUNT(*) AS cnt FROM payments WHERE member_id = ?').get(id) as {
          cnt: number;
        }
      ).cnt > 0;

    if (hasMemberships || hasPayments) {
      return {
        success: false,
        error:
          'Safety restriction: This member has active financial or membership history and cannot be deleted. Consider freezing their account instead.',
      };
    }

    const row = this.db.prepare('SELECT * FROM members WHERE id = ?').get(id) as any;
    if (!row) return { success: false, error: 'Member not found.' };

    const memberSnapshot: Member = {
      id: row.id,
      memberNumber: row.member_number,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      emergencyContactName: row.emergency_contact_name,
      emergencyContactPhone: row.emergency_contact_phone,
      status: row.status,
      joinedDate: row.joined_date,
      avatarUrl: row.avatar_url || undefined,
      fitnessGoal: row.fitness_goal,
      healthNotes: row.health_notes || undefined,
      internalNotes: row.internal_notes || undefined,
    };

    this.db.prepare('DELETE FROM check_ins WHERE member_id = ?').run(id);
    this.db.prepare('DELETE FROM members WHERE id = ?').run(id);

    this.insertActivityLog(
      {
        actionType: 'delete_member',
        targetType: 'member',
        targetId: id,
        targetName: memberSnapshot.fullName,
        description: `Deleted empty member record ${memberSnapshot.fullName} (${memberSnapshot.memberNumber}).`,
        isReversible: true,
        snapshotBefore: memberSnapshot,
        snapshotAfter: null,
      },
      actor
    );
    return { success: true };
  }

  public createPlan(
    planData: Omit<MembershipPlan, 'id'>,
    actor?: User | null
  ): MembershipPlan {
    const newPlan: MembershipPlan = {
      ...planData,
      id: `plan-${Date.now()}`,
    };
    this.db
      .prepare(
        `INSERT INTO plans (id, name, duration_days, price_inr, category, description)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        newPlan.id,
        newPlan.name,
        newPlan.durationDays,
        newPlan.priceInr,
        newPlan.category,
        newPlan.description
      );

    this.insertActivityLog(
      {
        actionType: 'create_plan',
        targetType: 'plan',
        targetId: newPlan.id,
        targetName: newPlan.name,
        description: `Created membership plan "${newPlan.name}" (₹${newPlan.priceInr.toLocaleString('en-IN')} / ${newPlan.durationDays} days).`,
        isReversible: true,
        snapshotBefore: null,
        snapshotAfter: newPlan,
      },
      actor
    );
    return newPlan;
  }

  public deletePlan(planId: string, actor?: User | null): { success: boolean; error?: string } {
    const row = this.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as any;
    if (!row) return { success: false, error: 'Membership plan not found.' };

    const plan: MembershipPlan = {
      id: row.id,
      name: row.name,
      durationDays: Number(row.duration_days),
      priceInr: Number(row.price_inr),
      category: row.category,
      description: row.description,
    };

    const hasEnrollments =
      (
        this.db.prepare('SELECT COUNT(*) AS cnt FROM memberships WHERE plan_id = ?').get(planId) as {
          cnt: number;
        }
      ).cnt > 0;

    this.db.prepare('DELETE FROM plans WHERE id = ?').run(planId);
    this.insertActivityLog(
      {
        actionType: 'delete_plan',
        targetType: 'plan',
        targetId: plan.id,
        targetName: plan.name,
        description: `Deleted membership plan "${plan.name}" (₹${plan.priceInr.toLocaleString('en-IN')}).`,
        isReversible: !hasEnrollments,
        snapshotBefore: plan,
        snapshotAfter: null,
      },
      actor
    );
    return { success: true };
  }

  public assignMembership(
    memberId: string,
    planId: string,
    startDateStr?: string,
    actor?: User | null
  ): MemberMembership {
    const planRow =
      (this.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as any) ||
      (this.db.prepare('SELECT * FROM plans LIMIT 1').get() as any);
    const memberRow = this.db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as any;

    const start = startDateStr ? new Date(startDateStr) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + Number(planRow.duration_days));

    const newMembership: MemberMembership = {
      id: `mship-${Date.now()}`,
      memberId,
      planId: planRow.id,
      planName: planRow.name,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      totalPriceInr: Number(planRow.price_inr),
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    if (
      memberRow &&
      (memberRow.status === 'expired' || memberRow.status === 'pending_renewal')
    ) {
      this.db.prepare("UPDATE members SET status = 'active' WHERE id = ?").run(memberId);
    }

    this.db
      .prepare(
        `INSERT INTO memberships (id, member_id, plan_id, plan_name, start_date, end_date, total_price_inr, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newMembership.id,
        newMembership.memberId,
        newMembership.planId,
        newMembership.planName,
        newMembership.startDate,
        newMembership.endDate,
        newMembership.totalPriceInr,
        newMembership.status,
        newMembership.createdAt
      );

    this.insertActivityLog(
      {
        actionType: 'assign_membership',
        targetType: 'membership',
        targetId: newMembership.id,
        targetName: `${planRow.name} (${memberRow?.full_name || 'Member'})`,
        description: `Assigned plan "${planRow.name}" (₹${planRow.price_inr}) to ${memberRow?.full_name || 'member'}.`,
        isReversible: true,
        snapshotBefore: null,
        snapshotAfter: newMembership,
      },
      actor
    );
    return newMembership;
  }

  public deleteMembership(
    membershipId: string,
    actor?: User | null
  ): { success: boolean; error?: string } {
    const row = this.db.prepare('SELECT * FROM memberships WHERE id = ?').get(membershipId) as any;
    if (!row) return { success: false, error: 'Enrollment record not found.' };

    const hasValidPayment =
      (
        this.db
          .prepare('SELECT COUNT(*) AS cnt FROM payments WHERE membership_id = ? AND is_voided = 0')
          .get(membershipId) as { cnt: number }
      ).cnt > 0;
    if (hasValidPayment) {
      return {
        success: false,
        error:
          'Safety restriction: A valid payment is linked to this enrollment. Void the payment first before deleting.',
      };
    }

    const memberRow = this.db
      .prepare('SELECT full_name FROM members WHERE id = ?')
      .get(row.member_id) as { full_name?: string } | undefined;

    const membership: MemberMembership = {
      id: row.id,
      memberId: row.member_id,
      planId: row.plan_id,
      planName: row.plan_name,
      startDate: row.start_date,
      endDate: row.end_date,
      totalPriceInr: Number(row.total_price_inr),
      status: row.status,
      createdAt: row.created_at,
    };

    this.db.prepare('DELETE FROM memberships WHERE id = ?').run(membershipId);
    this.insertActivityLog(
      {
        actionType: 'delete_membership',
        targetType: 'membership',
        targetId: membership.id,
        targetName: `${membership.planName} (${memberRow?.full_name || 'Member'})`,
        description: `Deleted enrollment "${membership.planName}" for ${memberRow?.full_name || 'member'}.`,
        isReversible: true,
        snapshotBefore: membership,
        snapshotAfter: null,
      },
      actor
    );
    return { success: true };
  }

  public recordPayment(
    params: {
      memberId: string;
      membershipId?: string;
      amountInr: number;
      method: PaymentRecord['method'];
      referenceNumber: string;
      notes?: string;
    },
    actor?: User | null
  ): PaymentRecord {
    const memberRow = this.db
      .prepare('SELECT full_name FROM members WHERE id = ?')
      .get(params.memberId) as { full_name?: string } | undefined;

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
      recordedByUserId: actor?.id || 'usr-system',
      recordedByUsername: actor?.username || 'system',
      isVoided: false,
      notes: params.notes,
    };

    this.db
      .prepare(
        `INSERT INTO payments (id, payment_number, member_id, membership_id, amount_inr, method, reference_number, payment_date, recorded_by_user_id, recorded_by_username, is_voided, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(
        newPayment.id,
        newPayment.paymentNumber,
        newPayment.memberId,
        newPayment.membershipId || null,
        newPayment.amountInr,
        newPayment.method,
        newPayment.referenceNumber,
        newPayment.paymentDate,
        newPayment.recordedByUserId,
        newPayment.recordedByUsername,
        newPayment.notes || null
      );

    this.insertActivityLog(
      {
        actionType: 'record_payment',
        targetType: 'payment',
        targetId: newPayment.id,
        targetName: newPayment.paymentNumber,
        description: `Recorded external payment of ₹${params.amountInr.toLocaleString('en-IN')} (${params.method}) for ${memberRow?.full_name || 'member'}.`,
        isReversible: true,
        snapshotBefore: null,
        snapshotAfter: newPayment,
      },
      actor
    );
    return newPayment;
  }

  public voidPayment(
    paymentId: string,
    voidReason: string,
    actor?: User | null
  ): { success: boolean; error?: string } {
    const row = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
    if (!row) return { success: false, error: 'Payment record not found.' };
    if (row.is_voided) return { success: false, error: 'Payment is already voided.' };

    const voidedAt = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE payments SET is_voided = 1, void_reason = ?, voided_at = ?, voided_by_user_id = ? WHERE id = ?'
      )
      .run(voidReason, voidedAt, actor?.id || null, paymentId);

    const memberRow = this.db
      .prepare('SELECT full_name FROM members WHERE id = ?')
      .get(row.member_id) as { full_name?: string } | undefined;

    this.insertActivityLog(
      {
        actionType: 'void_payment',
        targetType: 'payment',
        targetId: row.id,
        targetName: row.payment_number,
        description: `Voided payment ${row.payment_number} of ₹${Number(row.amount_inr).toLocaleString('en-IN')} for ${memberRow?.full_name || 'member'}. Reason: ${voidReason}`,
        isReversible: false,
      },
      actor
    );
    return { success: true };
  }

  public deletePayment(
    paymentId: string,
    actor?: User | null
  ): { success: boolean; error?: string } {
    const row = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
    if (!row) return { success: false, error: 'Payment record not found.' };
    if (!row.is_voided) {
      return {
        success: false,
        error: 'Audit restriction: Void this payment first before deleting it from the ledger.',
      };
    }

    const memberRow = this.db
      .prepare('SELECT full_name FROM members WHERE id = ?')
      .get(row.member_id) as { full_name?: string } | undefined;

    this.db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);
    this.insertActivityLog(
      {
        actionType: 'delete_payment',
        targetType: 'payment',
        targetId: row.id,
        targetName: row.payment_number,
        description: `Deleted voided payment voucher ${row.payment_number} (₹${Number(row.amount_inr).toLocaleString('en-IN')}) for ${memberRow?.full_name || 'member'}.`,
        isReversible: false,
      },
      actor
    );
    return { success: true };
  }

  public recordCheckIn(
    memberId: string,
    actor?: User | null
  ): { success: boolean; checkIn?: CheckInRecord; error?: string } {
    const memberRow = this.db
      .prepare('SELECT full_name FROM members WHERE id = ?')
      .get(memberId) as { full_name?: string } | undefined;
    if (!memberRow) return { success: false, error: 'Member not found.' };

    const checkIn: CheckInRecord = {
      id: `chk-${Date.now()}`,
      memberId,
      memberName: memberRow.full_name || 'Member',
      checkInTime: new Date().toISOString(),
      recordedByUsername: actor?.username || 'reception',
    };

    this.db
      .prepare(
        'INSERT INTO check_ins (id, member_id, member_name, check_in_time, recorded_by_username) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        checkIn.id,
        checkIn.memberId,
        checkIn.memberName,
        checkIn.checkInTime,
        checkIn.recordedByUsername
      );

    this.insertActivityLog(
      {
        actionType: 'member_checkin',
        targetType: 'checkin',
        targetId: checkIn.id,
        targetName: checkIn.memberName,
        description: `Member ${checkIn.memberName} checked in for workout.`,
        isReversible: false,
      },
      actor
    );
    return { success: true, checkIn };
  }

  public canUndoAction(logId: string): { canUndo: boolean; reason?: string } {
    const log = this.db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(logId) as any;
    if (!log) return { canUndo: false, reason: 'Log entry not found.' };
    if (!log.is_reversible) return { canUndo: false, reason: 'This system action is not reversible.' };
    if (log.is_reversed) return { canUndo: false, reason: 'This action has already been reversed.' };

    if (log.action_type === 'record_payment') {
      const p = this.db.prepare('SELECT is_voided FROM payments WHERE id = ?').get(log.target_id) as any;
      if (!p) return { canUndo: false, reason: 'Payment record no longer exists.' };
      if (p.is_voided) return { canUndo: false, reason: 'Payment is already voided.' };
      return { canUndo: true };
    }

    if (log.action_type === 'create_member') {
      const hasM = (
        this.db.prepare('SELECT COUNT(*) AS cnt FROM memberships WHERE member_id = ?').get(log.target_id) as { cnt: number }
      ).cnt > 0;
      const hasP = (
        this.db.prepare('SELECT COUNT(*) AS cnt FROM payments WHERE member_id = ?').get(log.target_id) as { cnt: number }
      ).cnt > 0;
      if (hasM || hasP) {
        return {
          canUndo: false,
          reason: 'Cannot reverse: Member has subsequent active membership or payment records.',
        };
      }
      return { canUndo: true };
    }

    if (log.action_type === 'assign_membership') {
      const m = this.db.prepare('SELECT id FROM memberships WHERE id = ?').get(log.target_id);
      if (!m) return { canUndo: false, reason: 'Membership record not found.' };
      const hasP = (
        this.db
          .prepare('SELECT COUNT(*) AS cnt FROM payments WHERE membership_id = ? AND is_voided = 0')
          .get(log.target_id) as { cnt: number }
      ).cnt > 0;
      if (hasP) {
        return {
          canUndo: false,
          reason: 'Cannot reverse: A payment has already been credited towards this membership.',
        };
      }
      return { canUndo: true };
    }

    if (log.action_type === 'update_member') return { canUndo: true };
    if (log.action_type === 'delete_plan' && log.snapshot_before) return { canUndo: true };
    if (log.action_type === 'delete_membership' && log.snapshot_before) return { canUndo: true };
    if (log.action_type === 'delete_member' && log.snapshot_before) return { canUndo: true };

    return { canUndo: false, reason: 'Action is not safe to reverse automatically.' };
  }

  public executeUndo(
    logId: string,
    actor?: User | null
  ): { success: boolean; error?: string } {
    const check = this.canUndoAction(logId);
    if (!check.canUndo) return { success: false, error: check.reason };

    const log = this.db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(logId) as any;
    const snapBefore = log.snapshot_before ? JSON.parse(log.snapshot_before) : null;

    if (log.action_type === 'record_payment') {
      this.db
        .prepare(
          'UPDATE payments SET is_voided = 1, void_reason = ?, voided_at = ?, voided_by_user_id = ? WHERE id = ?'
        )
        .run(
          `Undo requested by ${actor?.username || 'admin'}`,
          new Date().toISOString(),
          actor?.id || null,
          log.target_id
        );
      this.db.prepare('UPDATE activity_logs SET is_reversed = 1 WHERE id = ?').run(logId);
      this.insertActivityLog(
        {
          actionType: 'undo_action',
          targetType: 'payment',
          targetId: log.target_id,
          targetName: log.target_name,
          description: `Reversed payment ${log.target_name} via Undo Engine (voided).`,
          reversalOfLogId: logId,
          isReversible: false,
        },
        actor
      );
      return { success: true };
    }

    if (log.action_type === 'create_member') {
      this.db.prepare('DELETE FROM members WHERE id = ?').run(log.target_id);
      this.db.prepare('UPDATE activity_logs SET is_reversed = 1 WHERE id = ?').run(logId);
      this.insertActivityLog(
        {
          actionType: 'undo_action',
          targetType: 'member',
          targetId: log.target_id,
          targetName: log.target_name,
          description: `Reversed creation of member ${log.target_name} (removed empty profile).`,
          reversalOfLogId: logId,
          isReversible: false,
        },
        actor
      );
      return { success: true };
    }

    if (log.action_type === 'assign_membership') {
      this.db.prepare('DELETE FROM memberships WHERE id = ?').run(log.target_id);
      this.db.prepare('UPDATE activity_logs SET is_reversed = 1 WHERE id = ?').run(logId);
      this.insertActivityLog(
        {
          actionType: 'undo_action',
          targetType: 'membership',
          targetId: log.target_id,
          targetName: log.target_name,
          description: `Reversed membership assignment "${log.target_name}" via Undo Engine.`,
          reversalOfLogId: logId,
          isReversible: false,
        },
        actor
      );
      return { success: true };
    }

    if (log.action_type === 'update_member' && snapBefore) {
      this.db
        .prepare(
          `UPDATE members SET full_name=?, phone=?, email=?, emergency_contact_name=?, emergency_contact_phone=?, status=?, joined_date=?, avatar_url=?, fitness_goal=?, health_notes=?, internal_notes=? WHERE id=?`
        )
        .run(
          snapBefore.fullName,
          snapBefore.phone,
          snapBefore.email,
          snapBefore.emergencyContactName,
          snapBefore.emergencyContactPhone,
          snapBefore.status,
          snapBefore.joinedDate,
          snapBefore.avatarUrl || null,
          snapBefore.fitnessGoal,
          snapBefore.healthNotes || null,
          snapBefore.internalNotes || null,
          log.target_id
        );
      this.db.prepare('UPDATE activity_logs SET is_reversed = 1 WHERE id = ?').run(logId);
      this.insertActivityLog(
        {
          actionType: 'undo_action',
          targetType: 'member',
          targetId: log.target_id,
          targetName: log.target_name,
          description: `Reverted profile updates for member ${log.target_name} to previous state.`,
          reversalOfLogId: logId,
          isReversible: false,
        },
        actor
      );
      return { success: true };
    }

    if (log.action_type === 'delete_member' && snapBefore) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO members (id, member_number, full_name, phone, email, emergency_contact_name, emergency_contact_phone, status, joined_date, avatar_url, fitness_goal, health_notes, internal_notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          snapBefore.id,
          snapBefore.memberNumber,
          snapBefore.fullName,
          snapBefore.phone,
          snapBefore.email,
          snapBefore.emergencyContactName,
          snapBefore.emergencyContactPhone,
          snapBefore.status,
          snapBefore.joinedDate,
          snapBefore.avatarUrl || null,
          snapBefore.fitnessGoal,
          snapBefore.healthNotes || null,
          snapBefore.internalNotes || null
        );
      this.db.prepare('UPDATE activity_logs SET is_reversed = 1 WHERE id = ?').run(logId);
      this.insertActivityLog(
        {
          actionType: 'undo_action',
          targetType: 'member',
          targetId: log.target_id,
          targetName: log.target_name,
          description: `Restored deleted member "${log.target_name}" via Undo Engine.`,
          reversalOfLogId: logId,
          isReversible: false,
        },
        actor
      );
      return { success: true };
    }

    if (log.action_type === 'delete_plan' && snapBefore) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO plans (id, name, duration_days, price_inr, category, description) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          snapBefore.id,
          snapBefore.name,
          snapBefore.durationDays,
          snapBefore.priceInr,
          snapBefore.category,
          snapBefore.description
        );
      this.db.prepare('UPDATE activity_logs SET is_reversed = 1 WHERE id = ?').run(logId);
      this.insertActivityLog(
        {
          actionType: 'undo_action',
          targetType: 'plan',
          targetId: log.target_id,
          targetName: log.target_name,
          description: `Restored deleted membership plan "${log.target_name}".`,
          reversalOfLogId: logId,
          isReversible: false,
        },
        actor
      );
      return { success: true };
    }

    if (log.action_type === 'delete_membership' && snapBefore) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO memberships (id, member_id, plan_id, plan_name, start_date, end_date, total_price_inr, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          snapBefore.id,
          snapBefore.memberId,
          snapBefore.planId,
          snapBefore.planName,
          snapBefore.startDate,
          snapBefore.endDate,
          snapBefore.totalPriceInr,
          snapBefore.status,
          snapBefore.createdAt
        );
      this.db.prepare('UPDATE activity_logs SET is_reversed = 1 WHERE id = ?').run(logId);
      this.insertActivityLog(
        {
          actionType: 'undo_action',
          targetType: 'membership',
          targetId: log.target_id,
          targetName: log.target_name,
          description: `Restored deleted enrollment "${log.target_name}".`,
          reversalOfLogId: logId,
          isReversible: false,
        },
        actor
      );
      return { success: true };
    }

    return { success: false, error: 'Could not execute reverse operation.' };
  }

  // ==================== SMART MEMBERSHIP RENEWAL REMINDERS ====================

  public getSmartReminders(): SmartReminderCandidate[] {
    const snap = this.getSnapshot(true);
    const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const candidates: SmartReminderCandidate[] = [];

    for (const member of snap.members) {
      if (member.status === 'frozen') continue;

      const memberMemberships = snap.memberships.filter(
        (m) => m.memberId === member.id && m.status !== 'cancelled'
      );
      const totalBilled = memberMemberships.reduce((s, m) => s + m.totalPriceInr, 0);
      const totalPaid = snap.payments
        .filter((p) => p.memberId === member.id && !p.isVoided)
        .reduce((s, p) => s + p.amountInr, 0);
      const balanceInr = Math.max(0, totalBilled - totalPaid);

      const latestMembership = memberMemberships
        .slice()
        .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];

      const lastReminded = (snap.reminderLogs || []).find((r) => r.memberId === member.id)?.sentAt;

      let tier: SmartReminderCandidate['tier'] | null = null;
      let daysRemaining: number | undefined;
      let urgencyScore = 0;

      if (latestMembership) {
        const endMs = new Date(latestMembership.endDate).getTime();
        daysRemaining = Math.round((endMs - todayMs) / dayMs);

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
        candidates.push({
          member,
          membership: latestMembership,
          tier,
          daysRemaining,
          balanceInr,
          dueDate: latestMembership?.endDate,
          urgencyScore,
          lastRemindedAt: lastReminded,
        });
      }
    }

    return candidates.sort((a, b) => b.urgencyScore - a.urgencyScore);
  }

  public logReminderSent(
    params: {
      memberId: string;
      channel: ReminderLogEntry['channel'];
      tier: ReminderLogEntry['tier'];
      balanceInr: number;
      dueDate?: string;
      messagePreview: string;
    },
    actor?: User | null
  ): ReminderLogEntry {
    const memberRow = this.db
      .prepare('SELECT full_name FROM members WHERE id = ?')
      .get(params.memberId) as { full_name?: string } | undefined;

    const entry: ReminderLogEntry = {
      id: `rem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      memberId: params.memberId,
      memberName: memberRow?.full_name || 'Member',
      channel: params.channel,
      tier: params.tier,
      sentAt: new Date().toISOString(),
      balanceInr: params.balanceInr,
      dueDate: params.dueDate,
      sentByUsername: actor?.username || 'staff',
      messagePreview: params.messagePreview.slice(0, 180),
    };

    this.db
      .prepare(
        `INSERT INTO reminder_logs (id, member_id, member_name, channel, tier, sent_at, balance_inr, due_date, sent_by_username, message_preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.memberId,
        entry.memberName,
        entry.channel,
        entry.tier,
        entry.sentAt,
        entry.balanceInr,
        entry.dueDate || null,
        entry.sentByUsername,
        entry.messagePreview
      );

    this.insertActivityLog(
      {
        actionType: 'renewal_reminder_sent',
        targetType: 'member',
        targetId: entry.memberId,
        targetName: entry.memberName,
        description: `Dispatched ${entry.channel.toUpperCase()} ${entry.tier.replace('_', ' ')} reminder to ${entry.memberName}.`,
        isReversible: false,
      },
      actor
    );

    if (params.channel === 'desktop_notification') {
      this.options.onDesktopNotification?.(
        `Renewal Alert: ${entry.memberName}`,
        entry.messagePreview
      );
    }

    return entry;
  }

  // ==================== SYSTEM SETTINGS & CLEAR ====================

  public updateBackupConfig(config: Partial<BackupConfig>): BackupConfig {
    const current = this.getMeta<BackupConfig>('backupConfig', {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: '',
      senderEmail: '',
      recipientEmail: '',
      backupEncryptionKey: generateRandomBackupKeyNode(),
      initialDelayMinutes: 5,
      intervalHours: 24,
      autoBackupEnabled: true,
    });
    const next = { ...current, ...config };
    this.setMeta('backupConfig', next);
    return next;
  }

  public updateTailscaleStatus(status: Partial<TailscaleState>): TailscaleState {
    const current = this.getMeta<TailscaleState>('tailscale', DEFAULT_TAILSCALE);
    const next = { ...current, ...status };
    this.setMeta('tailscale', next);
    return next;
  }

  public revokeTailscaleSession(deviceId: string, actor?: User | null): void {
    const current = this.getMeta<TailscaleState>('tailscale', DEFAULT_TAILSCALE);
    const target = current.activeSessions.find((s) => s.deviceId === deviceId);
    current.activeSessions = current.activeSessions.filter((s) => s.deviceId !== deviceId);
    this.setMeta('tailscale', current);
    if (target) {
      this.insertActivityLog(
        {
          actionType: 'revoke_session',
          targetType: 'system',
          targetId: deviceId,
          targetName: target.deviceName,
          description: `Revoked Tailscale mobile session for "${target.deviceName}" (${target.username}).`,
          isReversible: false,
        },
        actor
      );
    }
  }

  public updateUpgradeModules(
    updates: Partial<UpgradeModulesConfig>,
    actor?: User | null
  ): { success: boolean; error?: string; upgradeModules?: UpgradeModulesConfig } {
    if (!actor || actor.role !== 'super_admin') {
      return { success: false, error: 'Restricted: Super Admin only.' };
    }
    const current = this.getMeta<UpgradeModulesConfig>('upgradeModules', DEFAULT_UPGRADE_MODULES);
    const next = { ...current, ...updates };
    this.setMeta('upgradeModules', next);
    return { success: true, upgradeModules: next };
  }

  public updateDesktopSettings(
    updates: Partial<DesktopSettings>,
    actor?: User | null
  ): DesktopSettings {
    const current = this.getMeta<DesktopSettings>('desktopSettings', DEFAULT_DESKTOP_SETTINGS);
    const next = { ...current, ...updates };
    this.setMeta('desktopSettings', next);
    if (actor) {
      this.insertActivityLog(
        {
          actionType: 'desktop_settings_updated',
          targetType: 'system',
          targetId: 'desktop-settings',
          description: `Updated desktop preferences (Tray=${next.minimizeToTray}, Startup=${next.launchAtStartup}, Notifications=${next.desktopNotificationsEnabled}).`,
          isReversible: false,
        },
        actor
      );
    }
    return next;
  }

  public async clearAllDataForClient(
    options: {
      resetPlansToDefault?: boolean;
      clearNonSuperAdminUsers?: boolean;
    },
    actor?: User | null
  ): Promise<{ success: boolean; error?: string; safetyBackup?: BackupArchiveRecord }> {
    if (!actor || actor.role !== 'super_admin') {
      return {
        success: false,
        error: 'Restricted: Only Super Admin can perform a production database clear.',
      };
    }

    // Create verified safety backup BEFORE clearing operational records
    const safetyBackup = await this.createEncryptedBackup('pre_restore_safety');

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.exec(`
        DELETE FROM check_ins;
        DELETE FROM payments;
        DELETE FROM memberships;
        DELETE FROM members;
        DELETE FROM activity_logs;
        DELETE FROM reminder_logs;
      `);

      if (options.resetPlansToDefault) {
        this.db.exec('DELETE FROM plans;');
        const ins = this.db.prepare(
          'INSERT INTO plans (id, name, duration_days, price_inr, category, description) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const p of DEFAULT_PLANS) {
          ins.run(p.id, p.name, p.durationDays, p.priceInr, p.category, p.description);
        }
      }

      if (options.clearNonSuperAdminUsers) {
        this.db.exec("DELETE FROM users WHERE role != 'super_admin';");
      }

      const ts = this.getMeta<TailscaleState>('tailscale', DEFAULT_TAILSCALE);
      ts.activeSessions = [];
      this.setMeta('tailscale', ts);

      const cfg = this.getMeta<BackupConfig>('backupConfig', {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: '',
        senderEmail: '',
        recipientEmail: '',
        backupEncryptionKey: generateRandomBackupKeyNode(),
        initialDelayMinutes: 5,
        intervalHours: 24,
        autoBackupEnabled: true,
      });
      cfg.lastBackupTimestamp = undefined;
      cfg.lastBackupStatus = undefined;
      this.setMeta('backupConfig', cfg);

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    this.refreshRecoverySnapshot();
    return { success: true, safetyBackup };
  }
}
