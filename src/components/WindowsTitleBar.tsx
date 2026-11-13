import React from 'react';
import { User, TailscaleState } from '../types/gym';
import {
  Dumbbell,
  Radio,
  Minus,
  Square,
  X,
  Smartphone,
  Laptop,
  Columns,
  LogOut,
  UserCheck,
  Shield,
  ShieldCheck,
  Crown,
  KeyRound,
  Download,
  Briefcase,
  Calculator,
  ClipboardList,
} from 'lucide-react';
import { getRoleLabel } from '../services/db';

interface WindowsTitleBarProps {
  currentUser: User | null;
  tailscale: TailscaleState;
  viewMode: 'desktop' | 'mobile' | 'split';
  setViewMode: (mode: 'desktop' | 'mobile' | 'split') => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenTailscaleModal: () => void;
}

export const WindowsTitleBar: React.FC<WindowsTitleBarProps> = ({
  currentUser,
  viewMode,
  setViewMode,
  onOpenAuth,
  onSignOut,
  onOpenTailscaleModal,
}) => {
  const electronAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  const isElectron = Boolean(electronAPI?.isElectron);

  const handleWindowControl = (action: 'minimize' | 'maximize' | 'close') => {
    if (electronAPI?.windowControl) {
      void electronAPI.windowControl(action);
    }
  };

  return (
    <header className="electron-drag h-10 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-3 select-none text-xs text-neutral-300 font-sans z-40 shrink-0">
      {/* Left: Window Icon, Title & DB Path */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
            <Dumbbell className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold tracking-tight text-white">Flex & Flow</span>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-neutral-500 font-mono text-[11px] truncate">
          <span>—</span>
          <span className="text-neutral-400 truncate">
            [gym.sqlite · SQLite WAL · {isElectron ? 'Windows Desktop' : 'Local Engine'}]
          </span>
          <span className="text-neutral-600">·</span>
          <span className="text-neutral-400">127.0.0.1:3000</span>
        </div>
      </div>

      {/* Center: Device / Environment Switcher */}
      <div className="electron-no-drag flex items-center bg-neutral-900 border border-neutral-800 p-0.5 rounded-lg shrink-0">
        <button
          onClick={() => setViewMode('desktop')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            viewMode === 'desktop'
              ? 'bg-neutral-800 text-white shadow-xs'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
          title="Windows Desktop Local SQLite UI"
        >
          <Laptop className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Desktop App</span>
        </button>

        <button
          onClick={() => setViewMode('mobile')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            viewMode === 'mobile'
              ? 'bg-neutral-800 text-amber-300 shadow-xs'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
          title="Expo Android Client over Tailscale"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Android Expo</span>
        </button>

        <button
          onClick={() => setViewMode('split')}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
            viewMode === 'split'
              ? 'bg-neutral-800 text-white shadow-xs'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
          title="Side-by-side Desktop and Mobile simulation"
        >
          <Columns className="w-3.5 h-3.5" />
          <span>Split Preview</span>
        </button>
      </div>

      {/* Right: Tailscale status, Download ZIP, User profile, Windows Window buttons */}
      <div className="electron-no-drag flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Download Project Source ZIP */}
        <a
          href="/flex-and-flow-app.zip"
          download="flex-and-flow-app.zip"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-400 hover:bg-amber-300 transition-colors text-neutral-950 font-semibold text-[11px] shadow-xs shrink-0"
          title="Download complete project source as a ZIP file to run locally on your PC"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Download ZIP</span>
        </a>

        {/* Tailscale Indicator */}
        <button
          onClick={onOpenTailscaleModal}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/60 hover:bg-emerald-950/70 transition-colors text-emerald-300 text-[11px] font-mono"
          title="Tailscale Serve: listening on 127.0.0.1:3000, serving to tailnet"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="hidden xl:inline">Tailscale Serve: Active</span>
          <span className="xl:hidden">Tailnet</span>
        </button>

        {/* Current User */}
        {currentUser ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-neutral-300 text-[11px]">
              {currentUser.role === 'super_admin' ? (
                <Crown className="w-3.5 h-3.5 text-purple-400" />
              ) : currentUser.role === 'admin' ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : currentUser.role === 'owner' ? (
                <Shield className="w-3.5 h-3.5 text-amber-400" />
              ) : currentUser.role === 'manager' ? (
                <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
              ) : currentUser.role === 'accountant' ? (
                <Calculator className="w-3.5 h-3.5 text-teal-400" />
              ) : currentUser.role === 'receptionist' ? (
                <ClipboardList className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span className="font-medium max-w-[100px] truncate">{currentUser.username}</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-neutral-800 text-neutral-300 rounded">
                {getRoleLabel(currentUser.role)}
              </span>
            </div>
            <button
              onClick={onSignOut}
              className="p-1 hover:text-rose-400 rounded transition-colors text-neutral-400"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-300 bg-amber-950/50 border border-amber-800 rounded hover:bg-amber-950/80 transition-colors"
          >
            <KeyRound className="w-3 h-3" />
            <span>Sign In</span>
          </button>
        )}

        {/* Windows 11 Title Bar Controls */}
        <div className="flex items-center h-full ml-1">
          <button
            onClick={() => handleWindowControl('minimize')}
            className="w-8 h-8 flex items-center justify-center hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title={isElectron ? 'Minimize Window' : 'Minimize (Electron Desktop)'}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleWindowControl('maximize')}
            className="w-8 h-8 flex items-center justify-center hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title={isElectron ? 'Maximize / Restore Window' : 'Maximize (Electron Desktop)'}
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleWindowControl('close')}
            className="w-8 h-8 flex items-center justify-center hover:bg-rose-600 text-neutral-400 hover:text-white transition-colors"
            title={isElectron ? 'Close / Minimize to System Tray' : 'Close (Electron Desktop)'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
