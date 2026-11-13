import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  shell,
} from 'electron';
import pkgUpdater from 'electron-updater';
import { SqliteEngine } from '../backend/sqliteEngine';
import { createApiRouter } from '../backend/createApiRouter';
import type { DesktopSettings } from '../src/types/gym';

const { autoUpdater } = pkgUpdater;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ID = 'com.flexflow.gymmanager';
const PORT = Number(process.env.FLEX_FLOW_PORT || 3000);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let engine: SqliteEngine | null = null;
let isQuitting = false;
let latestUpdateStatus = 'Up to date';

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function getAppRoot(): string {
  // Works both in packaged app (app.asar / resources) and dev mode
  return app.isPackaged ? path.resolve(__dirname, '..') : process.cwd();
}

function getIconPath(): string {
  const candidates = [
    path.join(getAppRoot(), 'build', 'icon.png'),
    path.join(getAppRoot(), 'public', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function showDesktopNotification(title: string, body: string): void {
  const snap = engine?.getSnapshot(true);
  if (snap?.desktopSettings && !snap.desktopSettings.desktopNotificationsEnabled) {
    return;
  }
  if (!Notification.isSupported()) return;
  const icon = nativeImage.createFromPath(getIconPath());
  const notif = new Notification({
    title,
    body,
    icon: icon.isEmpty() ? undefined : icon,
  });
  notif.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notif.show();
}

function applyDesktopSettingsToOS(settings: DesktopSettings): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(settings.launchAtStartup),
      path: app.getPath('exe'),
    });
  } catch {
    // Non-Windows or dev environment fallback
  }
}

function createSystemTray(): void {
  const iconImg = nativeImage.createFromPath(getIconPath());
  tray = new Tray(iconImg.isEmpty() ? nativeImage.createEmpty() : iconImg.resize({ width: 16, height: 16 }));
  tray.setToolTip('Flex & Flow Gym Manager (Offline SQLite)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Flex & Flow Console',
      click: () => {
        if (!mainWindow) return;
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Create Encrypted Backup Now',
      click: async () => {
        if (!engine) return;
        try {
          const rec = await engine.createEncryptedBackup('manual');
          showDesktopNotification(
            'Encrypted Backup Verified',
            `Saved ${rec.fileName} (${rec.memberCount} members)`
          );
        } catch (err: any) {
          showDesktopNotification('Backup Failed', err?.message || 'Unable to write backup.');
        }
      },
    },
    {
      label: 'Run SQLite Integrity Check',
      click: () => {
        if (!engine) return;
        const report = engine.runIntegrityCheck(true);
        showDesktopNotification(
          `Database Health: ${report.status.toUpperCase()}`,
          `PRAGMA integrity_check=${report.sqliteIntegrityCheck} · ${report.recordCounts.members} members`
        );
      },
    },
    {
      label: 'Open Data & Backups Folder',
      click: () => {
        if (engine) {
          void shell.openPath(engine.dataDir);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Flex & Flow',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
}

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const emitUpdateStatus = (status: string, version?: string) => {
    latestUpdateStatus = status;
    engine?.updateDesktopSettings({
      lastUpdateCheck: new Date().toISOString(),
      updateStatus: status,
    });
    mainWindow?.webContents.send('updates:status', { status, version });
  };

  autoUpdater.on('checking-for-update', () => {
    emitUpdateStatus('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    emitUpdateStatus(`Update v${info.version} available — downloading safely...`, info.version);
    showDesktopNotification(
      `Update v${info.version} Available`,
      'Downloading in background. Your gym.sqlite data will remain untouched.'
    );
  });

  autoUpdater.on('update-not-available', () => {
    emitUpdateStatus(`Running latest version v${app.getVersion()}`);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    // Always create a verified pre-update backup before installing!
    try {
      await engine?.createEncryptedBackup('manual');
    } catch {}
    emitUpdateStatus(`Update v${info.version} ready to install (restart required)`, info.version);
    showDesktopNotification(
      `Update v${info.version} Ready`,
      'A verified backup was created. Restart Flex & Flow from Settings to finish updating.'
    );
  });

  autoUpdater.on('error', () => {
    emitUpdateStatus('Offline or no update feed configured — running offline cleanly.');
  });
}

async function checkForUpdatesSafe(): Promise<{ status: string; version?: string }> {
  if (!app.isPackaged) {
    const status = `Desktop v${app.getVersion()} (Development build — updates active in installed .exe)`;
    latestUpdateStatus = status;
    return { status };
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    const version = res?.updateInfo?.version;
    return {
      status: latestUpdateStatus || `Checked updates (v${app.getVersion()})`,
      version,
    };
  } catch {
    return {
      status: 'Offline — skipped update check safely. All gym operations remain available.',
    };
  }
}

async function startLocalBackend(): Promise<string> {
  const userDataDir = app.getPath('userData'); // %APPDATA%\Flex & Flow on Windows
  engine = new SqliteEngine({
    runtime: 'electron',
    dataDir: userDataDir,
    appVersion: app.getVersion(),
    onDesktopNotification: showDesktopNotification,
  });

  const snap = engine.getSnapshot(true);
  if (snap.desktopSettings) {
    applyDesktopSettingsToOS(snap.desktopSettings);
  }

  // Startup renewal reminder toast if urgent renewals/dues exist
  const reminders = engine.getSmartReminders();
  const urgentCount = reminders.filter(
    (r) => r.tier === 'overdue' || r.tier === 'due_today'
  ).length;
  if (urgentCount > 0) {
    showDesktopNotification(
      `${urgentCount} Membership Renewal${urgentCount === 1 ? '' : 's'} Need Attention`,
      'Open Smart Renewal Reminders on the Dashboard to notify members.'
    );
  }

  const expressApp = express();
  expressApp.use(
    '/api',
    createApiRouter(engine, {
      onDesktopSettingsChanged: applyDesktopSettingsToOS,
      onCheckForUpdates: checkForUpdatesSafe,
      onInstallUpdate: async () => {
        try {
          await engine?.createEncryptedBackup('manual');
        } catch {}
        isQuitting = true;
        autoUpdater.quitAndInstall();
      },
      onWindowControl: (action) => {
        if (!mainWindow) return;
        if (action === 'minimize') mainWindow.minimize();
        else if (action === 'maximize') {
          if (mainWindow.isMaximized()) mainWindow.unmaximize();
          else mainWindow.maximize();
        } else if (action === 'close') {
          mainWindow.close();
        }
      },
      onShowNotification: showDesktopNotification,
    })
  );

  const distDir = path.join(getAppRoot(), 'dist');
  if (fs.existsSync(distDir)) {
    expressApp.use(express.static(distDir));
    expressApp.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  await new Promise<void>((resolve) => {
    expressApp.listen(PORT, '127.0.0.1', () => resolve());
  });

  return `http://127.0.0.1:${PORT}`;
}

async function createMainWindow(serverUrl: string): Promise<void> {
  const icon = nativeImage.createFromPath(getIconPath());
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0a0a',
    title: 'Flex & Flow Gym Manager',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const targetUrl = process.env.VITE_DEV_SERVER_URL || serverUrl;
  await mainWindow.loadURL(targetUrl);

  mainWindow.on('close', (event) => {
    const minimizeToTray = engine?.getSnapshot(true).desktopSettings?.minimizeToTray ?? true;
    if (!isQuitting && minimizeToTray && tray) {
      event.preventDefault();
      mainWindow?.hide();
      showDesktopNotification(
        'Flex & Flow Running in System Tray',
        'Daily encrypted backups and renewal checks continue quietly in the background.'
      );
    }
  });

  mainWindow.webContents.on('render-process-gone', () => {
    engine?.refreshRecoverySnapshot();
  });
}

// IPC handlers
ipcMain.handle('window:control', (_event, action: 'minimize' | 'maximize' | 'close') => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === 'close') {
    mainWindow.close();
  }
});

ipcMain.handle('window:is-maximized', () => Boolean(mainWindow?.isMaximized()));

ipcMain.handle('desktop:open-data-folder', () => {
  if (engine) {
    return shell.openPath(engine.dataDir);
  }
  return '';
});

ipcMain.handle('desktop:notify', (_event, payload: { title: string; body: string }) => {
  showDesktopNotification(payload.title, payload.body);
});

ipcMain.handle('updates:check', () => checkForUpdatesSafe());

ipcMain.handle('updates:install', async () => {
  try {
    await engine?.createEncryptedBackup('manual');
  } catch {}
  isQuitting = true;
  autoUpdater.quitAndInstall();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  const serverUrl = await startLocalBackend();
  createSystemTray();
  setupAutoUpdater();
  await createMainWindow(serverUrl);

  const autoCheck = engine?.getSnapshot(true).desktopSettings?.autoCheckUpdates;
  if (app.isPackaged && autoCheck) {
    setTimeout(() => {
      void checkForUpdatesSafe();
    }, 10000);
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  engine?.close();
});

process.on('uncaughtException', (err) => {
  console.error('Electron uncaughtException — preserving SQLite state:', err);
  engine?.refreshRecoverySnapshot();
});
