import { GymDatabase } from '../types/gym';

export interface MonthlyMetric {
  monthKey: string;
  monthLabel: string;
  fullMonth: string;
  revenueInr: number;
  upiRevenueInr: number;
  cashRevenueInr: number;
  bankRevenueInr: number;
  targetRevenueInr: number;
  momRevenueGrowthPercent: number;
  newSignups: number;
  cumulativeMembers: number;
  churnedMembers: number;
  churnRatePercent: number;
  retentionRatePercent: number;
}

export interface ChurnReasonItem {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

export interface PlanDistributionItem {
  name: string;
  count: number;
  revenueInr: number;
  color: string;
}

export interface AnalyticsSummary {
  total12MonthRevenueInr: number;
  avgMonthlyRevenueInr: number;
  highestMonthRevenueInr: number;
  highestMonthLabel: string;
  latestMomGrowthPercent: number;
  total12MonthSignups: number;
  avgMonthlySignups: number;
  currentActiveRoster: number;
  peakSignupMonthLabel: string;
  peakSignupCount: number;
  avgChurnRatePercent: number;
  currentRetentionRatePercent: number;
  estimatedLtvInr: number;
  avgArpuInr: number;
  monthlyMetrics: MonthlyMetric[];
  churnReasons: ChurnReasonItem[];
  planDistributions: PlanDistributionItem[];
  paymentModeBreakdown: { mode: string; amountInr: number; percentage: number; color: string }[];
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const PLAN_COLORS = ['#f59e0b', '#38bdf8', '#10b981', '#a855f7', '#ec4899', '#94a3b8'];

function buildTrailing12Months(referenceDate: Date = new Date()) {
  const months: { key: string; label: string; full: string }[] = [];
  const endYear = referenceDate.getFullYear();
  const endMonth = referenceDate.getMonth(); // 0-indexed

  for (let offset = 11; offset >= 0; offset--) {
    const d = new Date(endYear, endMonth - offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = `${SHORT_MONTHS[m]} ${String(y).slice(-2)}`;
    const full = `${FULL_MONTHS[m]} ${y}`;
    months.push({ key, label, full });
  }
  return months;
}

export function compute12MonthAnalytics(db: GymDatabase): AnalyticsSummary {
  const trailingMonths = buildTrailing12Months();
  const firstMonthKey = trailingMonths[0].key;

  // Aggregate live valid payments by month
  const livePaymentsByMonth: Record<string, { total: number; upi: number; cash: number; bank: number }> = {};

  db.payments.forEach((p) => {
    if (p.isVoided) return;
    const monthKey = p.paymentDate.slice(0, 7);
    if (!livePaymentsByMonth[monthKey]) {
      livePaymentsByMonth[monthKey] = { total: 0, upi: 0, cash: 0, bank: 0 };
    }
    livePaymentsByMonth[monthKey].total += p.amountInr;
    if (p.method === 'UPI') livePaymentsByMonth[monthKey].upi += p.amountInr;
    else if (p.method === 'Cash') livePaymentsByMonth[monthKey].cash += p.amountInr;
    else livePaymentsByMonth[monthKey].bank += p.amountInr;
  });

  // Count live signups by month
  const liveSignupsByMonth: Record<string, number> = {};
  let priorSignups = 0;
  db.members.forEach((m) => {
    const monthKey = m.joinedDate.slice(0, 7);
    if (monthKey < firstMonthKey) {
      priorSignups += 1;
    } else {
      liveSignupsByMonth[monthKey] = (liveSignupsByMonth[monthKey] || 0) + 1;
    }
  });

  // Count churned memberships by end month
  const churnedByMonth: Record<string, number> = {};
  let priorChurned = 0;
  db.memberships.forEach((ms) => {
    if (ms.status === 'expired' || ms.status === 'cancelled') {
      const endKey = ms.endDate.slice(0, 7);
      if (endKey < firstMonthKey) {
        priorChurned += 1;
      } else {
        churnedByMonth[endKey] = (churnedByMonth[endKey] || 0) + 1;
      }
    }
  });

  let runningMembers = Math.max(0, priorSignups - priorChurned);
  let prevMonthRev = 0;

  const monthlyMetrics: MonthlyMetric[] = trailingMonths.map((base) => {
    const live = livePaymentsByMonth[base.key] || { total: 0, upi: 0, cash: 0, bank: 0 };
    const signups = liveSignupsByMonth[base.key] || 0;
    const churned = churnedByMonth[base.key] || 0;

    const totalRev = live.total;
    const upiRev = live.upi;
    const cashRev = live.cash;
    const bankRev = live.bank;

    const baseBeforeChurn = runningMembers + signups;
    const churnRate =
      baseBeforeChurn > 0 ? Number(((churned / baseBeforeChurn) * 100).toFixed(1)) : 0;
    const retentionRate =
      baseBeforeChurn > 0 ? Number(Math.max(0, 100 - churnRate).toFixed(1)) : 0;

    runningMembers = Math.max(0, baseBeforeChurn - churned);

    const momGrowth =
      prevMonthRev > 0
        ? Number((((totalRev - prevMonthRev) / prevMonthRev) * 100).toFixed(1))
        : totalRev > 0
        ? 100
        : 0;

    const targetRevenue = prevMonthRev > 0 ? Math.round(prevMonthRev * 1.1) : totalRev;
    prevMonthRev = totalRev;

    return {
      monthKey: base.key,
      monthLabel: base.label,
      fullMonth: base.full,
      revenueInr: totalRev,
      upiRevenueInr: upiRev,
      cashRevenueInr: cashRev,
      bankRevenueInr: bankRev,
      targetRevenueInr: targetRevenue,
      momRevenueGrowthPercent: momGrowth,
      newSignups: signups,
      cumulativeMembers: runningMembers,
      churnedMembers: churned,
      churnRatePercent: churnRate,
      retentionRatePercent: retentionRate,
    };
  });

  // Summary Metrics
  const total12MonthRevenueInr = monthlyMetrics.reduce((sum, m) => sum + m.revenueInr, 0);
  const activeMonthsCount = monthlyMetrics.filter((m) => m.revenueInr > 0).length;
  const avgMonthlyRevenueInr =
    activeMonthsCount > 0 ? Math.round(total12MonthRevenueInr / activeMonthsCount) : 0;

  let highestMonthRevenueInr = 0;
  let highestMonthLabel = '—';
  monthlyMetrics.forEach((m) => {
    if (m.revenueInr > highestMonthRevenueInr) {
      highestMonthRevenueInr = m.revenueInr;
      highestMonthLabel = m.monthLabel;
    }
  });

  const latestMomGrowthPercent =
    monthlyMetrics[monthlyMetrics.length - 1]?.momRevenueGrowthPercent ?? 0;

  const total12MonthSignups = monthlyMetrics.reduce((sum, m) => sum + m.newSignups, 0);
  const signupMonthsCount = monthlyMetrics.filter((m) => m.newSignups > 0).length;
  const avgMonthlySignups =
    signupMonthsCount > 0 ? Math.round(total12MonthSignups / signupMonthsCount) : 0;

  let peakSignupCount = 0;
  let peakSignupMonthLabel = '—';
  monthlyMetrics.forEach((m) => {
    if (m.newSignups > peakSignupCount) {
      peakSignupCount = m.newSignups;
      peakSignupMonthLabel = m.fullMonth;
    }
  });

  const currentActiveRoster = db.members.filter((m) => m.status === 'active').length;

  const monthsWithMembers = monthlyMetrics.filter(
    (m) => m.cumulativeMembers > 0 || m.churnedMembers > 0
  );
  const avgChurnRatePercent =
    monthsWithMembers.length > 0
      ? Number(
          (
            monthsWithMembers.reduce((sum, m) => sum + m.churnRatePercent, 0) /
            monthsWithMembers.length
          ).toFixed(1)
        )
      : 0;

  const lastWithMembers = [...monthsWithMembers].reverse()[0];
  const currentRetentionRatePercent = lastWithMembers ? lastWithMembers.retentionRatePercent : 0;

  // Estimated LTV & ARPU from live member/payment counts
  const totalMembersCount = db.members.length;
  const avgArpuInr =
    totalMembersCount > 0 && avgMonthlyRevenueInr > 0
      ? Math.round(avgMonthlyRevenueInr / totalMembersCount)
      : 0;
  const estimatedLtvInr =
    totalMembersCount > 0 && total12MonthRevenueInr > 0
      ? Math.round(total12MonthRevenueInr / totalMembersCount)
      : 0;

  // Live inactive/churn status breakdown from real member statuses
  const expiredCount = db.members.filter((m) => m.status === 'expired').length;
  const pendingCount = db.members.filter((m) => m.status === 'pending_renewal').length;
  const frozenCount = db.members.filter((m) => m.status === 'frozen').length;
  const totalAtRisk = expiredCount + pendingCount + frozenCount;

  const churnReasons: ChurnReasonItem[] =
    totalAtRisk > 0
      ? [
          {
            name: 'Expired Memberships',
            count: expiredCount,
            percentage: Math.round((expiredCount / totalAtRisk) * 100),
            color: '#f43f5e',
          },
          {
            name: 'Pending Renewal',
            count: pendingCount,
            percentage: Math.round((pendingCount / totalAtRisk) * 100),
            color: '#f59e0b',
          },
          {
            name: 'Frozen / Paused',
            count: frozenCount,
            percentage: Math.round((frozenCount / totalAtRisk) * 100),
            color: '#38bdf8',
          },
        ].filter((item) => item.count > 0)
      : [];

  // Live Plan Distribution from real enrollments
  const planMap: Record<string, { count: number; revenueInr: number }> = {};
  db.memberships.forEach((ms) => {
    if (ms.status === 'cancelled') return;
    if (!planMap[ms.planName]) {
      planMap[ms.planName] = { count: 0, revenueInr: 0 };
    }
    planMap[ms.planName].count += 1;
    planMap[ms.planName].revenueInr += ms.totalPriceInr;
  });

  const planDistributions: PlanDistributionItem[] = Object.entries(planMap)
    .sort((a, b) => b[1].revenueInr - a[1].revenueInr)
    .map(([name, info], idx) => ({
      name,
      count: info.count,
      revenueInr: info.revenueInr,
      color: PLAN_COLORS[idx % PLAN_COLORS.length],
    }));

  // Payment Mode Breakdown from live valid payments
  const totalUpi = monthlyMetrics.reduce((sum, m) => sum + m.upiRevenueInr, 0);
  const totalCash = monthlyMetrics.reduce((sum, m) => sum + m.cashRevenueInr, 0);
  const totalBank = monthlyMetrics.reduce((sum, m) => sum + m.bankRevenueInr, 0);
  const totalAll = totalUpi + totalCash + totalBank;

  const paymentModeBreakdown =
    totalAll > 0
      ? [
          {
            mode: 'UPI (GPay / PhonePe / Paytm)',
            amountInr: totalUpi,
            percentage: Number(((totalUpi / totalAll) * 100).toFixed(1)),
            color: '#10b981',
          },
          {
            mode: 'Cash at Reception',
            amountInr: totalCash,
            percentage: Number(((totalCash / totalAll) * 100).toFixed(1)),
            color: '#38bdf8',
          },
          {
            mode: 'Bank Transfer & POS Card',
            amountInr: totalBank,
            percentage: Number(((totalBank / totalAll) * 100).toFixed(1)),
            color: '#f59e0b',
          },
        ]
      : [];

  return {
    total12MonthRevenueInr,
    avgMonthlyRevenueInr,
    highestMonthRevenueInr,
    highestMonthLabel,
    latestMomGrowthPercent,
    total12MonthSignups,
    avgMonthlySignups,
    currentActiveRoster,
    peakSignupMonthLabel,
    peakSignupCount,
    avgChurnRatePercent,
    currentRetentionRatePercent,
    estimatedLtvInr,
    avgArpuInr,
    monthlyMetrics,
    churnReasons,
    planDistributions,
    paymentModeBreakdown,
  };
}
