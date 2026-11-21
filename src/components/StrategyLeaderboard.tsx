import { useState } from 'react';
import type { StrategyRow, TournamentSleeve } from '../types/trading';

interface StrategyLeaderboardProps {
  strategies: StrategyRow[];
  sleeves: TournamentSleeve[];
  killSwitchEngaged: boolean;
}

export function StrategyLeaderboard({
  strategies,
  sleeves,
  killSwitchEngaged,
}: StrategyLeaderboardProps) {
  const [sortBy, setSortBy] = useState<'winRate' | 'sharpe'>('winRate');

  const sleeveMap = new Map(sleeves.map((s) => [s.code, s]));

  const sorted = [...strategies].sort((a, b) =>
    sortBy === 'winRate' ? b.winRate - a.winRate : b.sharpe - a.sharpe
  );

  return (
    <section
      aria-label="Strategy Win Rate Leaderboard"
      className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
          Strategy Leaderboard
        </h2>
        <div
          role="group"
          aria-label="Rank strategies by"
          className="inline-flex items-center rounded-md bg-slate-100 dark:bg-[#0D1119] p-0.5 border border-slate-200/80 dark:border-[#1E2633]"
        >
          <button
            type="button"
            onClick={() => setSortBy('winRate')}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
              sortBy === 'winRate'
                ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Win Rate
          </button>
          <button
            type="button"
            onClick={() => setSortBy('sharpe')}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
              sortBy === 'sharpe'
                ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Sharpe
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#1E2633] text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#0D1119]/60">
              <th className="py-2 pl-4 pr-2 font-medium">Strategy</th>
              <th className="py-2 px-2 font-medium">Sleeve</th>
              <th className="py-2 px-2 text-right font-medium">Win Rate</th>
              <th className="py-2 px-2 text-right font-medium">Sharpe</th>
              <th className="py-2 pl-2 pr-4 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#19212E] text-xs">
            {sorted.map((row, idx) => {
              const sleeve = sleeveMap.get(row.sleeveCode);
              const isTripped =
                killSwitchEngaged || sleeve?.guardReport?.status === 'TRIPPED';
              const live = Boolean(sleeve?.armed ?? true) && !isTripped;
              const statusText = isTripped
                ? 'Tripped'
                : live
                  ? row.status
                  : 'Paused';
              return (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/90 dark:hover:bg-[#151C28] transition-colors"
                >
                  <td className="py-2.5 pl-4 pr-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500">
                        {idx + 1}.
                      </span>
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {row.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {row.sleeveCode}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    {row.winRate.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {row.sharpe.toFixed(2)}
                  </td>
                  <td className="py-2.5 pl-2 pr-4 text-right whitespace-nowrap">
                    <span
                      className={`font-medium ${
                        live
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isTripped
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {statusText}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
