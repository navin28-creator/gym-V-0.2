import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronDesktopBridge {
  isElectron: boolean;
  platform: string;
  apiBaseUrl: string;
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
  getWindowMaximized: () => Promise<boolean>;
  openDataFolder: () => Promise<void>;
  showNotification: (title: string, body: string) => Promise<void>;
  checkForUpdates: () => Promise<{ status: string; version?: string }>;
  installUpdate: () => Promise<void>;
  onUpdateEvent: (callback: (payload: { status: string; version?: string }) => void) => () => void;
}

const apiPort = process.env.FLEX_FLOW_PORT || '3000';

const bridge: ElectronDesktopBridge = {
  isElectron: true,
  platform: process.platform,
  apiBaseUrl: `http://127.0.0.1:${apiPort}`,
  windowControl: (action) => ipcRenderer.invoke('window:control', action),
  getWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  showNotification: (title, body) => ipcRenderer.invoke('desktop:notify', { title, body }),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: any) => callback(payload);
    ipcRenderer.on('updates:status', handler);
    return () => ipcRenderer.removeListener('updates:status', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', bridge);
