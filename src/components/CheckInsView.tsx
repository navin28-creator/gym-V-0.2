import React, { useState } from 'react';
import { GymDatabase, User } from '../types/gym';
import { dbService } from '../services/db';
import { formatKolkataDateTime } from '../services/crypto';
import { ClipboardCheck, Search, Plus, CheckCircle2, UserCheck, Clock } from 'lucide-react';

interface CheckInsViewProps {
  db: GymDatabase;
  currentUser: User | null;
  onSelectMemberById: (memberId: string) => void;
}

export const CheckInsView: React.FC<CheckInsViewProps> = ({
  db,
  currentUser,
  onSelectMemberById,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [quickCheckInMemberId, setQuickCheckInMemberId] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleManualCheckIn = (memberId: string) => {
    const res = dbService.recordCheckIn(memberId);
    if (res.success && res.checkIn) {
      setFeedbackMsg(`Checked in ${res.checkIn.memberName} successfully!`);
      setQuickCheckInMemberId('');
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  const filteredCheckIns = db.checkIns.filter((c) =>
    c.memberName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Daily Attendance Register</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Real-time floor check-ins · Logged locally in gym.sqlite
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={quickCheckInMemberId}
            onChange={(e) => {
              if (e.target.value) handleManualCheckIn(e.target.value);
            }}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
          >
            <option value="">+ Quick Check-in Member...</option>
            {db.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} ({m.memberNumber}) - {m.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <span className="text-xs text-neutral-400">Total Check-ins Today</span>
          <div className="mt-2 text-2xl font-bold text-white font-mono tabular-nums">
            {db.checkIns.length}
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">Unique gym admissions</span>
        </div>

        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <span className="text-xs text-neutral-400">Morning Session</span>
          <div className="mt-2 text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {db.checkIns.filter((c) => new Date(c.checkInTime).getHours() < 12).length}
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">6:00 AM – 12:00 PM</span>
        </div>

        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <span className="text-xs text-neutral-400">Evening Session</span>
          <div className="mt-2 text-2xl font-bold text-sky-400 font-mono tabular-nums">
            {db.checkIns.filter((c) => new Date(c.checkInTime).getHours() >= 12).length}
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">4:00 PM – 10:00 PM</span>
        </div>
      </div>

      {/* Check-ins Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="relative max-w-xs flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter check-in roster..."
              className="w-full pl-9 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-white focus:outline-none"
            />
          </div>
          <span className="text-xs font-mono text-neutral-500">
            {filteredCheckIns.length} entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-950/80 text-neutral-400 uppercase font-mono text-[11px] border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-3">Check-in Time (Asia/Kolkata)</th>
                <th className="py-3 px-3">Recorded By</th>
                <th className="py-3 px-3 text-right">View Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredCheckIns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-neutral-500">
                    No check-ins recorded for today yet.
                  </td>
                </tr>
              ) : (
                filteredCheckIns.map((chk) => (
                  <tr key={chk.id} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-neutral-200">
                      {chk.memberName}
                    </td>
                    <td className="py-3 px-3 font-mono text-neutral-400">
                      {formatKolkataDateTime(chk.checkInTime)}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-neutral-400">
                      {chk.recordedByUsername}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onSelectMemberById(chk.memberId)}
                        className="text-xs text-amber-400 hover:underline"
                      >
                        Profile →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
