import React, { useState, useEffect } from 'react';
import { GymDatabase, BackupConfig, BackupArchiveRecord, User } from '../types/gym';
import { dbService, hasPermission, isSuperAdminRole } from '../services/db';
import { AnimatedSectionPanel } from './MotionPrimitives';
import {
  generateRandomBackupKey,
  isValid32ByteBase64Key,
  formatKolkataDateTime,
} from '../services/crypto';
import {
  Download,
  Lock,
  Unlock,
  Key,
  Mail,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Copy,
  Check,
  Database,
  Activity,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface BackupsViewProps {
  db: GymDatabase;
  currentUser: User | null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BackupsView: React.FC<BackupsViewProps> = ({ db, currentUser }) => {
  const [config, setConfig] = useState<BackupConfig>(db.backupConfig);
  const [copiedKey, setCopiedKey] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Integrity Check State
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);

  // Decryption & Restore State
  const [decryptKeyInput, setDecryptKeyInput] = useState(db.backupConfig.backupEncryptionKey);
  const [encryptedFileContent, setEncryptedFileContent] = useState<Uint8Array | null>(null);
  const [encryptedFileName, setEncryptedFileName] = useState<string>('');
  const [verifiedSummary, setVerifiedSummary] = useState<{
    source: 'upload' | 'vault';
    backupId?: string;
    fileName?: string;
    memberCount: number;
    membershipCount: number;
    paymentCount: number;
    userCount: number;
    createdAt?: string;
    sqliteBinaryVerified: boolean;
    sha256Match: boolean;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreConfirmedCheck, setRestoreConfirmedCheck] = useState(false);

  // Client Clear State
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearKeepPlans, setClearKeepPlans] = useState(true);

  useEffect(() => {
    setConfig(db.backupConfig);
    setDecryptKeyInput(db.backupConfig.backupEncryptionKey);
  }, [db.backupConfig]);

  const integrity = db.integrityReport;
  const vaultBackups: BackupArchiveRecord[] = db.backupHistory || [];

  // Save config
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid32ByteBase64Key(config.backupEncryptionKey)) {
      setStatusMsg({
        type: 'error',
        text: 'Backup encryption key must be a valid 32-byte base64 encoded string.',
      });
      return;
    }
    dbService.updateBackupConfig(config);
    setStatusMsg({ type: 'success', text: 'SQLite daily backup configuration saved.' });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  // Generate new key
  const handleRegenerateKey = () => {
    const newKey = generateRandomBackupKey();
    setConfig({ ...config, backupEncryptionKey: newKey });
    setDecryptKeyInput(newKey);
    setStatusMsg({
      type: 'success',
      text: 'Generated fresh 32-byte AES-256-GCM encryption key. Save configuration to apply.',
    });
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(config.backupEncryptionKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Run SQLite Integrity Check
  const handleRunIntegrityCheck = async () => {
    setIsCheckingIntegrity(true);
    setStatusMsg(null);
    const res = await dbService.runIntegrityCheckAsync();
    setIsCheckingIntegrity(false);
    if (res.success && res.report) {
      setStatusMsg({
        type: res.report.status === 'healthy' ? 'success' : 'error',
        text: `SQLite PRAGMA integrity_check: ${res.report.sqliteIntegrityCheck} · WAL mode: ${res.report.walMode} · Foreign key issues: ${res.report.foreignKeyIssues}`,
      });
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Integrity check failed.' });
    }
  };

  // 1. Download genuine binary SQLite snapshot
  const handleDownloadUnencryptedSnapshot = async () => {
    const res = await dbService.downloadGenuineSqliteFile();
    if (!res.success) {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to export SQLite database.' });
    } else {
      setStatusMsg({
        type: 'success',
        text: 'Genuine binary gym.sqlite snapshot exported successfully.',
      });
    }
  };

  // 2. Create AES-256-GCM encrypted backup on disk & vault
  const handleDownloadEncryptedBackup = async () => {
    try {
      const res = await dbService.createEncryptedBackupOnDiskAsync();
      if (!res.success || !res.record) {
        setStatusMsg({ type: 'error', text: res.error || 'Failed to create encrypted backup.' });
        return;
      }
      await dbService.downloadVaultBackupFile(res.record);
      setStatusMsg({
        type: 'success',
        text: `Encrypted & integrity-verified snapshot "${res.record.fileName}" saved to vault and downloaded.`,
      });
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Encryption failed.' });
    }
  };

  // Handle uploaded encrypted file
  const handleEncryptedFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEncryptedFileName(file.name);
    setVerifiedSummary(null);
    setRestoreConfirmedCheck(false);
    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      setEncryptedFileContent(new Uint8Array(buffer));
    };
    reader.readAsArrayBuffer(file);
  };

  // Verify uploaded .sqlite.enc via real backend SQLite temp-check
  const handleRunVerifyUploaded = async () => {
    if (!encryptedFileContent) {
      setStatusMsg({ type: 'error', text: 'Please select an encrypted (.sqlite.enc) file first.' });
      return;
    }

    setIsVerifying(true);
    setStatusMsg(null);
    setRestoreConfirmedCheck(false);

    try {
      const encryptedBase64 = uint8ToBase64(encryptedFileContent);
      const res = await dbService.verifyBackupOnBackendAsync({
        encryptedBase64,
        keyOverride: decryptKeyInput,
      });
      if (!res.valid || !res.summary) {
        setVerifiedSummary(null);
        setStatusMsg({
          type: 'error',
          text: res.error || 'Verification failed. Ensure the 32-byte key and file integrity match.',
        });
      } else {
        setVerifiedSummary({
          source: 'upload',
          fileName: encryptedFileName,
          ...res.summary,
        });
        setStatusMsg({
          type: 'success',
          text: `AES-256-GCM decrypted & SQLite PRAGMA integrity_check verified for ${encryptedFileName}. Ready to restore safely.`,
        });
      }
    } catch (e: any) {
      setStatusMsg({
        type: 'error',
        text: `Verification error: ${e.message}`,
      });
      setVerifiedSummary(null);
    } finally {
      setIsVerifying(false);
    }
  };

  // Verify a backup directly from the local Backup Vault
  const handleVerifyVaultBackup = async (record: BackupArchiveRecord) => {
    setIsVerifying(true);
    setStatusMsg(null);
    setRestoreConfirmedCheck(false);
    try {
      const res = await dbService.verifyBackupOnBackendAsync({
        backupId: record.id,
        keyOverride: decryptKeyInput,
      });
      if (!res.valid || !res.summary) {
        setVerifiedSummary(null);
        setStatusMsg({
          type: 'error',
          text: res.error || `Failed to verify ${record.fileName}.`,
        });
      } else {
        setVerifiedSummary({
          source: 'vault',
          backupId: record.id,
          fileName: record.fileName,
          ...res.summary,
        });
        setStatusMsg({
          type: 'success',
          text: `Vault archive "${record.fileName}" passed SHA-256 & SQLite integrity check. Confirm below to restore.`,
        });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Vault verification failed.' });
    } finally {
      setIsVerifying(false);
    }
  };

  // Restore Database with mandatory safety backup
  const handleRestoreDatabase = async () => {
    if (!verifiedSummary || !restoreConfirmedCheck) return;
    setIsRestoring(true);
    try {
      const res = await dbService.restoreVerifiedBackupAsync({
        backupId: verifiedSummary.source === 'vault' ? verifiedSummary.backupId : undefined,
        encryptedBase64:
          verifiedSummary.source === 'upload' && encryptedFileContent
            ? uint8ToBase64(encryptedFileContent)
            : undefined,
        keyOverride: decryptKeyInput,
        confirmed: true,
      });

      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: `Database restored safely! Pre-restore safety snapshot saved${
            res.safetyBackup ? ` (${res.safetyBackup.fileName})` : ''
          }.`,
        });
        setVerifiedSummary(null);
        setRestoreConfirmedCheck(false);
      } else {
        setStatusMsg({ type: 'error', text: res.error || 'Restore failed.' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Restore failed.' });
    } finally {
      setIsRestoring(false);
    }
  };

  if (!hasPermission(currentUser, 'canManageBackups')) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center space-y-3">
          <Lock className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Backups & SQLite Restore Restricted</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Your account does not currently have the <strong>AES-256 Backups & SQLite Restore</strong> permission. A Super Admin can grant this access in Admin Permissions.
          </p>
        </AnimatedSectionPanel>
      </div>
    );
  }

  const canExportData = hasPermission(currentUser, 'canExportData');
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);

  const handleClearForClient = async () => {
    const res = await dbService.clearAllDataForClientAsync({
      resetPlansToDefault: !clearKeepPlans,
      confirmed: true,
    });
    if (res.success) {
      setConfirmClearOpen(false);
      setVerifiedSummary(null);
      setStatusMsg({
        type: 'success',
        text: `Operational records cleared after verified safety backup${
          res.safetyBackup ? ` (${res.safetyBackup.fileName})` : ''
        }. Workspace is ready for client use.`,
      });
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to clear workspace data.' });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            SQLite Engine, Integrity & Backups
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Genuine WAL SQLite primary database · AES-256-GCM daily encrypted backups · Verified crash recovery
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRunIntegrityCheck}
            disabled={isCheckingIntegrity}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/70 rounded-lg transition-colors"
          >
            <Activity className="w-4 h-4" />
            <span>{isCheckingIntegrity ? 'Checking SQLite...' : 'Run Integrity Check'}</span>
          </button>

          {canExportData ? (
            <>
              <button
                onClick={handleDownloadUnencryptedSnapshot}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Export .sqlite</span>
              </button>
              <button
                onClick={handleDownloadEncryptedBackup}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-xs"
              >
                <Lock className="w-4 h-4" />
                <span>Create Encrypted Backup Now</span>
              </button>
            </>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>File Export Restricted by Super Admin</span>
            </span>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-800 text-rose-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* SQLite Engine & Crash Recovery Health Card */}
      <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">SQLite Database & Crash Recovery Health</h3>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/70">
              {integrity?.sqliteIntegrityCheck === 'ok' ? 'INTEGRITY OK' : integrity?.status?.toUpperCase() || 'ACTIVE'}
            </span>
            <span className="px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/70">
              JOURNAL: {(integrity?.walMode || 'wal').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">Database File</span>
            <span className="text-neutral-200 font-mono truncate block mt-0.5" title={db.dbPath}>
              {db.dbPath}
            </span>
            <span className="text-neutral-400 font-mono text-[11px]">
              {formatBytes(integrity?.dbSizeBytes || 0)}
            </span>
          </div>
          <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">Records Persisted</span>
            <span className="text-white font-mono font-bold text-sm block mt-0.5">
              {db.members.length} members · {db.payments.length} receipts
            </span>
            <span className="text-neutral-400 font-mono text-[11px]">
              {db.memberships.length} enrollments · {db.activityLogs.length} logs
            </span>
          </div>
          <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">Foreign Keys & Schema</span>
            <span className="text-emerald-400 font-mono font-bold text-sm block mt-0.5">
              {integrity?.foreignKeyIssues === 0 ? '0 Orphan Issues' : `${integrity?.foreignKeyIssues || 0} Issues`}
            </span>
            <span className="text-neutral-400 font-mono text-[11px]">
              {integrity?.totalTables || 10} normalized tables
            </span>
          </div>
          <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">Last Checked</span>
            <span className="text-neutral-200 font-mono block mt-0.5">
              {integrity?.checkedAt ? formatKolkataDateTime(integrity.checkedAt) : 'On startup'}
            </span>
            <span className="text-emerald-400 font-mono text-[11px]">
              Last-known-good snapshot active
            </span>
          </div>
        </div>
      </AnimatedSectionPanel>

      {/* Security Warning Notice */}
      <AnimatedSectionPanel className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2 text-xs">
        <div className="flex items-center gap-2 text-amber-400 font-semibold">
          <ShieldAlert className="w-4 h-4" />
          <span>Zero-Overwrite Safety Guarantee</span>
        </div>
        <p className="text-neutral-300 leading-relaxed">
          All encrypted backups embed both your SQLite database binary bytes and a SHA-256 integrity checksum inside an <strong>AES-256-GCM</strong> envelope. Before restoring any backup or running bulk operations, Flex & Flow automatically verifies SQLite schema integrity in an isolated staging database and writes a <strong>pre-restore safety backup</strong> so client records are never lost.
        </p>
      </AnimatedSectionPanel>

      {/* 2-Column Grid: Automated Daily Encrypted Backup Configuration (Left) + Verify & Restore Tool (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Automated Daily Backup & AES-256-GCM Settings */}
        <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-white">Daily Encrypted Backup Configuration</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800">
              AES-256-GCM
            </span>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
            {/* Auto Daily Toggle */}
            <label className="flex items-center justify-between p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg cursor-pointer">
              <div>
                <span className="font-semibold text-neutral-200 block">Automatic Daily Verified Backups</span>
                <span className="text-[11px] text-neutral-500">
                  Creates & verifies encrypted SQLite snapshots on schedule while running
                </span>
              </div>
              <input
                type="checkbox"
                checked={config.autoBackupEnabled}
                onChange={(e) => setConfig({ ...config, autoBackupEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-neutral-700 text-amber-400 focus:ring-0"
              />
            </label>

            {/* Encryption Key */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-neutral-300 font-semibold flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>BACKUP_ENCRYPTION_KEY (32 Bytes Base64)</span>
                </label>
                <button
                  type="button"
                  onClick={handleRegenerateKey}
                  className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Generate Key</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={config.backupEncryptionKey}
                  onChange={(e) => setConfig({ ...config, backupEncryptionKey: e.target.value })}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded flex items-center gap-1"
                  title="Copy Key to Clipboard"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 font-mono mt-1">
                Keep this 32-byte key in a secure password manager for disaster recovery.
              </p>
            </div>

            {/* SMTP Settings */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-neutral-400 mb-1">SMTP Server Host</label>
                <input
                  type="text"
                  value={config.smtpHost}
                  onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Port</label>
                <input
                  type="number"
                  value={config.smtpPort}
                  onChange={(e) => setConfig({ ...config, smtpPort: parseInt(e.target.value) || 587 })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-400 mb-1">Sender Email</label>
                <input
                  type="email"
                  value={config.senderEmail}
                  onChange={(e) => setConfig({ ...config, senderEmail: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Destination Backup Email</label>
                <input
                  type="email"
                  value={config.recipientEmail}
                  onChange={(e) => setConfig({ ...config, recipientEmail: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Interval */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-neutral-400 mb-1">Initial Delay (Minutes)</label>
                <input
                  type="number"
                  value={config.initialDelayMinutes}
                  onChange={(e) =>
                    setConfig({ ...config, initialDelayMinutes: parseInt(e.target.value) || 5 })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Backup Interval (Hours)</label>
                <input
                  type="number"
                  value={config.intervalHours}
                  onChange={(e) =>
                    setConfig({ ...config, intervalHours: parseInt(e.target.value) || 24 })
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            {/* Schedule Status */}
            <div className="p-3 bg-neutral-950/50 border border-neutral-800/80 rounded-lg text-[11px] text-neutral-400 flex items-center justify-between">
              <div>
                <span className="text-neutral-300 font-semibold block">Scheduler Status:</span>
                <span>
                  {config.autoBackupEnabled
                    ? `Repeats every ${config.intervalHours}h while Flex & Flow is running`
                    : 'Paused (Manual backups only)'}
                </span>
              </div>
              <span className="text-emerald-400 font-mono">
                {config.lastBackupTimestamp
                  ? `Last: ${formatKolkataDateTime(config.lastBackupTimestamp).split(',')[0]}`
                  : 'Ready'}
              </span>
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <button
                type="submit"
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-semibold rounded"
              >
                Save Configuration
              </button>
            </div>
          </form>
        </AnimatedSectionPanel>

        {/* Right Column: Verify & Restore Tool */}
        <AnimatedSectionPanel delay={0.05} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Unlock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Verify & Restore Backup Archive</h3>
            </div>
            <span className="text-[10px] font-mono text-neutral-500">
              SQLite Integrity Pre-Check
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <p className="text-neutral-300 leading-relaxed text-[11px]">
              Upload an encrypted <code className="text-amber-300">.sqlite.enc</code> file or select any snapshot from the Verified Backup Vault below. Flex & Flow validates decryption, SHA-256 checksum, and SQLite table integrity before allowing restore.
            </p>

            {/* Upload Encrypted file */}
            <div>
              <label className="block text-neutral-400 mb-1">
                Select Encrypted Snapshot (.sqlite.enc)
              </label>
              <input
                type="file"
                accept=".enc,.sqlite.enc,.bin"
                onChange={handleEncryptedFileUpload}
                className="w-full text-xs text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700 cursor-pointer"
              />
              {encryptedFileName && (
                <span className="text-[11px] font-mono text-emerald-400 block mt-1">
                  Selected: {encryptedFileName} ({encryptedFileContent?.length || 0} bytes)
                </span>
              )}
            </div>

            {/* Key input */}
            <div>
              <label className="block text-neutral-400 mb-1">
                BACKUP_ENCRYPTION_KEY used to encrypt
              </label>
              <input
                type="text"
                value={decryptKeyInput}
                onChange={(e) => setDecryptKeyInput(e.target.value)}
                placeholder="Paste 32-byte Base64 key..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Verify Button */}
            <button
              onClick={handleRunVerifyUploaded}
              disabled={isVerifying || !encryptedFileContent}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white font-semibold rounded transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{isVerifying ? 'Verifying Checksum & SQLite...' : 'Verify Encrypted Archive'}</span>
            </button>

            {/* Verified Preview & Confirmation Restore */}
            {verifiedSummary && (
              <div className="p-3.5 bg-neutral-950 border border-emerald-800/70 rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Integrity Verified: {verifiedSummary.fileName || 'Archive'}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300">
                    {verifiedSummary.sha256Match ? 'SHA-256 OK' : 'CHECK'} · {verifiedSummary.sqliteBinaryVerified ? 'SQLITE OK' : 'LEGACY'}
                  </span>
                </div>

                <div className="text-[11px] font-mono text-neutral-300 grid grid-cols-2 gap-1.5">
                  <div>Members: {verifiedSummary.memberCount}</div>
                  <div>Payments: {verifiedSummary.paymentCount}</div>
                  <div>Enrollments: {verifiedSummary.membershipCount}</div>
                  <div>Accounts: {verifiedSummary.userCount}</div>
                </div>

                <label className="flex items-start gap-2 text-[11px] text-amber-200 bg-amber-950/30 border border-amber-800/50 p-2 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreConfirmedCheck}
                    onChange={(e) => setRestoreConfirmedCheck(e.target.checked)}
                    className="mt-0.5 rounded border-neutral-700 text-emerald-500 focus:ring-0"
                  />
                  <span>
                    I confirm creating an automatic pre-restore safety backup and replacing active <code className="text-amber-300">gym.sqlite</code> with this verified snapshot.
                  </span>
                </label>

                <button
                  onClick={handleRestoreDatabase}
                  disabled={!restoreConfirmedCheck || isRestoring}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isRestoring ? 'Restoring SQLite...' : 'Restore Verified Database'}</span>
                </button>
              </div>
            )}
          </div>
        </AnimatedSectionPanel>
      </div>

      {/* Verified Local Backup Vault */}
      <AnimatedSectionPanel delay={0.06} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Verified Local Backup Vault</h3>
          </div>
          <span className="text-[11px] font-mono text-neutral-400">
            {vaultBackups.length} archived snapshots
          </span>
        </div>

        {vaultBackups.length === 0 ? (
          <div className="py-6 text-center text-neutral-500">
            No encrypted backups created yet. Click <strong>Create Encrypted Backup Now</strong> to store and verify your first snapshot.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/70 text-neutral-400 uppercase font-mono text-[10px] border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-3">Archive File</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3">Trigger</th>
                  <th className="py-2.5 px-3">Records</th>
                  <th className="py-2.5 px-3">SHA-256 & Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {vaultBackups.slice(0, 12).map((rec) => (
                  <tr key={rec.id} className="hover:bg-neutral-800/35">
                    <td className="py-2.5 px-3 font-mono text-amber-300">
                      {rec.fileName}
                      <span className="block text-[10px] text-neutral-500">{formatBytes(rec.sizeBytes)}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-300">
                      {formatKolkataDateTime(rec.createdAt)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-neutral-800 text-neutral-300">
                        {rec.trigger}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-400">
                      {rec.memberCount} members · {rec.paymentCount} receipts
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className="text-emerald-400">{rec.verified ? 'VERIFIED' : 'PENDING'}</span>
                      <span className="block text-[10px] text-neutral-500">
                        {rec.sha256Checksum.slice(0, 16)}…
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => void dbService.downloadVaultBackupFile(rec)}
                        className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px]"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleVerifyVaultBackup(rec)}
                        className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/70 rounded text-[11px]"
                      >
                        Verify & Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnimatedSectionPanel>

      {/* Super Admin Production Reset / Client Handover */}
      {isSuperAdmin && (
        <AnimatedSectionPanel
          delay={0.08}
          className="bg-neutral-900 border border-rose-900/50 rounded-xl p-5 space-y-3 text-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Client Handover — Clear All Operational Data</span>
              </h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Automatically saves a verified AES-256 pre-clear safety backup before clearing member records, enrollments, receipts, check-ins, and activity logs. User accounts are preserved.
              </p>
            </div>

            {!confirmClearOpen ? (
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="px-4 py-2 bg-rose-950/70 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-800 rounded-lg font-semibold transition-colors shrink-0"
              >
                Clear All Records
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3 bg-neutral-950 border border-rose-900/70 p-3 rounded-lg">
                <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clearKeepPlans}
                    onChange={(e) => setClearKeepPlans(e.target.checked)}
                    className="rounded border-neutral-700 text-amber-500 focus:ring-0"
                  />
                  <span>Keep existing Membership Plan catalog</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(false)}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearForClient()}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold"
                  >
                    Confirm Backup & Wipe Records
                  </button>
                </div>
              </div>
            )}
          </div>
        </AnimatedSectionPanel>
      )}
    </div>
  );
};
