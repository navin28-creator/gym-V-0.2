import React, { useEffect, useState } from 'react';
import { GymDatabase, MembershipPlan, User } from '../types/gym';
import { formatINR, formatKolkataDate } from '../services/crypto';
import { dbService, hasPermission } from '../services/db';
import { AnimatedCard, AnimatedSectionPanel } from './MotionPrimitives';
import {
  Plus,
  Trash2,
  AlertTriangle,
  X,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';

interface MembershipsViewProps {
  db: GymDatabase;
  currentUser: User | null;
  onOpenAssignMembership: (memberId?: string) => void;
  onSelectMemberById: (memberId: string) => void;
}

export const MembershipsView: React.FC<MembershipsViewProps> = ({
  db,
  currentUser,
  onOpenAssignMembership,
  onSelectMemberById,
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'active_enrollments'>('plans');
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
  const [confirmDeleteEnrollmentId, setConfirmDeleteEnrollmentId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Create Plan Modal state
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planDuration, setPlanDuration] = useState('30');
  const [planPrice, setPlanPrice] = useState('2000');
  const [planCategory, setPlanCategory] = useState<MembershipPlan['category']>('Gym');
  const [planDescription, setPlanDescription] = useState('');

  const canManagePlans = hasPermission(currentUser, 'canManagePlans');
  const canManageMembers = hasPermission(currentUser, 'canManageMembers');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (newPlanOpen) {
          e.preventDefault();
          setNewPlanOpen(false);
          return;
        }
        if (confirmDeletePlanId) {
          e.preventDefault();
          setConfirmDeletePlanId(null);
          return;
        }
        if (confirmDeleteEnrollmentId) {
          e.preventDefault();
          setConfirmDeleteEnrollmentId(null);
          return;
        }
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isTyping) return;
      if (document.querySelector('.fixed.inset-0.z-50')) return;

      const key = e.key.toLowerCase();
      if (key === 'c' && canManagePlans) {
        e.preventDefault();
        setNewPlanOpen(true);
      } else if (key === 't') {
        e.preventDefault();
        setActiveTab((prev) => (prev === 'plans' ? 'active_enrollments' : 'plans'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [newPlanOpen, confirmDeletePlanId, confirmDeleteEnrollmentId, canManagePlans]);

  const handleDeletePlan = (planId: string) => {
    const res = dbService.deletePlan(planId);
    if (!res.success) {
      setFeedbackMsg({ type: 'error', text: res.error || 'Failed to delete plan.' });
    } else {
      setFeedbackMsg({
        type: 'success',
        text: 'Plan removed from catalog. Existing enrollments retain their billed details.',
      });
    }
    setConfirmDeletePlanId(null);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleDeleteEnrollment = (membershipId: string) => {
    const res = dbService.deleteMembership(membershipId);
    if (!res.success) {
      setFeedbackMsg({ type: 'error', text: res.error || 'Failed to delete enrollment.' });
    } else {
      setFeedbackMsg({ type: 'success', text: 'Membership enrollment deleted.' });
    }
    setConfirmDeleteEnrollmentId(null);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    const durationDays = Math.max(1, parseInt(planDuration, 10) || 30);
    const priceInr = Math.max(0, parseFloat(planPrice) || 0);
    if (!planName.trim()) return;

    dbService.createPlan({
      name: planName.trim(),
      durationDays,
      priceInr,
      category: planCategory,
      description: planDescription.trim() || `${durationDays}-day ${planCategory} membership access.`,
    });

    setPlanName('');
    setPlanDuration('30');
    setPlanPrice('2000');
    setPlanDescription('');
    setNewPlanOpen(false);
    setFeedbackMsg({ type: 'success', text: 'New membership plan added to catalog.' });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Membership Plans & Enrollments</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Transparent INR tariff structures · Stored locally in gym.sqlite
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-neutral-900 border border-neutral-800 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'plans'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Plan Catalog ({db.plans.length})
            </button>
            <button
              onClick={() => setActiveTab('active_enrollments')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                activeTab === 'active_enrollments'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All Enrollments ({db.memberships.length})
            </button>
          </div>

          {canManagePlans && (
            <button
              onClick={() => setNewPlanOpen(true)}
              title="Shortcut: C"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-all hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>New Plan</span>
              <kbd className="ml-0.5 px-1 py-0.2 text-[9px] font-mono bg-neutral-900 text-neutral-400 border border-neutral-700 rounded">
                C
              </kbd>
            </button>
          )}

          {canManageMembers && (
            <button
              onClick={() => onOpenAssignMembership()}
              title="Shortcut: A"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-all hover:-translate-y-0.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Assign / Renew Plan</span>
              <kbd className="ml-0.5 px-1 py-0.2 text-[9px] font-mono bg-neutral-950/20 text-neutral-950 rounded">
                A
              </kbd>
            </button>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === 'plans' ? (
        /* Plans Catalog Grid */
        db.plans.length === 0 ? (
          <div className="p-10 bg-neutral-900 border border-neutral-800 rounded-xl text-center space-y-3">
            <p className="text-sm text-neutral-300 font-medium">No membership plans in catalog.</p>
            <button
              onClick={() => setNewPlanOpen(true)}
              className="px-4 py-2 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 rounded-lg"
            >
              + Create First Plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {db.plans.map((plan, idx) => {
              const enrolledCount = db.memberships.filter(
                (m) => m.planId === plan.id && m.status === 'active'
              ).length;
              const isConfirming = confirmDeletePlanId === plan.id;

              return (
                <AnimatedCard
                  key={plan.id}
                  index={idx}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[11px] font-mono text-neutral-500 uppercase">
                        {plan.category}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded">
                          {plan.durationDays} Days
                        </span>
                        {canManagePlans && (
                          <button
                            onClick={() =>
                              setConfirmDeletePlanId(isConfirming ? null : plan.id)
                            }
                            className="p-1 text-neutral-500 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
                            title="Delete membership plan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white mt-2">{plan.name}</h3>
                    <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                      {plan.description}
                    </p>

                    <div className="mt-4 pt-4 border-t border-neutral-800 flex items-baseline justify-between">
                      <div>
                        <span className="text-2xl font-extrabold text-amber-400 font-mono tabular-nums">
                          {formatINR(plan.priceInr)}
                        </span>
                        <span className="text-xs text-neutral-500 ml-1">/ tenure</span>
                      </div>
                      <span className="text-xs text-neutral-400 font-mono">
                        {enrolledCount} active members
                      </span>
                    </div>
                  </div>

                  {isConfirming ? (
                    <div className="mt-4 p-2.5 bg-rose-950/40 border border-rose-800/80 rounded-lg space-y-2 text-xs">
                      <div className="flex items-center gap-1.5 text-rose-300 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Delete "{plan.name}"?</span>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setConfirmDeletePlanId(null)}
                          className="px-2.5 py-1 bg-neutral-800 text-neutral-300 hover:text-white rounded text-[11px]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeletePlan(plan.id)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded text-[11px]"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-neutral-500 font-mono">
                        ₹{Math.round(plan.priceInr / Math.max(1 / 30, plan.durationDays / 30))}/mo equiv.
                      </span>
                      <div className="flex items-center gap-3">
                        {canManagePlans && (
                          <button
                            onClick={() => setConfirmDeletePlanId(plan.id)}
                            className="text-xs font-medium text-rose-400 hover:text-rose-300 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        )}
                        {canManageMembers && (
                          <button
                            onClick={() => onOpenAssignMembership()}
                            className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                          >
                            <span>Assign Plan</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </AnimatedCard>
              );
            })}
          </div>
        )
      ) : (
        /* Enrollments Table */
        <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-950/80 text-neutral-400 uppercase font-mono text-[11px] border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-3">Plan Enrolled</th>
                  <th className="py-3 px-3">Start Date</th>
                  <th className="py-3 px-3">End Date</th>
                  <th className="py-3 px-3 text-right">Fee (INR)</th>
                  <th className="py-3 px-3 text-right">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {db.memberships.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-500">
                      No membership enrollments found.
                    </td>
                  </tr>
                ) : (
                  db.memberships.map((mship) => {
                    const member = db.members.find((m) => m.id === mship.memberId);
                    const isConfirming = confirmDeleteEnrollmentId === mship.id;
                    return (
                      <tr
                        key={mship.id}
                        onClick={() => member && onSelectMemberById(member.id)}
                        className="hover:bg-neutral-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="font-semibold text-neutral-200">
                            {member?.fullName || 'Unknown Member'}
                          </span>
                          <span className="text-neutral-500 text-[11px] font-mono block">
                            {member?.memberNumber}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-neutral-300 font-medium">
                          {mship.planName}
                        </td>

                        <td className="py-3 px-3 font-mono text-neutral-400">
                          {formatKolkataDate(mship.startDate)}
                        </td>

                        <td className="py-3 px-3 font-mono text-neutral-300">
                          {formatKolkataDate(mship.endDate)}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-amber-400 tabular-nums">
                          {formatINR(mship.totalPriceInr)}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase ${
                              mship.status === 'active'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                                : 'bg-neutral-800 text-neutral-400'
                            }`}
                          >
                            {mship.status}
                          </span>
                        </td>

                        <td
                          className="py-3 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!canManagePlans ? (
                            <span className="text-[10px] font-mono text-neutral-600">—</span>
                          ) : isConfirming ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleDeleteEnrollment(mship.id)}
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-semibold"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteEnrollmentId(null)}
                                className="px-2 py-1 bg-neutral-800 text-neutral-300 rounded text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteEnrollmentId(mship.id)}
                              className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
                              title="Delete enrollment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </AnimatedSectionPanel>
      )}

      {/* Create New Plan Modal */}
      {newPlanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 text-neutral-100 space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Create Membership Plan</h3>
              </div>
              <button onClick={() => setNewPlanOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="e.g. Student Quarterly Saver"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">Category</label>
                  <select
                    value={planCategory}
                    onChange={(e) => setPlanCategory(e.target.value as MembershipPlan['category'])}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="Gym">Gym</option>
                    <option value="CrossFit">CrossFit</option>
                    <option value="Personal Training">Personal Training</option>
                    <option value="Combo">Combo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Duration (Days) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={planDuration}
                    onChange={(e) => setPlanDuration(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Price (INR ₹) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={planPrice}
                    onChange={(e) => setPlanPrice(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={planDescription}
                  onChange={(e) => setPlanDescription(e.target.value)}
                  placeholder="Included amenities, PT sessions, locker access..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setNewPlanOpen(false)}
                  className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded"
                >
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
