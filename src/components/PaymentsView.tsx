import React, { useEffect, useRef, useState } from 'react';
import { GymDatabase, PaymentMethod, PaymentRecord, User } from '../types/gym';
import { dbService, hasPermission } from '../services/db';
import { formatINR, formatKolkataDateTime } from '../services/crypto';
import { downloadFinancialReportPdf, downloadFinancialReportCsv } from '../services/pdfExport';
import { AnimatedCard, AnimatedSectionPanel } from './MotionPrimitives';
import {
  CreditCard,
  Plus,
  Printer,
  Ban,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
  ShieldAlert,
  Trash2,
  X,
  FileDown,
  FileSpreadsheet,
  Calendar,
} from 'lucide-react';

interface PaymentsViewProps {
  db: GymDatabase;
  currentUser: User | null;
  onOpenRecordPayment: () => void;
  onOpenReceiptModal: (paymentId: string) => void;
  onSelectMemberById: (memberId: string) => void;
  focusedPaymentId?: string | null;
  onClearFocusedPayment?: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  db,
  currentUser,
  onOpenRecordPayment,
  onOpenReceiptModal,
  onSelectMemberById,
  focusedPaymentId,
  onClearFocusedPayment,
}) => {
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [showVoidedOnly, setShowVoidedOnly] = useState(false);
  const [includeVoidedInReport, setIncludeVoidedInReport] = useState(true);
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [searchTerm, setSearchTerm] = useState('');
  const [voidModalPayment, setVoidModalPayment] = useState<PaymentRecord | null>(null);
  const [deleteModalPayment, setDeleteModalPayment] = useState<PaymentRecord | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const canRecordPayments = hasPermission(currentUser, 'canRecordPayments');
  const canVoidAndDeletePayments = hasPermission(currentUser, 'canVoidAndDeletePayments');
  const canPrintReceipts = hasPermission(currentUser, 'canPrintReceipts');
  const canExportFinancialReports =
    hasPermission(currentUser, 'canExportData') ||
    hasPermission(currentUser, 'canPrintReceipts') ||
    hasPermission(currentUser, 'canViewAnalytics');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (voidModalPayment) {
          e.preventDefault();
          setVoidModalPayment(null);
          return;
        }
        if (deleteModalPayment) {
          e.preventDefault();
          setDeleteModalPayment(null);
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

      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [voidModalPayment, deleteModalPayment]);

  useEffect(() => {
    if (!focusedPaymentId) return;
    const target = db.payments.find((p) => p.id === focusedPaymentId);
    if (target) {
      setSearchTerm(target.paymentNumber);
      setMethodFilter('all');
      if (target.isVoided) {
        setShowVoidedOnly(false);
      }
    }
  }, [focusedPaymentId, db.payments]);

  // Filter payments
  const filteredPayments = db.payments.filter((payment) => {
    const member = db.members.find((m) => m.id === payment.memberId);
    const searchMatch =
      payment.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (member && member.fullName.toLowerCase().includes(searchTerm.toLowerCase()));

    const methodMatch = methodFilter === 'all' || payment.method === methodFilter;
    const voidMatch = showVoidedOnly ? payment.isVoided : true;

    return searchMatch && methodMatch && voidMatch;
  });

  // Calculate payment totals (only non-voided count toward totals)
  const validPayments = db.payments.filter((p) => !p.isVoided);
  const totalCollectedInr = validPayments.reduce((sum, p) => sum + p.amountInr, 0);

  const upiTotalInr = validPayments
    .filter((p) => p.method === 'UPI')
    .reduce((sum, p) => sum + p.amountInr, 0);

  const cashTotalInr = validPayments
    .filter((p) => p.method === 'Cash')
    .reduce((sum, p) => sum + p.amountInr, 0);

  const bankCardTotalInr = validPayments
    .filter((p) => p.method === 'Bank Transfer' || p.method === 'POS Card' || p.method === 'Cheque')
    .reduce((sum, p) => sum + p.amountInr, 0);

  const voidedTotalInr = db.payments
    .filter((p) => p.isVoided)
    .reduce((sum, p) => sum + p.amountInr, 0);

  const handleConfirmVoid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalPayment) return;
    if (!voidReason.trim()) {
      setErrorMsg('A reason is required to void a payment.');
      return;
    }

    const res = dbService.voidPayment(voidModalPayment.id, voidReason);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to void payment.');
    } else {
      setVoidModalPayment(null);
      setVoidReason('');
      setErrorMsg(null);
    }
  };

  const handleConfirmDeletePayment = () => {
    if (!deleteModalPayment) return;
    const res = dbService.deletePayment(deleteModalPayment.id);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to delete payment.');
    } else {
      setDeleteModalPayment(null);
      setErrorMsg(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">External Payments Ledger</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Audit records of payments handled outside this application · Indian Rupees (₹)
          </p>
        </div>

        {canRecordPayments && (
          <button
            onClick={onOpenRecordPayment}
            title="Shortcut: P"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-all hover:-translate-y-0.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Record External Payment</span>
            <kbd className="ml-0.5 px-1 py-0.2 text-[9px] font-mono bg-neutral-950/20 text-neutral-950 rounded">
              P
            </kbd>
          </button>
        )}
      </div>

      {/* Breakdown KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimatedCard index={0} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Net Collections</span>
            <IndianRupee className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono tabular-nums">
            {formatINR(totalCollectedInr)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            {validPayments.length} valid external receipts
          </div>
        </AnimatedCard>

        <AnimatedCard index={1} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>UPI Receipts (GPay/PhonePe)</span>
            <CreditCard className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {formatINR(upiTotalInr)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            Direct QR & VPA settlements
          </div>
        </AnimatedCard>

        <AnimatedCard index={2} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Cash at Counter</span>
            <CreditCard className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-sky-400 font-mono tabular-nums">
            {formatINR(cashTotalInr)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            Front desk cash drawer
          </div>
        </AnimatedCard>

        <AnimatedCard index={3} className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between text-neutral-400 text-xs">
            <span>Bank & Card Machine</span>
            <CreditCard className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-400 font-mono tabular-nums">
            {formatINR(bankCardTotalInr)}
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 font-mono">
            NEFT / IMPS / EDC Swipes · Voided: {formatINR(voidedTotalInr)}
          </div>
        </AnimatedCard>
      </div>

      {/* Financial Reports & Date-Range Export Bar */}
      <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <Calendar className="w-4 h-4" />
            <span>Financial Report Period:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 font-mono focus:outline-none focus:border-amber-400"
            />
            <span className="text-neutral-500">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-neutral-200 font-mono focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(1);
                setFromDate(d.toISOString().slice(0, 10));
                setToDate(new Date().toISOString().slice(0, 10));
              }}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px]"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => {
                setFromDate('2020-01-01');
                setToDate(new Date().toISOString().slice(0, 10));
              }}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px]"
            >
              All Time
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-neutral-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeVoidedInReport}
              onChange={(e) => setIncludeVoidedInReport(e.target.checked)}
              className="rounded border-neutral-700 text-amber-400 focus:ring-0"
            />
            <span>Include Voided</span>
          </label>
          <button
            type="button"
            onClick={() => setShowVoidedOnly((v) => !v)}
            className={`px-2.5 py-1 rounded border text-[11px] font-mono transition-colors ${
              showVoidedOnly
                ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Filter className="w-3 h-3 inline mr-1" />
            {showVoidedOnly ? 'Showing Voided Only' : 'Show Voided Only'}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canExportFinancialReports ? (
            <>
              <button
                type="button"
                onClick={() =>
                  downloadFinancialReportPdf({
                    db,
                    fromDate,
                    toDate,
                    methodFilter,
                    includeVoided: includeVoidedInReport,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-semibold rounded-lg transition-colors"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Export PDF Report</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFinancialReportCsv({
                    db,
                    fromDate,
                    toDate,
                    methodFilter,
                    includeVoided: includeVoidedInReport,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-medium rounded-lg transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>
            </>
          ) : (
            <span className="text-[11px] font-mono text-neutral-500">
              Financial export restricted by role permissions
            </span>
          )}
        </div>
      </AnimatedSectionPanel>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (focusedPaymentId && onClearFocusedPayment) {
                onClearFocusedPayment();
              }
            }}
            placeholder="Search by receipt #, ref/UTR, or member name..."
            className="w-full pl-9 pr-10 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-400"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                if (onClearFocusedPayment) onClearFocusedPayment();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
              title="Clear search filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[9px] font-mono text-neutral-500 bg-neutral-950 border border-neutral-800 rounded pointer-events-none">
              F
            </kbd>
          )}
        </div>

        {/* Method Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-lg overflow-x-auto">
          {(['all', 'UPI', 'Cash', 'Bank Transfer', 'POS Card', 'Cheque'] as const).map((method) => (
            <button
              key={method}
              onClick={() => setMethodFilter(method)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                methodFilter === method
                  ? 'bg-neutral-800 text-white shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {method === 'all' ? 'All Modes' : method}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <AnimatedSectionPanel className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-950/80 text-neutral-400 uppercase font-mono text-[11px] border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-3">Date (Asia/Kolkata)</th>
                <th className="py-3 px-3">Member</th>
                <th className="py-3 px-3">Mode & Ref ID</th>
                <th className="py-3 px-3 text-right">Amount (INR)</th>
                <th className="py-3 px-3">Recorded By</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const member = db.members.find((m) => m.id === p.memberId);
                  const isFocused = focusedPaymentId === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-neutral-800/40 transition-colors ${
                        isFocused
                          ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-400/50'
                          : p.isVoided
                          ? 'opacity-60 bg-rose-950/10'
                          : ''
                      }`}
                    >
                      {/* Receipt */}
                      <td className="py-3 px-4 font-mono font-medium text-amber-300">
                        <span>{p.paymentNumber}</span>
                        {p.isVoided && (
                          <span className="ml-2 text-[10px] font-bold text-rose-400 bg-rose-950/60 px-1 rounded border border-rose-900">
                            VOID
                          </span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 font-mono text-neutral-400">
                        {formatKolkataDateTime(p.paymentDate)}
                      </td>

                      {/* Member */}
                      <td className="py-3 px-3">
                        <span
                          onClick={() => member && onSelectMemberById(member.id)}
                          className="font-semibold text-neutral-200 hover:text-amber-400 cursor-pointer transition-colors"
                        >
                          {member?.fullName || 'Unknown Member'}
                        </span>
                        <span className="text-neutral-500 text-[11px] font-mono block">
                          {member?.memberNumber}
                        </span>
                      </td>

                      {/* Mode & Ref */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-neutral-300">{p.method}</span>
                        <span className="text-[11px] font-mono text-neutral-500 block truncate max-w-[160px]">
                          {p.referenceNumber}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-white tabular-nums">
                        {formatINR(p.amountInr)}
                      </td>

                      {/* Cashier */}
                      <td className="py-3 px-3 font-mono text-[11px] text-neutral-400">
                        {p.recordedByUsername}
                      </td>

                      {/* Actions: View Voucher & Void */}
                      <td className="py-3 px-3 text-right space-x-1">
                        {canPrintReceipts && (
                          <button
                            onClick={() => onOpenReceiptModal(p.id)}
                            className="p-1.5 text-neutral-400 hover:text-amber-300 rounded hover:bg-neutral-800 transition-colors"
                            title="Print / View Receipt Voucher"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canVoidAndDeletePayments &&
                          (!p.isVoided ? (
                            <button
                              onClick={() => setVoidModalPayment(p)}
                              className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-neutral-800 transition-colors"
                              title="Void Payment (Safe Reversal)"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setDeleteModalPayment(p)}
                              className="p-1.5 text-neutral-400 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
                              title="Delete Voided Payment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </AnimatedSectionPanel>

      {/* Void Payment Modal */}
      {voidModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Void Payment Voucher</h3>
              </div>
              <button
                onClick={() => setVoidModalPayment(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              In accordance with Flex & Flow audit rules, payments are <strong>voided rather than erased</strong>. A linked reversal entry is logged, and the payment amount of{' '}
              <strong className="text-white font-mono">{formatINR(voidModalPayment.amountInr)}</strong> will no longer count towards member balances or gym reports.
            </p>

            <form onSubmit={handleConfirmVoid} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">
                  Reason for Voiding (Required for Audit Trail)
                </label>
                <textarea
                  required
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Member accidentally entered wrong UPI transaction, or bank chargeback..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:outline-none focus:border-rose-400 font-mono"
                />
              </div>

              {errorMsg && (
                <div className="p-2 bg-rose-950/60 border border-rose-800 rounded text-rose-300 text-xs">
                  {errorMsg}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setVoidModalPayment(null)}
                  className="px-4 py-2 bg-neutral-800 text-neutral-300 hover:text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded"
                >
                  Confirm Void
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Voided Payment Modal */}
      {deleteModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Delete Voided Payment</h3>
              </div>
              <button
                onClick={() => setDeleteModalPayment(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Permanently remove voided voucher{' '}
              <strong className="font-mono text-amber-300">{deleteModalPayment.paymentNumber}</strong> (
              <strong className="font-mono text-white">{formatINR(deleteModalPayment.amountInr)}</strong>) from the ledger? This deletion will be recorded in the activity audit log.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800 text-xs">
              <button
                type="button"
                onClick={() => setDeleteModalPayment(null)}
                className="px-4 py-2 bg-neutral-800 text-neutral-300 hover:text-white rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePayment}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
