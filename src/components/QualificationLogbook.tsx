import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  LogIn,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { CloudSyncStatus, QualificationEntry } from '../types/trading';
import { formatCurrency, formatSignedCurrency } from '../utils/portfolioEngine';
import {
  computeQualificationSummary,
  validateQualificationInput,
} from '../utils/qualificationEngine';

interface QualificationLogbookProps {
  entries: QualificationEntry[];
  liveEquityUsd: number;
  liveTodayPnlUsd: number;
  allSleevesNominal: boolean;
  cloudSyncStatus: CloudSyncStatus;
  userDisplayName: string | null;
  onSignIn: () => void;
  onSaveEntry: (entry: QualificationEntry) => Promise<void> | void;
  onDeleteEntry: (entryId: string) => Promise<void> | void;
}

export function QualificationLogbook({
  entries,
  liveEquityUsd,
  liveTodayPnlUsd,
  allSleevesNominal,
  cloudSyncStatus,
  userDisplayName,
  onSignIn,
  onSaveEntry,
  onDeleteEntry,
}: QualificationLogbookProps) {
  const summary = useMemo(() => computeQualificationSummary(entries, 60), [entries]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const nextDayNumber =
    entries.length > 0 ? Math.max(...entries.map((e) => e.dayNumber)) + 1 : 1;

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayNumber, setDayNumber] = useState(String(nextDayNumber));
  const [equityUsd, setEquityUsd] = useState(liveEquityUsd.toFixed(2));
  const [dailyPnlUsd, setDailyPnlUsd] = useState(liveTodayPnlUsd.toFixed(2));
  const [netSharpe, setNetSharpe] = useState('1.84');
  const [maxDrawdownPct, setMaxDrawdownPct] = useState('1.2');
  const [slippageCostUsd, setSlippageCostUsd] = useState('21.50');
  const [guardTripsCount, setGuardTripsCount] = useState(allSleevesNominal ? '0' : '1');
  const [allGuardsNominal, setAllGuardsNominal] = useState(allSleevesNominal);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openPrefilledForm = () => {
    setDate(new Date().toISOString().slice(0, 10));
    setDayNumber(String(nextDayNumber));
    setEquityUsd(liveEquityUsd.toFixed(2));
    setDailyPnlUsd(liveTodayPnlUsd.toFixed(2));
    setGuardTripsCount(allSleevesNominal ? '0' : '1');
    setAllGuardsNominal(allSleevesNominal);
    setNotes('');
    setErrors({});
    setFormOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const check = validateQualificationInput({
      date,
      dayNumber,
      equityUsd,
      dailyPnlUsd,
      netSharpe,
      maxDrawdownPct,
      slippageCostUsd,
      guardTripsCount,
      allGuardsNominal,
      notes,
    });
    if (!check.valid || !check.parsed) {
      setErrors(check.errors as Record<string, string>);
      return;
    }
    setSaving(true);
    try {
      await onSaveEntry(check.parsed);
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const isCloudSynced = cloudSyncStatus === 'synced';

  return (
    <div className="space-y-4">
      {/* Top 60-Day Qualification Gate Summary */}
      <section
        aria-label="60-Day Paper Qualification Gate"
        className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                60-Day Paper Qualification Gate
              </h2>
              <span
                data-testid="cloud-sync-indicator"
                className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                  isCloudSynced
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {isCloudSynced ? (
                  <>
                    <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Firestore Synced ({userDisplayName ?? 'Operator'})</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Local Preview — Sign in to persist in Firestore</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cloud-persisted daily paper checkpoints tracking net-of-cost Sharpe, drawdown, slippage friction, and fail-closed guard integrity across devices.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isCloudSynced && (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#131924] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A2232] transition-colors whitespace-nowrap"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign in with Google</span>
              </button>
            )}
            <button
              type="button"
              onClick={openPrefilledForm}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Log Paper Session</span>
            </button>
          </div>
        </div>

        {/* 4 Readiness Gate KPIs */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-[#19212E]">
          <div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Verified Nominal Days</span>
              <span
                className={
                  summary.daysGatePassed
                    ? 'font-mono font-semibold text-emerald-600 dark:text-emerald-400'
                    : 'font-mono text-amber-600 dark:text-amber-400'
                }
              >
                {summary.daysGatePassed ? 'PASS' : 'IN PROGRESS'}
              </span>
            </div>
            <p
              data-testid="qualification-days-progress"
              className="font-mono tabular-nums text-lg font-semibold text-slate-950 dark:text-white mt-0.5"
            >
              {summary.nominalDays} / {summary.targetDays} ({summary.progressPct}%)
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Avg Net Sharpe (&ge; 1.20)</span>
              <span
                className={
                  summary.sharpeGatePassed
                    ? 'font-mono font-semibold text-emerald-600 dark:text-emerald-400'
                    : 'font-mono font-semibold text-red-600 dark:text-red-400'
                }
              >
                {summary.sharpeGatePassed ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <p className="font-mono tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {summary.avgNetSharpe.toFixed(2)}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Worst Drawdown (&le; 8.0%)</span>
              <span
                className={
                  summary.drawdownGatePassed
                    ? 'font-mono font-semibold text-emerald-600 dark:text-emerald-400'
                    : 'font-mono font-semibold text-red-600 dark:text-red-400'
                }
              >
                {summary.drawdownGatePassed ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <p className="font-mono tabular-nums text-lg font-semibold text-slate-950 dark:text-white mt-0.5">
              {summary.worstDrawdownPct.toFixed(2)}%
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Net P&amp;L · Friction Cost</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">
                {summary.totalGuardTrips} trips
              </span>
            </div>
            <p className="font-mono tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {formatSignedCurrency(summary.cumulativePnlUsd)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                (-{formatCurrency(summary.cumulativeSlippageUsd)})
              </span>
            </p>
          </div>
        </div>

        {/* 60-day progress bar */}
        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#1E2633] overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-200"
            style={{ width: `${summary.progressPct}%` }}
          />
        </div>

        {/* Always-on architecture guidance */}
        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          Cloud tip: Firestore keeps your 60-day ledger and remediation progress available from any device without running your laptop 24/7. Pair with a free GitHub Actions cron or Cloud Run Job to execute scheduled US/Crypto/India paper rebalances while offline.
        </p>
      </section>

      {/* Inline Log Paper Session Form */}
      {formOpen && (
        <section
          aria-label="Record Daily Paper Session"
          className="rounded-lg border border-blue-500/35 bg-white dark:bg-[#111620] p-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E2633] pb-3 mb-4">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Record Daily Paper Qualification Checkpoint
            </h3>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="qual-date"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Session Date (YYYY-MM-DD)
                </label>
                <input
                  id="qual-date"
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
                {errors.date && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.date}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="qual-day"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Day Number (1–60)
                </label>
                <input
                  id="qual-day"
                  type="number"
                  min="1"
                  max="365"
                  value={dayNumber}
                  onChange={(e) => setDayNumber(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
                {errors.dayNumber && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.dayNumber}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="qual-equity"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  End Equity ($)
                </label>
                <input
                  id="qual-equity"
                  type="number"
                  step="0.01"
                  value={equityUsd}
                  onChange={(e) => setEquityUsd(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
                {errors.equityUsd && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.equityUsd}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="qual-pnl"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Net Daily P&amp;L ($)
                </label>
                <input
                  id="qual-pnl"
                  type="number"
                  step="0.01"
                  value={dailyPnlUsd}
                  onChange={(e) => setDailyPnlUsd(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
                {errors.dailyPnlUsd && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.dailyPnlUsd}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="qual-sharpe"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Rolling Net Sharpe
                </label>
                <input
                  id="qual-sharpe"
                  type="number"
                  step="0.01"
                  value={netSharpe}
                  onChange={(e) => setNetSharpe(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="qual-dd"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Max Drawdown (%)
                </label>
                <input
                  id="qual-dd"
                  type="number"
                  step="0.1"
                  value={maxDrawdownPct}
                  onChange={(e) => setMaxDrawdownPct(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="qual-slippage"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Slippage &amp; Fees ($)
                </label>
                <input
                  id="qual-slippage"
                  type="number"
                  step="0.01"
                  value={slippageCostUsd}
                  onChange={(e) => setSlippageCostUsd(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="qual-trips"
                  className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Guard Trips
                </label>
                <input
                  id="qual-trips"
                  type="number"
                  min="0"
                  step="1"
                  value={guardTripsCount}
                  onChange={(e) => setGuardTripsCount(e.target.value)}
                  className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-1.5 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={allGuardsNominal}
                  onChange={(e) => setAllGuardsNominal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>All 4 sleeves passed fail-closed pre-flight invariants</span>
              </label>
            </div>

            <div>
              <label
                htmlFor="qual-notes"
                className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Session Notes (max 500 chars)
              </label>
              <input
                id="qual-notes"
                type="text"
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Execution latency, slippage anomalies, or sleeve rebalance notes..."
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
              {errors.notes && (
                <p className="mt-1 text-[11px] text-red-500">{errors.notes}</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-md border border-slate-300 dark:border-[#2A3446] px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2232]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Checkpoint'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Daily Checkpoints Table */}
      <section
        aria-label="Paper Qualification Daily Ledger"
        className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Daily Paper Qualification Ledger
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {entries.length} sessions recorded
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs">
            {summary.qualifiedForLive ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Qualified for Live Capital
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  Paper Qualification Active ({summary.targetDays - summary.nominalDays} days left)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1E2633] text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#0D1119]/60">
                <th className="py-2 pl-4 pr-2 font-medium">Date</th>
                <th className="py-2 px-2 text-right font-medium">Day</th>
                <th className="py-2 px-2 text-right font-medium">Equity</th>
                <th className="py-2 px-2 text-right font-medium">Net P&amp;L</th>
                <th className="py-2 px-2 text-right font-medium">Sharpe</th>
                <th className="py-2 px-2 text-right font-medium">Max DD</th>
                <th className="py-2 px-2 text-right font-medium">Friction</th>
                <th className="py-2 px-2 font-medium">Guards</th>
                <th className="py-2 px-2 font-medium">Notes</th>
                <th className="py-2 pl-2 pr-4 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#19212E] text-xs">
              {entries.map((entry) => (
                <tr
                  key={entry.entryId}
                  className="hover:bg-slate-50/80 dark:hover:bg-[#151C28] transition-colors"
                >
                  <td className="py-2.5 pl-4 pr-2 font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {entry.date}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    #{entry.dayNumber}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {formatCurrency(entry.equityUsd)}
                  </td>
                  <td
                    className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                      entry.dailyPnlUsd >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatSignedCurrency(entry.dailyPnlUsd)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {entry.netSharpe.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {entry.maxDrawdownPct.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    -{formatCurrency(entry.slippageCostUsd)}
                  </td>
                  <td className="py-2.5 px-2 whitespace-nowrap">
                    {entry.allGuardsNominal ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Nominal
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                        Tripped ({entry.guardTripsCount})
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                    {entry.notes || '—'}
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.entryId)}
                      aria-label={`Delete qualification session ${entry.date}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
