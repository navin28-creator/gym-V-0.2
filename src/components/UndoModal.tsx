import React, { useState, useEffect } from 'react';
import { GymDatabase } from '../types/gym';
import { dbService } from '../services/db';
import { formatKolkataDateTime } from '../services/crypto';
import { Undo2, AlertTriangle, ShieldCheck, X } from 'lucide-react';

interface UndoModalProps {
  logId: string | null;
  db: GymDatabase;
  onClose: () => void;
}

export const UndoModal: React.FC<UndoModalProps> = ({ logId, db, onClose }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
  }, [logId]);

  if (!logId) return null;

  const log = db.activityLogs.find((l) => l.id === logId);
  if (!log) return null;

  const check = dbService.canUndoAction(logId);

  const handleConfirmUndo = () => {
    const res = dbService.undoAction(logId);
    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.error || 'Undo failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 text-neutral-100 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-amber-400">
            <Undo2 className="w-5 h-5" />
            <h3 className="text-base font-bold text-white">Reverse Activity Event</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Event Details */}
        <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs space-y-2">
          <div className="flex justify-between text-neutral-400 font-mono text-[11px]">
            <span>EVENT ID: {log.id}</span>
            <span>{formatKolkataDateTime(log.timestamp)}</span>
          </div>
          <div className="text-white font-medium">{log.description}</div>
          <div className="text-neutral-500 font-mono text-[10px]">
            Logged by: {log.username} ({log.role})
          </div>
        </div>

        {/* Mechanism Explanation */}
        <div className="text-xs text-neutral-300 space-y-2">
          <span className="font-semibold text-white block">Audit Compliance Rules:</span>
          {log.actionType === 'record_payment' && (
            <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg space-y-1 text-[11px] leading-relaxed">
              <span className="text-amber-300 font-bold block">Payment Void Policy:</span>
              <span>
                Reversing this payment will mark it as <strong>VOID</strong> and add a linked reversal event. The original transaction receipt is retained in the database history for fiscal transparency, but its amount will no longer count toward member balances or revenue reports.
              </span>
            </div>
          )}

          {log.actionType === 'create_member' && (
            <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg space-y-1 text-[11px] leading-relaxed">
              <span className="text-emerald-300 font-bold block">Member Creation Reversal:</span>
              <span>
                Safety check confirms this member has no subsequent payments or memberships. The record will be safely removed and a linked reversal logged.
              </span>
            </div>
          )}

          {log.actionType === 'assign_membership' && (
            <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg space-y-1 text-[11px] leading-relaxed">
              <span className="text-sky-300 font-bold block">Membership Plan Reversal:</span>
              <span>
                Safety check confirms no payment has been applied toward this tenure. The enrollment will be removed with a linked reversal entry.
              </span>
            </div>
          )}
        </div>

        {/* Inline Error */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Safety Validation Result */}
        {!check.canUndo ? (
          <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block">Cannot Reverse This Action:</strong>
              <span>{check.reason}</span>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Pre-flight checks passed: Safe to reverse without breaking database relations.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmUndo}
            disabled={!check.canUndo}
            className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-neutral-950 font-bold rounded text-xs transition-colors"
          >
            Confirm Reversal
          </button>
        </div>
      </div>
    </div>
  );
};
