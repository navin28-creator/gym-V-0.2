import { jsPDF } from 'jspdf';
import type { GymDatabase, Member, PaymentMethod, PaymentRecord } from '../types/gym';
import { formatKolkataDate, formatKolkataDateTime } from './crypto';

function formatPdfINR(amount: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(amount);
  return `INR ${formatted}`;
}

export function downloadPaymentReceiptPdf(
  payment: PaymentRecord,
  member: Member,
  db: GymDatabase
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const gstEnabled = Boolean(db.upgradeModules?.gstInvoicingEnabled);

  // Dark Header Band
  doc.setFillColor(18, 18, 20);
  doc.rect(0, 0, pageWidth, 118, 'F');

  doc.setTextColor(251, 191, 36); // amber-400
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('FLEX & FLOW', 42, 46);

  doc.setTextColor(200, 200, 205);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('GYM & FITNESS CLUB · OFFLINE DESKTOP LEDGER', 42, 64);
  doc.text('100-Ft Ring Road, Indiranagar, Bengaluru 560038', 42, 80);
  doc.text('GSTIN: 29AABCU9603R1ZM  ·  Tel: +91 80 4123 9900', 42, 95);

  doc.setTextColor(160, 160, 170);
  doc.setFontSize(8.5);
  doc.text('RECEIPT VOUCHER #', pageWidth - 42, 42, { align: 'right' });
  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(payment.paymentNumber, pageWidth - 42, 60, { align: 'right' });
  doc.setTextColor(220, 220, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(formatKolkataDateTime(payment.paymentDate), pageWidth - 42, 78, { align: 'right' });
  doc.text(
    `Status: ${payment.isVoided ? 'VOIDED / REVERSED' : 'CONFIRMED'}`,
    pageWidth - 42,
    95,
    { align: 'right' }
  );

  // Void Stamp Banner if voided
  let cursorY = 148;
  if (payment.isVoided) {
    doc.setFillColor(127, 29, 29);
    doc.roundedRect(42, cursorY - 14, pageWidth - 84, 38, 4, 4, 'F');
    doc.setTextColor(254, 202, 202);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(
      `VOIDED TRANSACTION — Reason: ${payment.voidReason || 'Not specified'}`,
      54,
      cursorY + 9
    );
    cursorY += 48;
  }

  // Member Box
  doc.setFillColor(246, 246, 248);
  doc.setDrawColor(220, 220, 226);
  doc.roundedRect(42, cursorY, pageWidth - 84, 74, 6, 6, 'FD');

  doc.setTextColor(110, 110, 120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('MEMBER DETAILS', 56, cursorY + 20);
  doc.text('CONTACT', 320, cursorY + 20);

  doc.setTextColor(20, 20, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(member.fullName, 56, cursorY + 39);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 90);
  doc.text(`Member ID: ${member.memberNumber}  ·  Status: ${member.status.toUpperCase()}`, 56, cursorY + 56);

  doc.setTextColor(20, 20, 24);
  doc.text(member.phone || 'N/A', 320, cursorY + 39);
  doc.setTextColor(80, 80, 90);
  doc.text(member.email || 'No email on file', 320, cursorY + 56);

  cursorY += 102;

  // Line items header
  doc.setDrawColor(210, 210, 218);
  doc.line(42, cursorY, pageWidth - 42, cursorY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 110);
  doc.text('DESCRIPTION', 44, cursorY - 8);
  doc.text('PAYMENT MODE & REF', 280, cursorY - 8);
  doc.text('AMOUNT', pageWidth - 44, cursorY - 8, { align: 'right' });

  cursorY += 26;
  const linkedPlan = payment.membershipId
    ? db.memberships.find((m) => m.id === payment.membershipId)
    : undefined;

  doc.setTextColor(20, 20, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    linkedPlan ? `Membership Fee: ${linkedPlan.planName}` : 'External Gym Fee Settlement',
    44,
    cursorY
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(85, 85, 95);
  doc.text(`${payment.method}`, 280, cursorY);
  doc.text(`Ref: ${payment.referenceNumber}`, 280, cursorY + 15);
  if (payment.notes) {
    doc.text(`Notes: ${payment.notes.slice(0, 60)}`, 44, cursorY + 16);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 24);
  doc.text(formatPdfINR(payment.amountInr), pageWidth - 44, cursorY + 4, { align: 'right' });

  cursorY += 44;

  if (gstEnabled) {
    const baseAmt = Math.round((payment.amountInr / 1.18) * 100) / 100;
    const cgst = Math.round(((payment.amountInr - baseAmt) / 2) * 100) / 100;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(95, 95, 105);
    doc.text(`Taxable Value (SAC 999723): ${formatPdfINR(baseAmt)}`, 44, cursorY);
    doc.text(`CGST (9%): ${formatPdfINR(cgst)}  |  SGST (9%): ${formatPdfINR(cgst)}`, 44, cursorY + 15);
    cursorY += 34;
  }

  // Total Box
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(42, cursorY, pageWidth - 84, 46, 6, 6, 'F');
  doc.setTextColor(225, 225, 232);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL SETTLED (EXTERNAL LEDGER)', 56, cursorY + 28);
  doc.setTextColor(251, 191, 36);
  doc.setFontSize(15);
  doc.text(formatPdfINR(payment.amountInr), pageWidth - 56, cursorY + 29, { align: 'right' });

  cursorY += 80;

  // Footer / Audit Trail Note
  doc.setDrawColor(230, 230, 235);
  doc.line(42, cursorY, pageWidth - 42, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(115, 115, 125);
  doc.text(
    `Recorded in local SQLite (gym.sqlite) by staff "${payment.recordedByUsername}" · Asia/Kolkata timezone`,
    42,
    cursorY + 18
  );
  doc.text(
    'This voucher confirms an offline/external fee settlement logged inside Flex & Flow Desktop Manager.',
    42,
    cursorY + 32
  );

  doc.save(`Receipt-${payment.paymentNumber}.pdf`);
}

export interface FinancialReportOptions {
  db: GymDatabase;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  methodFilter: 'all' | PaymentMethod;
  includeVoided: boolean;
}

function filterPaymentsForReport(opts: FinancialReportOptions): PaymentRecord[] {
  return opts.db.payments.filter((p) => {
    const pDay = p.paymentDate.slice(0, 10);
    if (opts.fromDate && pDay < opts.fromDate) return false;
    if (opts.toDate && pDay > opts.toDate) return false;
    if (opts.methodFilter !== 'all' && p.method !== opts.methodFilter) return false;
    if (!opts.includeVoided && p.isVoided) return false;
    return true;
  });
}

export function downloadFinancialReportPdf(opts: FinancialReportOptions): void {
  const rows = filterPaymentsForReport(opts);
  const validRows = rows.filter((r) => !r.isVoided);
  const voidedRows = rows.filter((r) => r.isVoided);

  const netCollected = validRows.reduce((s, r) => s + r.amountInr, 0);
  const voidedTotal = voidedRows.reduce((s, r) => s + r.amountInr, 0);

  // Outstanding dues across all members
  let totalOutstanding = 0;
  for (const m of opts.db.members) {
    const billed = opts.db.memberships
      .filter((ms) => ms.memberId === m.id && ms.status !== 'cancelled')
      .reduce((s, ms) => s + ms.totalPriceInr, 0);
    const paid = opts.db.payments
      .filter((p) => p.memberId === m.id && !p.isVoided)
      .reduce((s, p) => s + p.amountInr, 0);
    totalOutstanding += Math.max(0, billed - paid);
  }

  const methods: PaymentMethod[] = ['UPI', 'Cash', 'Bank Transfer', 'POS Card', 'Cheque'];
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(18, 18, 20);
  doc.rect(0, 0, pageWidth, 92, 'F');
  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FLEX & FLOW — FINANCIAL LEDGER REPORT', 40, 40);
  doc.setTextColor(210, 210, 215);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    `Period: ${formatKolkataDate(opts.fromDate)} to ${formatKolkataDate(opts.toDate)}  ·  Mode: ${
      opts.methodFilter === 'all' ? 'All Modes' : opts.methodFilter
    }`,
    40,
    60
  );
  doc.text(`Generated: ${formatKolkataDateTime(new Date().toISOString())}`, 40, 76);

  // KPI summary row
  let y = 114;
  const kpis = [
    { label: 'Net Collections', val: formatPdfINR(netCollected) },
    { label: 'Valid Receipts', val: `${validRows.length}` },
    { label: 'Voided Value', val: formatPdfINR(voidedTotal) },
    { label: 'Outstanding Dues', val: formatPdfINR(totalOutstanding) },
  ];
  const cardW = (pageWidth - 80 - 24) / 4;
  kpis.forEach((k, idx) => {
    const x = 40 + idx * (cardW + 8);
    doc.setFillColor(246, 246, 248);
    doc.setDrawColor(220, 220, 226);
    doc.roundedRect(x, y, cardW, 50, 4, 4, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 120);
    doc.text(k.label.toUpperCase(), x + 10, y + 18);
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 24);
    doc.text(k.val, x + 10, y + 37);
  });

  y += 72;

  // Mode Breakdown
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 35);
  doc.text('PAYMENT METHOD BREAKDOWN', 40, y);
  y += 14;

  methods.forEach((m) => {
    const modeRows = validRows.filter((r) => r.method === m);
    const modeSum = modeRows.reduce((s, r) => s + r.amountInr, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 80);
    doc.text(`${m} (${modeRows.length} txns)`, 44, y + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(formatPdfINR(modeSum), pageWidth - 44, y + 10, { align: 'right' });
    y += 16;
  });

  y += 18;

  // Table Header
  const drawTableHeader = (topY: number) => {
    doc.setFillColor(24, 24, 27);
    doc.rect(40, topY, pageWidth - 80, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(251, 191, 36);
    doc.text('RECEIPT #', 46, topY + 14);
    doc.text('DATE', 155, topY + 14);
    doc.text('MEMBER', 235, topY + 14);
    doc.text('MODE', 360, topY + 14);
    doc.text('STATUS', 430, topY + 14);
    doc.text('AMOUNT', pageWidth - 46, topY + 14, { align: 'right' });
    return topY + 26;
  };

  y = drawTableHeader(y);

  for (const p of rows) {
    if (y > pageHeight - 54) {
      doc.addPage();
      y = drawTableHeader(40);
    }
    const member = opts.db.members.find((m) => m.id === p.memberId);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(30, 30, 35);
    doc.text(p.paymentNumber, 46, y + 10);
    doc.text(p.paymentDate.slice(0, 10), 155, y + 10);
    doc.text((member?.fullName || 'Unknown').slice(0, 22), 235, y + 10);
    doc.text(p.method, 360, y + 10);
    doc.setTextColor(p.isVoided ? 185 : 22, p.isVoided ? 28 : 101, p.isVoided ? 28 : 52);
    doc.text(p.isVoided ? 'VOIDED' : 'VALID', 430, y + 10);
    doc.setTextColor(20, 20, 24);
    doc.setFont('helvetica', 'bold');
    doc.text(formatPdfINR(p.amountInr), pageWidth - 46, y + 10, { align: 'right' });

    doc.setDrawColor(235, 235, 240);
    doc.line(40, y + 16, pageWidth - 40, y + 16);
    y += 20;
  }

  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(120, 120, 130);
    doc.text('No transactions matched the selected date range and filter.', 46, y + 18);
  }

  doc.save(`FlexFlow-Financial-Report-${opts.fromDate}-to-${opts.toDate}.pdf`);
}

export function downloadFinancialReportCsv(opts: FinancialReportOptions): void {
  const rows = filterPaymentsForReport(opts);
  const header = [
    'Receipt Number',
    'Date (ISO)',
    'Member Name',
    'Member ID',
    'Payment Method',
    'Reference / UTR',
    'Amount (INR)',
    'Status',
    'Recorded By',
    'Void Reason',
  ];

  const escapeCsv = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [header.join(',')];
  for (const p of rows) {
    const member = opts.db.members.find((m) => m.id === p.memberId);
    lines.push(
      [
        p.paymentNumber,
        p.paymentDate,
        member?.fullName || 'Unknown',
        member?.memberNumber || '',
        p.method,
        p.referenceNumber,
        p.amountInr,
        p.isVoided ? 'VOIDED' : 'VALID',
        p.recordedByUsername,
        p.voidReason || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FlexFlow-Financial-Ledger-${opts.fromDate}-to-${opts.toDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
