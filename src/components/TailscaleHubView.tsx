import React, { useState, useEffect } from 'react';
import { GymDatabase, TailscaleState, User } from '../types/gym';
import { dbService, hasPermission } from '../services/db';
import { formatKolkataDateTime } from '../services/crypto';
import { AnimatedCard, AnimatedSectionPanel } from './MotionPrimitives';
import {
  Radio,
  Smartphone,
  ShieldCheck,
  Terminal,
  ExternalLink,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Copy,
  Check,
  RotateCcw,
  Trash2,
} from 'lucide-react';

interface TailscaleHubViewProps {
  db: GymDatabase;
  currentUser: User | null;
  onLaunchMobileSimulator: () => void;
}

export const TailscaleHubView: React.FC<TailscaleHubViewProps> = ({
  db,
  currentUser,
  onLaunchMobileSimulator,
}) => {
  const [tailscaleState, setTailscaleState] = useState<TailscaleState>(db.tailscale);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    setTailscaleState(db.tailscale);
  }, [db.tailscale]);

  const serveUrl = `https://${tailscaleState.tailnetDomain}`;

  const handleToggleServe = () => {
    const nextState = !tailscaleState.isServing;
    dbService.updateTailscaleStatus({ isServing: nextState });
    setTailscaleState({ ...tailscaleState, isServing: nextState });
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(serveUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const canAccessExpoMobile = hasPermission(currentUser, 'canAccessExpoMobile');

  if (!hasPermission(currentUser, 'canManageTailscale')) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center space-y-3">
          <Lock className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Tailscale Hub Access Restricted</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Your account does not currently have the <strong>Tailscale Hub & Session Revocation</strong> permission. A Super Admin can grant this access in Admin Permissions.
          </p>
        </AnimatedSectionPanel>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white">
              Private Tailscale & Android Expo Hub
            </h2>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded ${
                tailscaleState.isServing
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {tailscaleState.isServing ? 'Tailscale Serve Active' : 'Offline'}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Zero-trust private network tunnel · Loopback 127.0.0.1:3000 to Expo Android devices
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canAccessExpoMobile ? (
            <button
              onClick={onLaunchMobileSimulator}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-xs"
            >
              <Smartphone className="w-4 h-4" />
              <span>Open Android Expo App</span>
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Expo Mobile Restricted by Super Admin</span>
            </span>
          )}
        </div>
      </div>

      {/* Security Architecture Notice */}
      <AnimatedSectionPanel className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2 text-xs text-neutral-300 leading-relaxed">
        <div className="flex items-center gap-2 text-emerald-400 font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>Tailscale Serve vs Tailscale Funnel</span>
        </div>
        <p>
          Flex & Flow binds exclusively to <code className="text-amber-300 font-mono">127.0.0.1:3000</code>. We use <strong>Tailscale Serve</strong>, never Tailscale Funnel. Funnel would expose your gym's records to the open internet. Tailscale Serve restricts traffic strictly to authenticated devices signed into your gym's private tailnet.
        </p>
      </AnimatedSectionPanel>

      {/* 2-Column: Live Serve Status (Left) + Step-by-Step Expo Android Setup (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Live Terminal & Serve Status */}
        <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Gym Computer Tailscale Daemon</h3>
            </div>
            <button
              onClick={handleToggleServe}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                tailscaleState.isServing
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-800 hover:bg-rose-900'
                  : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
              }`}
            >
              {tailscaleState.isServing ? 'Stop Serve' : 'Start Serve'}
            </button>
          </div>

          {/* Terminal Box */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-mono text-xs space-y-1.5 text-neutral-300">
            <div className="text-neutral-500"># Check Tailscale Serve status on gym computer</div>
            <div className="text-emerald-400">$ tailscale serve status</div>
            <div className="text-neutral-400 pt-1">
              |-- <span className="text-amber-300">{serveUrl}</span> (Tailscale HTTPS)
            </div>
            <div className="text-neutral-400">
              |   `-- proxy <span className="text-sky-300">http://127.0.0.1:3000</span>
            </div>
            <div className="text-neutral-400">
              |-- Tailnet IP: <span className="text-white">{tailscaleState.tailnetIp}</span>
            </div>
            <div className="text-neutral-400">
              `-- Node Name: <span className="text-white">{tailscaleState.nodeName}</span>
            </div>
          </div>

          {/* Active Endpoint */}
          <div className="space-y-1 text-xs">
            <label className="text-neutral-400 font-mono uppercase text-[11px]">
              Android Client Connection URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={serveUrl}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white font-mono text-xs"
              />
              <button
                onClick={handleCopyUrl}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded flex items-center gap-1 text-xs"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

            {/* Connected Sessions */}
          <div className="pt-2 border-t border-neutral-800 space-y-2">
            <span className="text-xs font-semibold text-neutral-300 block">
              Active Authorized Mobile Sessions ({db.tailscale.activeSessions.length})
            </span>
            {db.tailscale.activeSessions.length === 0 ? (
              <div className="p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg text-xs text-neutral-500">
                No active mobile sessions connected.
              </div>
            ) : (
              db.tailscale.activeSessions.map((session, idx) => (
                <AnimatedCard
                  key={session.deviceId}
                  index={idx}
                  className="p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg flex items-center justify-between text-xs gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-semibold text-neutral-200 block truncate">{session.deviceName}</span>
                      <span className="text-[11px] text-neutral-500 font-mono block">
                        Staff: {session.username} · IP: {session.ip}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right text-[11px] font-mono text-emerald-400">
                      <span className="block">Connected</span>
                      <span className="text-neutral-500">SecureStore Token</span>
                    </div>
                    <button
                      onClick={() => dbService.revokeTailscaleSession(session.deviceId)}
                      className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
                      title="Revoke & Delete Mobile Session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </AnimatedCard>
              ))
            )}
          </div>
        </AnimatedSectionPanel>

        {/* Right Column: Steps to Setup & Run Expo Client */}
        <AnimatedSectionPanel delay={0.05} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Private Android Access Setup</h3>
            </div>
            <span className="text-[10px] font-mono text-neutral-500">Expo React Native</span>
          </div>

          <div className="space-y-4 text-xs text-neutral-300">
            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-neutral-800 text-amber-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                1
              </span>
              <div>
                <strong className="text-white block">Install Tailscale on Gym PC & Phone</strong>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Sign both into your gym's tailnet and confirm the phone can ping <code className="text-neutral-300 font-mono">{tailscaleState.tailnetIp}</code>.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-neutral-800 text-amber-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                2
              </span>
              <div>
                <strong className="text-white block">Keep Desktop Running & Enable Serve</strong>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Desktop listens locally on <code className="text-neutral-300 font-mono">127.0.0.1:3000</code>. Run:
                  <code className="block bg-neutral-950 p-1 rounded font-mono text-emerald-300 mt-1">
                    tailscale serve --bg 3000
                  </code>
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-neutral-800 text-amber-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                3
              </span>
              <div>
                <strong className="text-white block">Run Expo Android App from android/</strong>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  From the <code className="text-neutral-300 font-mono">android/</code> directory:
                  <code className="block bg-neutral-950 p-1 rounded font-mono text-sky-300 mt-1">
                    npm install && npx expo start
                  </code>
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-neutral-800 text-amber-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                4
              </span>
              <div>
                <strong className="text-white block">Sign in with Staff or Owner Credentials</strong>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  The mobile client stores its bearer token securely in Android SecureStore, validating all member queries and payment creations against the desktop SQLite source of truth.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800">
              {canAccessExpoMobile ? (
                <button
                  onClick={onLaunchMobileSimulator}
                  className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-amber-300 hover:text-amber-200 font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors border border-neutral-700"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Simulate Expo Android App in Split / Preview View</span>
                </button>
              ) : (
                <div className="w-full py-2.5 px-3 bg-neutral-950 text-neutral-400 font-mono text-xs rounded-lg flex items-center justify-center gap-2 border border-neutral-800">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Enable "Access Android Expo Mobile Client" in Super Admin Permissions</span>
                </div>
              )}
            </div>
          </div>
        </AnimatedSectionPanel>
      </div>
    </div>
  );
};
