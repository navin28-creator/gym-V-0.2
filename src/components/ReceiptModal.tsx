import React from 'react';
import { GymDatabase, PaymentRecord, Member } from '../types/gym';
import { formatINR, formatKolkataDateTime } from '../services/crypto';
import { downloadPaymentReceiptPdf } from '../services/pdfExport';
import { dbService } from '../services/db';
import { X, Printer, Share2, Check, Download, ShieldCheck } from 'lucide-react';

interface ReceiptModalProps {
  payment: PaymentRecord;
  member: Member;
  db?: GymDatabase;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ payment, member, db, onClose }) => {
  const [copied, setCopied] = React.useState(false);
  const [pdfSaved, setPdfSaved] = React.useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    downloadPaymentReceiptPdf(payment, member, db || dbService.getDb());
    setPdfSaved(true);
    setTimeout(() => setPdfSaved(false), 2500);
  };

  const handleCopyText = () => {
    const text = `FLEX & FLOW GYM RECEIPT
Receipt No: ${payment.paymentNumber}
Date: ${formatKolkataDateTime(payment.paymentDate)}
Member: ${member.fullName} (${member.memberNumber})
Amount Paid: ${formatINR(payment.amountInr)}
Payment Mode: ${payment.method}
Ref / Txn ID: ${payment.referenceNumber}
Handled By: ${payment.recordedByUsername}
Status: ${payment.isVoided ? 'VOIDED' : 'CONFIRMED'}
Thank you for training with Flex & Flow!`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden text-neutral-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-white">Payment Receipt Voucher</span>
            {payment.isVoided && (
              <span className="px-2 py-0.5 text-xs font-semibold text-rose-400 bg-rose-950/60 border border-rose-800 rounded">
                VOIDED
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-6 space-y-6 bg-neutral-900" id="printable-receipt">
          {/* Gym Branding */}
          <div className="flex justify-between items-start border-b border-neutral-800 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-wider text-amber-400">FLEX & FLOW</span>
                <span className="text-xs text-neutral-400 font-mono">GYM & FITNESS CLUB</span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">100-Ft Ring Road, Indiranagar, Bengaluru 560038</p>
              <p className="text-xs text-neutral-500 font-mono">GSTIN: 29AABCU9603R1ZM · +91 80 4123 9900</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-neutral-400 block">RECEIPT NUMBER</span>
              <span className="text-sm font-mono font-bold text-amber-300">{payment.paymentNumber}</span>
              <span className="text-xs text-neutral-400 block mt-1">
                {formatKolkataDateTime(payment.paymentDate)}
              </span>
            </div>
          </div>

          {/* Member Details */}
          <div className="grid grid-cols-2 gap-4 text-xs bg-neutral-950/60 p-4 rounded-lg border border-neutral-800/80">
            <div>
              <span className="text-neutral-500 block uppercase font-mono tracking-wider">Member Name</span>
              <span className="font-semibold text-neutral-200 text-sm">{member.fullName}</span>
              <span className="text-neutral-400 block font-mono mt-0.5">{member.memberNumber}</span>
            </div>
            <div>
              <span className="text-neutral-500 block uppercase font-mono tracking-wider">Phone / Contact</span>
              <span className="text-neutral-300 font-mono">{member.phone}</span>
              <span className="text-neutral-400 block truncate">{member.email}</span>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-neutral-400 uppercase font-mono border-b border-neutral-800 pb-2">
              <span>Description</span>
              <span>Amount (INR)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <div>
                <span className="font-medium text-white">External Gym Fee Settlement</span>
                <span className="block text-xs text-neutral-400 mt-0.5">
                  Payment Method: <strong className="text-neutral-200 font-normal">{payment.method}</strong>
                </span>
                <span className="block text-xs font-mono text-neutral-500">
                  Ref / Txn: {payment.referenceNumber}
                </span>
              </div>
              <span className="text-base font-bold text-white font-mono tabular-nums">
                {formatINR(payment.amountInr)}
              </span>
            </div>
          </div>

          {/* Total */}
          <div className="pt-4 border-t border-neutral-800 flex justify-between items-center bg-neutral-950/40 p-3 rounded-lg">
            <span className="text-sm font-semibold text-neutral-300">Total Settled Outside App</span>
            <span className="text-xl font-extrabold text-amber-400 font-mono tabular-nums">
              {formatINR(payment.amountInr)}
            </span>
          </div>

          {/* Void notice if applicable */}
          {payment.isVoided && (
            <div className="p-3 bg-rose-950/40 border border-rose-900 rounded-lg text-xs text-rose-300">
              <span className="font-bold block">REVERSED / VOIDED TRANSACTION</span>
              <span>Reason: {payment.voidReason || 'Not specified'}</span>
              <span className="block text-rose-400/80 font-mono mt-0.5">
                Voided on {payment.voidedAt ? formatKolkataDateTime(payment.voidedAt) : 'N/A'}
              </span>
            </div>
          )}

          {/* Footer note */}
          <div className="text-center pt-2 border-t border-neutral-800/80">
            <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Recorded locally in gym.sqlite by staff {payment.recordedByUsername}</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Payments are records of transactions handled outside this application. All dues subject to gym terms.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 bg-neutral-950/80">
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            <span>{copied ? 'Copied Receipt' : 'Copy Text'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm"
            >
              {pdfSaved ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>{pdfSaved ? 'PDF Saved' : 'Download PDF'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-neutral-900 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors font-semibold shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
