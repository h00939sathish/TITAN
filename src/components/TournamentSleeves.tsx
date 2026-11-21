import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { TournamentSleeve } from '../types/trading';

interface TournamentSleevesProps {
  sleeves: TournamentSleeve[];
  killSwitchEngaged: boolean;
  detailed?: boolean;
  onToggleSleeve: (sleeveId: string) => void;
  onToggleFaultTest?: (sleeveId: string) => void;
  onRunPreflight?: () => void;
}

export function TournamentSleeves({
  sleeves,
  killSwitchEngaged,
  detailed = false,
  onToggleSleeve,
  onToggleFaultTest,
  onRunPreflight,
}: TournamentSleevesProps) {
  const activeReadyCount = sleeves.filter(
    (s) =>
      s.armed &&
      !killSwitchEngaged &&
      (s.guardReport ? s.guardReport.canExecute : true)
  ).length;
  const trippedCount = sleeves.filter(
    (s) => s.guardReport?.status === 'TRIPPED'
  ).length;

  return (
    <section
      aria-label="Alpha Tournament Sleeves"
      className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Alpha Tournament Sleeves
          </h2>
          {trippedCount > 0 && (
            <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
              {trippedCount} guard tripped
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {detailed && onRunPreflight && (
            <button
              type="button"
              onClick={onRunPreflight}
              className="rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#131924] px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A2232] transition-colors whitespace-nowrap"
            >
              Run Pre-Flight
            </button>
          )}
          <span className="font-mono tabular-nums text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
            {activeReadyCount} / {sleeves.length} Armed
          </span>
        </div>
      </div>

      {/* Flat single-elevation rows separated by crisp hairlines */}
      <div className="divide-y divide-slate-100 dark:divide-[#19212E]">
        {sleeves.map((sleeve) => {
          const guardStatus = sleeve.guardReport?.status ?? (sleeve.armed ? 'NOMINAL' : 'PAUSED');
          const isTripped = guardStatus === 'TRIPPED';
          const isArmed = sleeve.armed && !killSwitchEngaged && !isTripped;

          return (
            <div
              key={sleeve.id}
              data-testid={`sleeve-row-${sleeve.id}`}
              className={`px-4 py-3.5 transition-colors ${
                isTripped
                  ? 'bg-amber-50/50 dark:bg-amber-500/5'
                  : isArmed
                    ? 'hover:bg-slate-50/80 dark:hover:bg-[#151C28]'
                    : 'opacity-70 bg-slate-50/40 dark:bg-[#0D1119]/50'
              }`}
            >
              {/* Row 1: Sleeve Code & Full Title + Win Rate + Toggle */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
                      {sleeve.code}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                    <span className="text-slate-500 dark:text-slate-400 truncate">
                      {sleeve.strategy}
                    </span>
                  </div>
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5 leading-snug">
                    {sleeve.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                  <div className="text-right">
                    <p
                      className={`font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
                        sleeve.isTopWinRate
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {sleeve.winRate.toFixed(1)}% win
                    </p>
                    <p
                      className={`font-mono tabular-nums text-[11px] whitespace-nowrap ${
                        sleeve.dayPositive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {sleeve.dayPerformance}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isArmed}
                    disabled={killSwitchEngaged || isTripped}
                    aria-label={`${isArmed ? 'Pause' : 'Arm'} ${sleeve.code}: ${sleeve.name}`}
                    onClick={() => onToggleSleeve(sleeve.id)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap disabled:opacity-60 ${
                      isTripped
                        ? 'border-amber-500/45 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 cursor-not-allowed'
                        : isArmed
                          ? 'border-emerald-500/35 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-[#2A3446] dark:bg-[#131924] dark:text-slate-400 dark:hover:bg-[#1A2232]'
                    }`}
                  >
                    {isTripped ? 'Tripped' : isArmed ? 'Armed' : 'Paused'}
                  </button>
                </div>
              </div>

              {/* Row 2: Unboxed Key Metrics with Typographic Separators */}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  {sleeve.primaryMetricLabel}{' '}
                  <strong className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                    {sleeve.primaryMetricValue}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {sleeve.secondaryMetricLabel}{' '}
                  <strong className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                    {sleeve.secondaryMetricValue}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Budget{' '}
                  <strong className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                    {sleeve.budgetLabel}
                  </strong>
                </span>
              </div>

              {/* Row 3: Fail-Closed Guard Line */}
              {sleeve.guardReport && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      isTripped
                        ? 'font-medium text-amber-700 dark:text-amber-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {isTripped ? (
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                    )}
                    <span>{sleeve.guardReport.summary}</span>
                  </span>

                  {detailed && onToggleFaultTest && (
                    <button
                      type="button"
                      onClick={() => onToggleFaultTest(sleeve.id)}
                      aria-label={`${sleeve.faultSimulated ? 'Clear fault on' : 'Simulate fail-closed fault on'} ${sleeve.code}`}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        sleeve.faultSimulated
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#1B2434] dark:text-slate-300 dark:hover:bg-[#243045]'
                      }`}
                    >
                      {sleeve.faultSimulated ? 'Clear Fault' : 'Simulate Fault'}
                    </button>
                  )}
                </div>
              )}

              {/* Detailed per-check invariant breakdown in Alpha Tournament view */}
              {detailed && sleeve.guardReport && (
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 border-t border-slate-100 dark:border-[#1E2633]">
                  {sleeve.guardReport.checks.map((chk) => (
                    <div key={chk.id} className="text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {chk.label}
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            chk.passed
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {chk.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        {chk.detail}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Progress Hairline */}
              <div className="mt-2.5 h-1 w-full rounded-full bg-slate-100 dark:bg-[#1B2230] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    isTripped
                      ? 'bg-amber-500'
                      : !isArmed
                        ? 'bg-slate-400 dark:bg-slate-600'
                        : sleeve.accentTone === 'emerald'
                          ? 'bg-emerald-500'
                          : sleeve.accentTone === 'blue'
                            ? 'bg-blue-500'
                            : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.round(sleeve.progressRatio * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
