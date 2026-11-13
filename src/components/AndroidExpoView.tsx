import React, { useState } from 'react';
import { GymDatabase, Member, PaymentRecord, User, MemberStatus } from '../types/gym';
import { dbService, hasPermission, isSuperAdminRole } from '../services/db';
import { formatINR, formatKolkataDate, formatKolkataDateTime } from '../services/crypto';
import {
  Smartphone,
  Search,
  Plus,
  CreditCard,
  ClipboardCheck,
  History,
  Radio,
  Wifi,
  Battery,
  Shield,
  UserCheck,
  ChevronRight,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  X,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';

interface AndroidExpoViewProps {
  db: GymDatabase;
  currentUser: User | null;
  onOpenReminderModal: (member: Member, balance: number, dueDate?: string) => void;
  onOpenReceiptModal: (paymentId: string) => void;
  onBackToDesktop?: () => void;
}

export const AndroidExpoView: React.FC<AndroidExpoViewProps> = ({
  db,
  currentUser,
  onOpenReminderModal,
  onOpenReceiptModal,
  onBackToDesktop,
}) => {
  const [mobileTab, setMobileTab] = useState<'members' | 'add_member' | 'payment' | 'checkin' | 'activity'>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMobileMember, setSelectedMobileMember] = useState<Member | null>(null);
  const [tailscaleConnected, setTailscaleConnected] = useState(true);

  const canManageMembers = hasPermission(currentUser, 'canManageMembers');
  const canRecordPayments = hasPermission(currentUser, 'canRecordPayments');
  const canViewMemberContactDetails = hasPermission(currentUser, 'canViewMemberContactDetails');
  const canSendPaymentReminders = hasPermission(currentUser, 'canSendPaymentReminders');
  const canViewAllActivity = hasPermission(currentUser, 'canViewAllActivity');
  const isSuperAdmin = isSuperAdminRole(currentUser?.role);

  // Form states for Mobile actions
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newGoal, setNewGoal] = useState('');

  const [payMemberId, setPayMemberId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'UPI' | 'Cash' | 'Bank Transfer'>('UPI');
  const [payRef, setPayRef] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Check Tailscale requirement
  const checkTailscaleOnline = (): boolean => {
    if (!tailscaleConnected) {
      setActionError('Network Error: Cannot reach desktop 127.0.0.1:3000. Ensure Tailscale Serve is running.');
      return false;
    }
    return true;
  };

  const handleMobileAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkTailscaleOnline()) return;

    const newMember = dbService.addMember({
      fullName: newFullName.trim(),
      phone: newPhone.trim(),
      email: `${newFullName.toLowerCase().replace(/\s+/g, '.')}@mobile.in`,
      emergencyContactName: 'Family Contact',
      emergencyContactPhone: newPhone.trim(),
      status: 'active',
      joinedDate: new Date().toISOString().split('T')[0],
      fitnessGoal: newGoal.trim() || 'General Fitness',
    });

    setActionSuccess(`Added ${newMember.fullName} (${newMember.memberNumber}) via Expo!`);
    setNewFullName('');
    setNewPhone('');
    setNewGoal('');
    setMobileTab('members');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleMobileRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkTailscaleOnline()) return;
    if (!payMemberId || !payAmount) return;

    const amt = parseFloat(payAmount);
    const newPay = dbService.recordPayment({
      memberId: payMemberId,
      amountInr: amt,
      method: payMethod,
      referenceNumber: payRef || `MOBILE-UPI-${Date.now().toString().slice(-6)}`,
      notes: 'Recorded on Android phone over private Tailscale network',
    });

    setActionSuccess(`Recorded ₹${amt.toLocaleString('en-IN')} payment (${newPay.paymentNumber})!`);
    setPayAmount('');
    setPayRef('');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleMobileCheckIn = (memberId: string) => {
    if (!checkTailscaleOnline()) return;
    const res = dbService.recordCheckIn(memberId);
    if (res.success && res.checkIn) {
      setActionSuccess(`Checked in ${res.checkIn.memberName}!`);
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  // Activity scoped by canViewAllActivity permission
  const myActivityLogs = canViewAllActivity
    ? db.activityLogs
    : db.activityLogs.filter((l) => l.userId === currentUser?.id);

  const filteredMembers = db.members.filter((m) =>
    m.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (canViewMemberContactDetails && m.phone.includes(searchTerm)) ||
    m.memberNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="py-6 px-4 flex flex-col items-center justify-center min-h-[calc(100vh-40px)] bg-neutral-950/80">
      {/* Simulation Controls Top Bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap justify-center bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-xl text-xs">
        {!isSuperAdmin && onBackToDesktop && (
          <button
            onClick={onBackToDesktop}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
            <span>Back to Desktop</span>
          </button>
        )}
        <span className="text-neutral-400 font-mono">Tailscale Serve Status:</span>
        <button
          onClick={() => setTailscaleConnected(!tailscaleConnected)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
            tailscaleConnected
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : 'bg-rose-950 text-rose-300 border border-rose-800'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>
            {tailscaleConnected
              ? `Tailscale Connected (${db.tailscale.tailnetIp})`
              : 'Tailnet Disconnected'}
          </span>
        </button>
        <span className="text-neutral-500 font-mono text-[11px] hidden sm:inline">
          SecureStore Bearer Token Active
        </span>
      </div>

      {/* Android Device Mockup Frame */}
      <div className="relative w-[380px] h-[760px] bg-black rounded-[48px] p-3 shadow-2xl border-4 border-neutral-800 ring-1 ring-neutral-700/50 flex flex-col overflow-hidden select-none">
        {/* Device Top Speaker / Camera Punch-hole */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-neutral-900 rounded-full z-50 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-neutral-950 ring-1 ring-neutral-800" />
        </div>

        {/* Device Screen Area */}
        <div className="w-full h-full bg-neutral-950 rounded-[38px] flex flex-col overflow-hidden text-neutral-100 font-sans">
          {/* Android Status Bar */}
          <div className="h-8 px-6 pt-2 flex items-center justify-between text-[11px] text-neutral-400 font-mono shrink-0">
            <span>09:41</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-emerald-400 font-bold">TS</span>
              <Wifi className="w-3.5 h-3.5" />
              <Battery className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Expo App Bar */}
          <div className="px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between shrink-0">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-wider text-amber-400">FLEX & FLOW</span>
                <span className="text-[10px] font-mono px-1 py-0.2 bg-neutral-800 text-neutral-400 rounded">
                  EXPO
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500 block truncate">
                {tailscaleConnected ? `https://${db.tailscale.tailnetDomain}` : 'Tailscale Offline'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-300">
              <UserCheck className="w-3.5 h-3.5 text-sky-400" />
              <span className="truncate max-w-[80px]">{currentUser?.username || 'Staff'}</span>
            </div>
          </div>

          {/* Alert messages inside phone */}
          {actionSuccess && (
            <div className="mx-3 mt-2 p-2 bg-emerald-950/80 border border-emerald-800 rounded-lg text-[11px] text-emerald-300 flex items-center gap-1.5 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{actionSuccess}</span>
            </div>
          )}
          {actionError && (
            <div className="mx-3 mt-2 p-2 bg-rose-950/80 border border-rose-800 rounded-lg text-[11px] text-rose-300 flex items-center gap-1.5 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{actionError}</span>
            </div>
          )}

          {/* Phone Screen Viewport */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {mobileTab === 'members' && (
              <div className="space-y-3">
                {/* Search in Mobile */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search athletes or phone..."
                    className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-between items-center text-[11px] text-neutral-400 px-1 font-mono">
                  <span>{filteredMembers.length} MEMBERS</span>
                  <span className="text-neutral-500">Asia/Kolkata</span>
                </div>

                {/* Mobile Member Cards */}
                <div className="space-y-2">
                  {filteredMembers.length === 0 ? (
                    <div className="p-6 text-center bg-neutral-900 border border-neutral-800 rounded-xl text-[11px] text-neutral-500">
                      No members enrolled yet.
                    </div>
                  ) : (
                    filteredMembers.map((member) => {
                      const summary = dbService.getMemberFinancialSummary(member.id);
                      return (
                        <div
                          key={member.id}
                          onClick={() => setSelectedMobileMember(member)}
                          className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-colors cursor-pointer space-y-1"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-semibold text-xs text-white">{member.fullName}</span>
                              <span className="text-[10px] font-mono text-neutral-500 block">
                                {member.memberNumber} ·{' '}
                                {canViewMemberContactDetails ? member.phone : 'Phone restricted'}
                              </span>
                            </div>

                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase ${
                                member.status === 'active'
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                  : member.status === 'pending_renewal'
                                  ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                                  : 'bg-rose-950/60 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {member.status.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-[11px] pt-1 border-t border-neutral-800/80">
                            <span className="text-neutral-400 truncate max-w-[140px]">
                              {summary.activeMembership?.planName || 'No Active Plan'}
                            </span>

                            {summary.outstandingBalanceInr > 0 ? (
                              <span className="font-mono font-bold text-rose-400">
                                Due: {formatINR(summary.outstandingBalanceInr)}
                              </span>
                            ) : (
                              <span className="font-mono text-emerald-400 text-[10px]">Settled</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {mobileTab === 'add_member' && (
              <form onSubmit={handleMobileAddMember} className="space-y-3 text-xs">
                <span className="text-xs font-bold text-white block">Add Athlete via Expo</span>
                <div>
                  <label className="text-neutral-400 block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Fitness Goal</label>
                  <input
                    type="text"
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    placeholder="Weight loss, strength, marathon..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-amber-400 text-neutral-950 font-bold rounded-lg mt-2"
                >
                  Save to SQLite via Tailscale
                </button>
              </form>
            )}

            {mobileTab === 'payment' && (
              <form onSubmit={handleMobileRecordPayment} className="space-y-3 text-xs">
                <span className="text-xs font-bold text-white block">Record External Payment</span>
                <div>
                  <label className="text-neutral-400 block mb-1">Select Member</label>
                  <select
                    required
                    value={payMemberId}
                    onChange={(e) => setPayMemberId(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white focus:outline-none"
                  >
                    <option value="">Choose member...</option>
                    {db.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} ({m.memberNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Amount (INR ₹)</label>
                  <input
                    type="number"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="e.g. 1800"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white font-mono focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['UPI', 'Cash', 'Bank Transfer'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPayMethod(mode)}
                      className={`p-2 rounded text-[11px] font-semibold border transition-colors ${
                        payMethod === mode
                          ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Reference / UTR (Optional)</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. UPI/998231"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white font-mono text-xs focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-amber-400 text-neutral-950 font-bold rounded-lg mt-2"
                >
                  Confirm & Sync to Desktop
                </button>
              </form>
            )}

            {mobileTab === 'checkin' && (
              <div className="space-y-3 text-xs">
                <span className="text-xs font-bold text-white block">Tap to Check-in Member</span>
                <div className="space-y-1.5">
                  {db.members.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium text-white">{m.fullName}</span>
                        <span className="text-[10px] font-mono text-neutral-500 block">
                          {m.memberNumber}
                        </span>
                      </div>
                      <button
                        onClick={() => handleMobileCheckIn(m.id)}
                        className="px-2.5 py-1 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded font-semibold text-[11px]"
                      >
                        Check In
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mobileTab === 'activity' && (
              <div className="space-y-2 text-xs">
                <span className="text-xs font-bold text-white block">
                  {canViewAllActivity ? 'All Gym Activity' : 'My Recorded Activity'}
                </span>
                <div className="space-y-1.5">
                  {myActivityLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-[11px] space-y-1"
                    >
                      <div className="flex justify-between text-neutral-400 font-mono text-[10px]">
                        <span>{log.username}</span>
                        <span>{formatKolkataDateTime(log.timestamp).split(',')[1]}</span>
                      </div>
                      <div className="text-neutral-200">{log.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Member Details Modal inside Phone */}
          {selectedMobileMember && (
            <div className="absolute inset-x-3 bottom-14 top-10 bg-neutral-900 border border-neutral-700 rounded-2xl p-4 shadow-2xl flex flex-col justify-between z-40 text-xs">
              <div className="space-y-3">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-2">
                  <div>
                    <h4 className="font-bold text-sm text-white">{selectedMobileMember.fullName}</h4>
                    <span className="text-[11px] font-mono text-amber-400">
                      {selectedMobileMember.memberNumber}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedMobileMember(null)}
                    className="text-neutral-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1 text-neutral-300 text-[11px]">
                  <div>
                    Phone:{' '}
                    {canViewMemberContactDetails
                      ? selectedMobileMember.phone
                      : 'Restricted by Super Admin'}
                  </div>
                  <div>Goal: {selectedMobileMember.fitnessGoal}</div>
                  <div>Status: {selectedMobileMember.status}</div>
                </div>

                {(() => {
                  const summary = dbService.getMemberFinancialSummary(selectedMobileMember.id);
                  return (
                    <div className="p-2 bg-neutral-950 border border-neutral-800 rounded space-y-1">
                      <div className="flex justify-between text-neutral-400 text-[10px]">
                        <span>Outstanding Due:</span>
                        <span className="font-mono font-bold text-rose-400 text-xs">
                          {formatINR(summary.outstandingBalanceInr)}
                        </span>
                      </div>

                      {canSendPaymentReminders && summary.outstandingBalanceInr > 0 && (
                        <button
                          onClick={() => {
                            onOpenReminderModal(
                              selectedMobileMember,
                              summary.outstandingBalanceInr,
                              summary.activeMembership?.endDate
                            );
                            setSelectedMobileMember(null);
                          }}
                          className="w-full mt-2 py-1.5 bg-emerald-600 text-white rounded font-semibold text-[11px] flex items-center justify-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp Reminder</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>

              <button
                onClick={() => setSelectedMobileMember(null)}
                className="w-full py-1.5 bg-neutral-800 text-neutral-300 rounded text-center text-xs"
              >
                Close
              </button>
            </div>
          )}

          {/* Android Bottom App Navigation Bar */}
          <div className="h-12 bg-neutral-900 border-t border-neutral-800 flex items-center justify-around px-2 shrink-0 text-neutral-400">
            <button
              onClick={() => setMobileTab('members')}
              className={`flex flex-col items-center gap-0.5 ${
                mobileTab === 'members' ? 'text-amber-400' : 'hover:text-neutral-200'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span className="text-[9px]">Members</span>
            </button>
            {canManageMembers && (
              <button
                onClick={() => setMobileTab('add_member')}
                className={`flex flex-col items-center gap-0.5 ${
                  mobileTab === 'add_member' ? 'text-amber-400' : 'hover:text-neutral-200'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span className="text-[9px]">Add</span>
              </button>
            )}
            {canRecordPayments && (
              <button
                onClick={() => setMobileTab('payment')}
                className={`flex flex-col items-center gap-0.5 ${
                  mobileTab === 'payment' ? 'text-amber-400' : 'hover:text-neutral-200'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span className="text-[9px]">Pay</span>
              </button>
            )}
            <button
              onClick={() => setMobileTab('activity')}
              className={`flex flex-col items-center gap-0.5 ${
                mobileTab === 'activity' ? 'text-amber-400' : 'hover:text-neutral-200'
              }`}
            >
              <History className="w-4 h-4" />
              <span className="text-[9px]">Log</span>
            </button>
          </div>

          {/* Android Home Navigation Bar Pill */}
          <div className="h-4 flex items-center justify-center shrink-0">
            <div className="w-24 h-1 bg-neutral-700 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
