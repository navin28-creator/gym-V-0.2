import React, { useState, useEffect, useMemo } from 'react';
import { GymDatabase, Member, PaymentMethod } from '../types/gym';
import { dbService } from '../services/db';
import { formatINR, formatKolkataDate } from '../services/crypto';
import { X, Plus, CreditCard, Layers, ClipboardCheck, Search, CheckCircle2 } from 'lucide-react';

/* -------------------------------------------------------------
 * ADD MEMBER MODAL
 * ------------------------------------------------------------- */
interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemberCreated?: (member: Member) => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose, onMemberCreated }) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [fitnessGoal, setFitnessGoal] = useState('Strength & Functional Conditioning');
  const [healthNotes, setHealthNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFullName('');
      setPhone('');
      setEmail('');
      setEmergencyName('');
      setEmergencyPhone('');
      setFitnessGoal('Strength & Functional Conditioning');
      setHealthNotes('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newMember = dbService.addMember({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || `${fullName.toLowerCase().replace(/\s+/g, '.')}@gym.local`,
      emergencyContactName: emergencyName.trim() || 'Parent / Spouse',
      emergencyContactPhone: emergencyPhone.trim() || phone.trim(),
      status: 'active',
      joinedDate: new Date().toISOString().split('T')[0],
      fitnessGoal: fitnessGoal.trim(),
      healthNotes: healthNotes.trim() || undefined,
    });

    if (onMemberCreated) onMemberCreated(newMember);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 text-neutral-100 space-y-4">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Enroll New Gym Member</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-neutral-400 mb-1">Full Legal / Display Name *</label>
            <input
              type="text"
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ramesh Krishnan"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1">Mobile Phone (+91) *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98840 12345"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ramesh.k@gmail.com"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1">Emergency Contact Name</label>
              <input
                type="text"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
                placeholder="Spouse, parent, sibling..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1">Emergency Phone</label>
              <input
                type="text"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+91 98840 54321"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Primary Fitness Objective</label>
            <input
              type="text"
              value={fitnessGoal}
              onChange={(e) => setFitnessGoal(e.target.value)}
              placeholder="e.g. Hypertrophy, endurance, fat loss..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Medical / Health Declaration</label>
            <textarea
              rows={2}
              value={healthNotes}
              onChange={(e) => setHealthNotes(e.target.value)}
              placeholder="e.g. Previous knee ligament reconstruction, hypertension, asthma..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded"
            >
              Save Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * RECORD EXTERNAL PAYMENT MODAL
 * ------------------------------------------------------------- */
interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: GymDatabase;
  initialMemberId?: string;
  onPaymentRecorded?: (paymentId: string) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  db,
  initialMemberId,
  onPaymentRecorded,
}) => {
  const [memberId, setMemberId] = useState(initialMemberId || db.members[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      const targetId = initialMemberId || db.members[0]?.id || '';
      setMemberId(targetId);
      const summary = targetId ? dbService.getMemberFinancialSummary(targetId) : null;
      if (summary && summary.outstandingBalanceInr > 0) {
        setAmount(String(summary.outstandingBalanceInr));
      } else {
        setAmount('');
      }
      setReference('');
      setNotes('');
    }
  }, [isOpen, initialMemberId, db.members]);

  if (!isOpen) return null;

  // Selected member balance hint
  const memberSummary = memberId ? dbService.getMemberFinancialSummary(memberId) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !amount) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const payment = dbService.recordPayment({
      memberId,
      amountInr: parsedAmount,
      method,
      referenceNumber: reference || `EXT-${method}-${Date.now().toString().slice(-6)}`,
      notes: notes.trim() || undefined,
    });

    if (onPaymentRecorded) {
      onPaymentRecorded(payment.id);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 text-neutral-100 space-y-4">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">Record External Payment</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[11px] text-neutral-400 leading-relaxed">
          Record settlement completed outside this application (e.g. UPI QR scan, cash at reception, bank NEFT). Flex & Flow does not store card or banking credentials.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {db.members.length === 0 ? (
            <div className="p-3 bg-amber-950/40 border border-amber-800/70 rounded-lg text-amber-200 text-xs">
              No members enrolled yet. Add a member first before recording a payment receipt.
            </div>
          ) : (
            <div>
              <label className="block text-neutral-400 mb-1">Athlete / Member *</label>
              <select
                required
                autoFocus={!initialMemberId}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              >
                {db.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.memberNumber}) - {m.phone}
                  </option>
                ))}
              </select>
            </div>
          )}

          {memberSummary && (
            <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between text-[11px]">
              <span className="text-neutral-400">Current Outstanding Balance:</span>
              <span className="font-mono font-bold text-amber-400 text-xs tabular-nums">
                {formatINR(memberSummary.outstandingBalanceInr)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1">Amount Paid (INR ₹) *</label>
              <input
                type="number"
                required
                min="1"
                autoFocus={Boolean(initialMemberId)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1800"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-mono text-sm font-bold focus:outline-none focus:border-amber-400 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1">Payment Method *</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              >
                <option value="UPI">UPI (GPay/PhonePe/Paytm)</option>
                <option value="Cash">Cash at Counter</option>
                <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                <option value="POS Card">POS EDC Card Swipe</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">
              Transaction / Reference Number (UTR, Slip #)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UPI/603219842109 or CASH-REC-01"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-neutral-400 mb-1">Notes / Remarks</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid in full for March renewal"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={db.members.length === 0}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-950 font-bold rounded"
            >
              Generate Receipt Voucher
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * ASSIGN MEMBERSHIP PLAN MODAL
 * ------------------------------------------------------------- */
interface AssignMembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: GymDatabase;
  initialMemberId?: string;
}

export const AssignMembershipModal: React.FC<AssignMembershipModalProps> = ({
  isOpen,
  onClose,
  db,
  initialMemberId,
}) => {
  const [memberId, setMemberId] = useState(initialMemberId || db.members[0]?.id || '');
  const [planId, setPlanId] = useState(db.plans[0]?.id || '');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (isOpen) {
      setMemberId(initialMemberId || db.members[0]?.id || '');
      setPlanId((prev) => prev || db.plans[0]?.id || '');
      setStartDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, initialMemberId, db.members, db.plans]);

  const selectedPlan = db.plans.find((p) => p.id === planId) || db.plans[0];

  // Calculate projected end date
  const calculatedEndDate = useMemo(() => {
    if (!startDate || !selectedPlan) return '';
    const date = new Date(startDate);
    date.setDate(date.getDate() + selectedPlan.durationDays);
    return date.toISOString().split('T')[0];
  }, [startDate, selectedPlan]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !planId) return;

    dbService.assignMembership(memberId, planId, startDate);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 text-neutral-100 space-y-4">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">Enroll / Renew Membership Plan</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {db.members.length === 0 ? (
            <div className="p-3 bg-amber-950/40 border border-amber-800/70 rounded-lg text-amber-200 text-xs">
              No members enrolled yet. Add a member first before assigning a membership plan.
            </div>
          ) : (
            <div>
              <label className="block text-neutral-400 mb-1">Select Athlete *</label>
              <select
                required
                autoFocus={!initialMemberId}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              >
                {db.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.memberNumber})
                  </option>
                ))}
              </select>
            </div>
          )}

          {db.plans.length === 0 ? (
            <div className="p-3 bg-amber-950/40 border border-amber-800/70 rounded-lg text-amber-200 text-xs">
              No membership plans exist. Create a plan in Memberships &amp; Plans first.
            </div>
          ) : (
            <div>
              <label className="block text-neutral-400 mb-1">Membership Plan Tariff *</label>
              <select
                required
                autoFocus={Boolean(initialMemberId)}
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400 font-mono"
              >
                {db.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatINR(p.priceInr)} ({p.durationDays} Days)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-400 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-neutral-400 mb-1">Calculated Expiry</label>
              <input
                type="text"
                readOnly
                value={calculatedEndDate ? formatKolkataDate(calculatedEndDate) : ''}
                className="w-full bg-neutral-950/60 border border-neutral-800 rounded-lg px-3 py-2 text-amber-300 font-mono"
              />
            </div>
          </div>

          {selectedPlan && (
            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-neutral-400">Total Billed to Ledger:</span>
                <span className="text-base font-bold text-amber-400 font-mono tabular-nums">
                  {formatINR(selectedPlan.priceInr)}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">{selectedPlan.description}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={db.members.length === 0 || db.plans.length === 0}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-950 font-bold rounded"
            >
              Confirm Enrollment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * QUICK CHECK-IN MODAL
 * ------------------------------------------------------------- */
interface QuickCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: GymDatabase;
}

export const QuickCheckInModal: React.FC<QuickCheckInModalProps> = ({ isOpen, onClose, db }) => {
  const [search, setSearch] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = db.members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(search.toLowerCase()) ||
      m.phone.includes(search) ||
      m.memberNumber.toLowerCase().includes(search.toLowerCase())
  );

  const handleCheckIn = (memberId: string) => {
    const res = dbService.recordCheckIn(memberId);
    if (res.success && res.checkIn) {
      setSuccessMsg(`Checked in ${res.checkIn.memberName}!`);
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 text-neutral-100 space-y-4">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Daily Workout Check-in</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type name, phone, or member #..."
            className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-400"
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          {filtered.slice(0, 8).map((m) => (
            <div
              key={m.id}
              className="p-2.5 bg-neutral-950/60 hover:bg-neutral-800 border border-neutral-800/80 rounded-lg flex items-center justify-between transition-colors text-xs"
            >
              <div>
                <span className="font-semibold text-white">{m.fullName}</span>
                <span className="text-[10px] font-mono text-neutral-500 block">
                  {m.memberNumber} · {m.phone}
                </span>
              </div>
              <button
                onClick={() => handleCheckIn(m.id)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-xs transition-colors"
              >
                Check In
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
