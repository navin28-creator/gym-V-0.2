import express from 'express';
import type { SqliteEngine } from './sqliteEngine';
import { hasPermission, isSuperAdminRole } from '../shared/permissions';
import type { DesktopSettings, User } from '../src/types/gym';

export interface ApiRouterHooks {
  onDesktopSettingsChanged?: (settings: DesktopSettings) => void;
  onCheckForUpdates?: () => Promise<{ status: string; version?: string }>;
  onInstallUpdate?: () => void;
  onWindowControl?: (action: 'minimize' | 'maximize' | 'close') => void;
  onShowNotification?: (title: string, body: string) => void;
}

export function createApiRouter(engine: SqliteEngine, hooks: ApiRouterHooks = {}): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '50mb' }));

  const getActor = (req: express.Request): User | null => {
    const authHeader = req.headers.authorization;
    const headerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : (req.headers['x-session-token'] as string | undefined);
    return engine.getSessionUser(headerToken);
  };

  const requireAuth = (req: express.Request, res: express.Response): User | null => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
      return null;
    }
    return actor;
  };

  router.get('/health', (_req, res) => {
    const report = engine.runIntegrityCheck(false);
    res.json({
      ok: report.status !== 'corrupted',
      runtime: engine.runtime,
      sqlitePath: engine.dbPath,
      integrity: report,
    });
  });

  // Bootstrap full database state for UI hydration (sanitized password hashes)
  router.get('/bootstrap', (req, res) => {
    const actor = getActor(req);
    const db = engine.getSnapshot(true);
    res.json({
      success: true,
      db,
      currentUser: actor,
      reminders: engine.getSmartReminders(),
    });
  });

  // ==================== AUTH & ACCOUNTS ====================

  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const result = engine.authenticate(String(username || ''), String(password || ''));
    if (!result.success) {
      res.status(401).json(result);
      return;
    }
    res.json({
      ...result,
      db: engine.getSnapshot(true),
    });
  });

  router.post('/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : (req.headers['x-session-token'] as string | undefined);
    engine.signOut(token);
    res.json({ success: true });
  });

  router.post('/auth/create-user', (req, res) => {
    const actor = getActor(req);
    const { username, fullName, passwordPlain, role } = req.body || {};
    const result = engine.createUserAccount(
      { username, fullName, passwordPlain, role },
      actor
    );
    if (!result.success) {
      res.status(403).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/auth/recover-local', (req, res) => {
    const { newPasswordPlain } = req.body || {};
    const result = engine.performLocalRecovery(String(newPasswordPlain || ''));
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/auth/recover-email', (req, res) => {
    const { email, code, newPasswordPlain } = req.body || {};
    const result = engine.resetPasswordViaEmail(
      String(email || ''),
      String(code || ''),
      String(newPasswordPlain || '')
    );
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/auth/verify-email', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const { userId, email } = req.body || {};
    if (actor.id !== userId && !isSuperAdminRole(actor.role)) {
      res.status(403).json({ success: false, error: 'Cannot verify email for another account.' });
      return;
    }
    const result = engine.verifyAccountEmail(String(userId), String(email || ''));
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/users/update-role', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const { userId, newRole, applyRoleDefaults } = req.body || {};
    const result = engine.updateUserRole(userId, newRole, applyRoleDefaults ?? true, actor);
    if (!result.success) {
      res.status(403).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/users/update-permissions', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const { userId, permissions } = req.body || {};
    const result = engine.updateUserPermissions(userId, permissions || {}, actor);
    if (!result.success) {
      res.status(403).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/users/delete', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const { userId } = req.body || {};
    const result = engine.deleteUserAccount(userId, actor);
    if (!result.success) {
      res.status(403).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  // ==================== MIGRATION FROM LEGACY LOCALSTORAGE ====================

  router.post('/migrate/inspect', (req, res) => {
    const { legacyDb } = req.body || {};
    const report = engine.inspectMigrationCompatibility(legacyDb || {});
    res.json({ success: true, ...report });
  });

  router.post('/migrate/localstorage', async (req, res) => {
    try {
      const actor = getActor(req);
      const { legacyDb, mode } = req.body || {};
      if (!legacyDb || !Array.isArray(legacyDb.members)) {
        res.status(400).json({ success: false, message: 'Invalid legacy database payload.' });
        return;
      }
      const result = await engine.migrateLegacySnapshot(
        legacyDb,
        mode || 'auto_if_empty',
        actor
      );
      res.json({ ...result, db: engine.getSnapshot(true) });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Migration failed.' });
    }
  });

  // ==================== MEMBERS, PLANS, MEMBERSHIPS, PAYMENTS, CHECKINS ====================

  router.post('/members/add', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageMembers')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManageMembers required.' });
      return;
    }
    const member = engine.addMember(req.body, actor);
    res.json({ success: true, member, db: engine.getSnapshot(true) });
  });

  router.post('/members/update', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageMembers')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManageMembers required.' });
      return;
    }
    const { id, updates } = req.body || {};
    const member = engine.updateMember(id, updates || {}, actor);
    if (!member) {
      res.status(404).json({ success: false, error: 'Member not found.' });
      return;
    }
    res.json({ success: true, member, db: engine.getSnapshot(true) });
  });

  router.post('/members/delete', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canDeleteMembers')) {
      res.status(403).json({ success: false, error: 'Permission denied: canDeleteMembers required.' });
      return;
    }
    const { id } = req.body || {};
    const result = engine.deleteMember(id, actor);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/plans/create', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManagePlans')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManagePlans required.' });
      return;
    }
    const plan = engine.createPlan(req.body, actor);
    res.json({ success: true, plan, db: engine.getSnapshot(true) });
  });

  router.post('/plans/delete', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManagePlans')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManagePlans required.' });
      return;
    }
    const { planId } = req.body || {};
    const result = engine.deletePlan(planId, actor);
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/memberships/assign', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageMembers')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManageMembers required.' });
      return;
    }
    const { memberId, planId, startDateStr } = req.body || {};
    const membership = engine.assignMembership(memberId, planId, startDateStr, actor);
    res.json({ success: true, membership, db: engine.getSnapshot(true) });
  });

  router.post('/memberships/delete', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManagePlans')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManagePlans required.' });
      return;
    }
    const { membershipId } = req.body || {};
    const result = engine.deleteMembership(membershipId, actor);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/payments/record', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canRecordPayments')) {
      res.status(403).json({ success: false, error: 'Permission denied: canRecordPayments required.' });
      return;
    }
    const payment = engine.recordPayment(req.body, actor);
    res.json({ success: true, payment, db: engine.getSnapshot(true) });
  });

  router.post('/payments/void', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canVoidAndDeletePayments')) {
      res.status(403).json({
        success: false,
        error: 'Permission denied: canVoidAndDeletePayments required.',
      });
      return;
    }
    const { paymentId, voidReason } = req.body || {};
    const result = engine.voidPayment(paymentId, voidReason, actor);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/payments/delete', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canVoidAndDeletePayments')) {
      res.status(403).json({
        success: false,
        error: 'Permission denied: canVoidAndDeletePayments required.',
      });
      return;
    }
    const { paymentId } = req.body || {};
    const result = engine.deletePayment(paymentId, actor);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/checkins/record', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const { memberId } = req.body || {};
    const result = engine.recordCheckIn(memberId, actor);
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/activity/undo', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canUndoActions')) {
      res.status(403).json({ success: false, error: 'Permission denied: canUndoActions required.' });
      return;
    }
    const { logId } = req.body || {};
    const result = engine.executeUndo(logId, actor);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  // ==================== SMART RENEWAL REMINDERS ====================

  router.get('/reminders', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    res.json({
      success: true,
      reminders: engine.getSmartReminders(),
    });
  });

  router.post('/reminders/log', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canSendPaymentReminders')) {
      res.status(403).json({
        success: false,
        error: 'Permission denied: canSendPaymentReminders required.',
      });
      return;
    }
    const entry = engine.logReminderSent(req.body, actor);
    res.json({
      success: true,
      entry,
      reminders: engine.getSmartReminders(),
      db: engine.getSnapshot(true),
    });
  });

  // ==================== INTEGRITY, BACKUPS & RESTORE VERIFICATION ====================

  router.post('/integrity/check', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const report = engine.runIntegrityCheck(true, actor);
    res.json({ success: true, report, db: engine.getSnapshot(true) });
  });

  router.get('/backups/export-sqlite', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canExportData')) {
      res.status(403).json({ success: false, error: 'Permission denied: canExportData required.' });
      return;
    }
    const bytes = engine.exportGenuineSqliteBytes();
    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="gym-${new Date().toISOString().slice(0, 10)}.sqlite"`
    );
    res.send(bytes);
  });

  router.post('/backups/config', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageBackups')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManageBackups required.' });
      return;
    }
    const backupConfig = engine.updateBackupConfig(req.body || {});
    res.json({ success: true, backupConfig, db: engine.getSnapshot(true) });
  });

  router.post('/backups/create', async (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageBackups')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManageBackups required.' });
      return;
    }
    try {
      const record = await engine.createEncryptedBackup('manual');
      res.json({ success: true, record, db: engine.getSnapshot(true) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Backup creation failed.' });
    }
  });

  router.get('/backups/download/:backupId', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canExportData') && !hasPermission(actor, 'canManageBackups')) {
      res.status(403).json({ success: false, error: 'Permission denied.' });
      return;
    }
    const snap = engine.getSnapshot(true);
    const rec = snap.backupHistory?.find((b) => b.id === req.params.backupId);
    if (!rec) {
      res.status(404).json({ success: false, error: 'Backup record not found.' });
      return;
    }
    res.download(rec.filePath, rec.fileName);
  });

  router.post('/backups/verify', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageBackups')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManageBackups required.' });
      return;
    }
    const { backupId, encryptedBase64, keyOverride } = req.body || {};
    const verification = engine.verifyEncryptedBackupPayload({
      backupId,
      encryptedBytes: encryptedBase64 ? Buffer.from(encryptedBase64, 'base64') : undefined,
      keyOverride,
    });
    res.json(verification);
  });

  router.post('/backups/restore', async (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageBackups')) {
      res.status(403).json({ success: false, error: 'Permission denied: canManageBackups required.' });
      return;
    }
    const { backupId, plainJsonString, encryptedBase64, keyOverride, confirmed } = req.body || {};
    if (!confirmed) {
      res.status(400).json({
        success: false,
        error: 'Explicit user confirmation is required before overwriting active SQLite data.',
      });
      return;
    }
    const result = await engine.restoreVerifiedBackup({
      backupId,
      plainJsonString,
      encryptedBytes: encryptedBase64 ? Buffer.from(encryptedBase64, 'base64') : undefined,
      keyOverride,
      confirmed: true,
      actor,
    });
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  // ==================== TAILSCALE, UPGRADES, DESKTOP & CLEAR ====================

  router.post('/tailscale/update', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageTailscale')) {
      res.status(403).json({ success: false, error: 'Permission denied.' });
      return;
    }
    const tailscale = engine.updateTailscaleStatus(req.body || {});
    res.json({ success: true, tailscale, db: engine.getSnapshot(true) });
  });

  router.post('/tailscale/revoke', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (!hasPermission(actor, 'canManageTailscale')) {
      res.status(403).json({ success: false, error: 'Permission denied.' });
      return;
    }
    engine.revokeTailscaleSession(req.body?.deviceId, actor);
    res.json({ success: true, db: engine.getSnapshot(true) });
  });

  router.post('/upgrades/update', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const result = engine.updateUpgradeModules(req.body || {}, actor);
    if (!result.success) {
      res.status(403).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  router.post('/desktop/settings', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const desktopSettings = engine.updateDesktopSettings(req.body || {}, actor);
    hooks.onDesktopSettingsChanged?.(desktopSettings);
    res.json({ success: true, desktopSettings, db: engine.getSnapshot(true) });
  });

  router.post('/desktop/check-updates', async (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    if (hooks.onCheckForUpdates) {
      const updateResult = await hooks.onCheckForUpdates();
      engine.updateDesktopSettings({
        lastUpdateCheck: new Date().toISOString(),
        updateStatus: updateResult.status,
      });
      res.json({ success: true, ...updateResult, db: engine.getSnapshot(true) });
      return;
    }
    const offlineMsg =
      'Running in local server mode. Automatic installer updates are handled inside the packaged Windows desktop (.exe) app.';
    engine.updateDesktopSettings({
      lastUpdateCheck: new Date().toISOString(),
      updateStatus: offlineMsg,
    });
    res.json({ success: true, status: offlineMsg, db: engine.getSnapshot(true) });
  });

  router.post('/desktop/notify-test', (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const title = req.body?.title || 'Flex & Flow Desktop Alert';
    const body = req.body?.body || 'Windows native notifications & SQLite engine are active.';
    hooks.onShowNotification?.(title, body);
    res.json({ success: true });
  });

  router.post('/admin/clear-all', async (req, res) => {
    const actor = requireAuth(req, res);
    if (!actor) return;
    const { resetPlansToDefault, clearNonSuperAdminUsers, confirmed } = req.body || {};
    if (!confirmed) {
      res.status(400).json({
        success: false,
        error: 'Explicit confirmation is required to clear client data.',
      });
      return;
    }
    const result = await engine.clearAllDataForClient(
      { resetPlansToDefault, clearNonSuperAdminUsers },
      actor
    );
    if (!result.success) {
      res.status(403).json(result);
      return;
    }
    res.json({ ...result, db: engine.getSnapshot(true) });
  });

  return router;
}
