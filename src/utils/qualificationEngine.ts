import type {
  QualificationEntry,
  QualificationSummary,
} from '../types/trading';
import { roundToCents } from './portfolioEngine';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_NOTES_LENGTH = 500;

export const INITIAL_QUALIFICATION_ENTRIES: QualificationEntry[] = [
  {
    entryId: '2026-11-19',
    date: '2026-11-19',
    dayNumber: 1,
    equityUsd: 100420.15,
    dailyPnlUsd: 420.15,
    netSharpe: 1.48,
    maxDrawdownPct: 0.9,
    slippageCostUsd: 18.4,
    guardTripsCount: 0,
    allGuardsNominal: true,
    notes: 'Day 1 baseline paper session across US PEAD and Crypto 4h EMA 12/48.',
  },
  {
    entryId: '2026-11-20',
    date: '2026-11-20',
    dayNumber: 2,
    equityUsd: 101249.93,
    dailyPnlUsd: 829.78,
    netSharpe: 1.66,
    maxDrawdownPct: 1.2,
    slippageCostUsd: 24.1,
    guardTripsCount: 0,
    allGuardsNominal: true,
    notes: 'All 4 sleeves nominal; FINRA 4210 PDT corridor verified with +$76k cushion.',
  },
  {
    entryId: '2026-11-21',
    date: '2026-11-21',
    dayNumber: 3,
    equityUsd: 102297.83,
    dailyPnlUsd: 1047.9,
    netSharpe: 1.84,
    maxDrawdownPct: 1.2,
    slippageCostUsd: 21.75,
    guardTripsCount: 0,
    allGuardsNominal: true,
    notes: 'AMAT/QCOM short PEAD drift captured; zero dropped orders on SIP-DIRECT.',
  },
];

export interface QualificationInputRaw {
  date: string;
  dayNumber: string;
  equityUsd: string;
  dailyPnlUsd: string;
  netSharpe: string;
  maxDrawdownPct: string;
  slippageCostUsd: string;
  guardTripsCount: string;
  allGuardsNominal: boolean;
  notes: string;
}

export interface QualificationValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof QualificationInputRaw, string>>;
  parsed?: QualificationEntry;
}

export function validateQualificationInput(
  raw: QualificationInputRaw
): QualificationValidationResult {
  const errors: Partial<Record<keyof QualificationInputRaw, string>> = {};
  const date = raw.date.trim();
  const dayNumber = Number(raw.dayNumber);
  const equityUsd = Number(raw.equityUsd);
  const dailyPnlUsd = Number(raw.dailyPnlUsd);
  const netSharpe = Number(raw.netSharpe);
  const maxDrawdownPct = Number(raw.maxDrawdownPct);
  const slippageCostUsd = Number(raw.slippageCostUsd);
  const guardTripsCount = Number(raw.guardTripsCount);
  const notes = raw.notes.trim();

  if (!ISO_DATE_PATTERN.test(date)) {
    errors.date = 'Use YYYY-MM-DD format.';
  }
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 365) {
    errors.dayNumber = 'Day number must be an integer between 1 and 365.';
  }
  if (!Number.isFinite(equityUsd) || equityUsd < 0 || equityUsd > 1_000_000_000) {
    errors.equityUsd = 'Equity must be a non-negative number.';
  }
  if (
    !Number.isFinite(dailyPnlUsd) ||
    dailyPnlUsd < -100_000_000 ||
    dailyPnlUsd > 100_000_000
  ) {
    errors.dailyPnlUsd = 'Enter a valid daily P&L in USD.';
  }
  if (!Number.isFinite(netSharpe) || netSharpe < -20 || netSharpe > 20) {
    errors.netSharpe = 'Net Sharpe must be between -20 and 20.';
  }
  if (
    !Number.isFinite(maxDrawdownPct) ||
    maxDrawdownPct < 0 ||
    maxDrawdownPct > 100
  ) {
    errors.maxDrawdownPct = 'Drawdown % must be between 0 and 100.';
  }
  if (
    !Number.isFinite(slippageCostUsd) ||
    slippageCostUsd < 0 ||
    slippageCostUsd > 10_000_000
  ) {
    errors.slippageCostUsd = 'Slippage & fees must be >= 0.';
  }
  if (
    !Number.isInteger(guardTripsCount) ||
    guardTripsCount < 0 ||
    guardTripsCount > 1000
  ) {
    errors.guardTripsCount = 'Guard trips must be an integer >= 0.';
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Notes cannot exceed ${MAX_NOTES_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    parsed: {
      entryId: date,
      date,
      dayNumber,
      equityUsd: roundToCents(equityUsd),
      dailyPnlUsd: roundToCents(dailyPnlUsd),
      netSharpe: Math.round(netSharpe * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
      slippageCostUsd: roundToCents(slippageCostUsd),
      guardTripsCount,
      allGuardsNominal: Boolean(raw.allGuardsNominal),
      notes,
    },
  };
}

export function computeQualificationSummary(
  entries: QualificationEntry[],
  targetDays = 60
): QualificationSummary {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const totalLoggedDays = sorted.length;
  const nominalDays = sorted.filter((e) => e.allGuardsNominal).length;
  const cumulativePnlUsd = roundToCents(
    sorted.reduce((sum, e) => sum + e.dailyPnlUsd, 0)
  );
  const cumulativeSlippageUsd = roundToCents(
    sorted.reduce((sum, e) => sum + e.slippageCostUsd, 0)
  );
  const avgNetSharpe =
    totalLoggedDays > 0
      ? Math.round(
          (sorted.reduce((sum, e) => sum + e.netSharpe, 0) / totalLoggedDays) *
            100
        ) / 100
      : 0;
  const worstDrawdownPct =
    totalLoggedDays > 0
      ? Math.max(...sorted.map((e) => e.maxDrawdownPct))
      : 0;
  const totalGuardTrips = sorted.reduce((sum, e) => sum + e.guardTripsCount, 0);
  const progressPct = Math.min(
    100,
    Math.round((nominalDays / Math.max(1, targetDays)) * 100)
  );

  const daysGatePassed = nominalDays >= targetDays;
  const sharpeGatePassed = totalLoggedDays > 0 && avgNetSharpe >= 1.2;
  const drawdownGatePassed = totalLoggedDays > 0 && worstDrawdownPct <= 8.0;
  const latestGuardsNominal =
    totalLoggedDays > 0 ? sorted[0].allGuardsNominal : false;

  return {
    targetDays,
    totalLoggedDays,
    nominalDays,
    progressPct,
    cumulativePnlUsd,
    cumulativeSlippageUsd,
    avgNetSharpe,
    worstDrawdownPct,
    totalGuardTrips,
    daysGatePassed,
    sharpeGatePassed,
    drawdownGatePassed,
    latestGuardsNominal,
    qualifiedForLive:
      daysGatePassed &&
      sharpeGatePassed &&
      drawdownGatePassed &&
      latestGuardsNominal,
  };
}
