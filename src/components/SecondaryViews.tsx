import { useState } from 'react';
import { Search } from 'lucide-react';
import type {
  AuditLogEntry,
  FillRecord,
  RiskSettings,
  StrategyRow,
  TournamentSleeve,
  VenueRoute,
} from '../types/trading';
import { formatCurrency } from '../utils/portfolioEngine';

interface RecentFillsTableProps {
  fills: FillRecord[];
}

export function RecentFillsTable({ fills }: RecentFillsTableProps) {
  return (
    <section
      aria-label="Recent Execution Fills"
      className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
          Executed Fills Tape
        </h2>
        <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
          {fills.length} fills today
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#1E2633] text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#0D1119]/60">
              <th className="py-2 pl-4 pr-3 font-medium">Time</th>
              <th className="py-2 px-3 font-medium">Side / Symbol</th>
              <th className="py-2 px-3 text-right font-medium">Qty</th>
              <th className="py-2 px-3 text-right font-medium">Fill Price</th>
              <th className="py-2 px-3 font-medium">Route</th>
              <th className="py-2 px-3 font-medium">Sleeve</th>
              <th className="py-2 pl-3 pr-4 text-right font-medium">Slippage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#19212E] text-xs">
            {fills.map((fill) => (
              <tr
                key={fill.id}
                className="hover:bg-slate-50/90 dark:hover:bg-[#151C28] transition-colors"
              >
                <td className="py-2.5 pl-4 pr-3 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {fill.timestamp}
                </td>
                <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                  <span
                    className={`font-semibold mr-2 ${
                      fill.side === 'BUY'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {fill.side}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {fill.symbol}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  {fill.qty}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(fill.fillPrice)}
                </td>
                <td className="py-2.5 px-3 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  {fill.route}
                </td>
                <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {fill.sleeveName}
                </td>
                <td
                  className={`py-2.5 pl-3 pr-4 text-right font-mono tabular-nums whitespace-nowrap ${
                    fill.slippageBps <= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {fill.slippageBps > 0 ? `+${fill.slippageBps.toFixed(1)}` : fill.slippageBps.toFixed(1)} bps
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

interface StrategyAlphaChartProps {
  strategies: StrategyRow[];
}

export function StrategyAlphaChart({ strategies }: StrategyAlphaChartProps) {
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const colors = ['#10B981', '#3B82F6', '#F59E0B', '#94A3B8'];
  const width = 1000;
  const height = 240;
  const padLeft = 42;
  const padRight = 64;
  const padY = 24;

  const cumulativeSeries = strategies.map((s) => {
    let acc = 0;
    return s.monthlyReturns.map((r) => {
      acc += r;
      return Math.round(acc * 100) / 100;
    });
  });

  const allVals = cumulativeSeries.flat();
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(12, ...allVals);
  const span = maxVal - minVal || 1;

  const toX = (idx: number) =>
    padLeft + (idx / (months.length - 1)) * (width - padLeft - padRight);
  const toY = (val: number) =>
    height - padY - ((val - minVal) / span) * (height - padY * 2);

  return (
    <section
      aria-label="Six-Month Cumulative Strategy Return"
      className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            6-Month Cumulative Alpha Curve
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Net sleeve return contribution (%) across active tournament sleeves
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          {strategies.map((s, idx) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <span
                className="h-2 w-2 rounded-xs shrink-0"
                style={{ backgroundColor: colors[idx % colors.length] }}
                aria-hidden="true"
              />
              <span>{s.sleeveCode}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-60 min-w-[560px]"
          role="img"
          aria-label="Cumulative return line chart for four tournament strategies"
        >
          {[0, 4, 8, 12].map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-[#1E2633]"
                  strokeDasharray={tick === 0 ? undefined : '4 4'}
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 font-mono text-[11px]"
                >
                  {tick}%
                </text>
              </g>
            );
          })}

          {months.map((m, idx) => (
            <text
              key={m}
              x={toX(idx)}
              y={height - 4}
              textAnchor="middle"
              className="fill-slate-400 dark:fill-slate-500 font-mono text-[11px]"
            >
              {m}
            </text>
          ))}

          {cumulativeSeries.map((series, sIdx) => {
            const color = colors[sIdx % colors.length];
            const d = series
              .map((val, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(val).toFixed(1)}`)
              .join(' ');
            const lastVal = series[series.length - 1];
            const lastX = toX(series.length - 1);
            const lastY = toY(lastVal);
            return (
              <g key={strategies[sIdx].id}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={lastX} cy={lastY} r="3.5" fill={color} />
                <text
                  x={lastX + 8}
                  y={lastY + 4}
                  className="font-mono text-[11px] font-semibold"
                  fill={color}
                >
                  +{lastVal.toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

interface EngineLogsViewProps {
  logs: AuditLogEntry[];
  onClearLogs: () => void;
}

export function EngineLogsView({ logs, onClearLogs }: EngineLogsViewProps) {
  const [levelFilter, setLevelFilter] = useState<'ALL' | AuditLogEntry['level']>('ALL');
  const [query, setQuery] = useState('');

  const filtered = logs.filter((entry) => {
    if (levelFilter !== 'ALL' && entry.level !== levelFilter) return false;
    if (
      query.trim() &&
      !entry.message.toLowerCase().includes(query.trim().toLowerCase()) &&
      !entry.module.toLowerCase().includes(query.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <section
      aria-label="Execution Engine Logs"
      className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Execution &amp; Risk Audit Trail
          </h2>
          <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
            {filtered.length} events
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search logs..."
              aria-label="Search engine logs"
              className="w-44 rounded-md border border-slate-200 dark:border-[#242E40] bg-slate-50 dark:bg-[#0D1119] pl-8 pr-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div
            role="group"
            aria-label="Filter log level"
            className="inline-flex items-center rounded-md bg-slate-100 dark:bg-[#0D1119] p-0.5 border border-slate-200/80 dark:border-[#1E2633]"
          >
            {(['ALL', 'EXEC', 'RISK', 'WARN', 'INFO'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  levelFilter === lvl
                    ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {lvl === 'ALL' ? 'All' : lvl}
              </button>
            ))}
          </div>

          {logs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="rounded-md border border-slate-200 dark:border-[#242E40] px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#182030]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center space-y-1.5">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            No matching audit events
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            New order submissions, fills, sleeve toggles, and risk events appear here in real time.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-[#19212E] font-mono text-xs">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-1 sm:grid-cols-[84px_60px_110px_1fr] gap-2 px-4 py-2.5 hover:bg-slate-50/80 dark:hover:bg-[#151C28]"
            >
              <span className="tabular-nums text-slate-400 dark:text-slate-500">
                {entry.timestamp}
              </span>
              <span
                className={`font-semibold ${
                  entry.level === 'EXEC'
                    ? 'text-blue-600 dark:text-blue-400'
                    : entry.level === 'RISK'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : entry.level === 'WARN'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {entry.level}
              </span>
              <span className="text-slate-700 dark:text-slate-300 truncate">
                {entry.module}
              </span>
              <span className="font-sans text-slate-800 dark:text-slate-200">
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface SettingsViewProps {
  settings: RiskSettings;
  sleeves: TournamentSleeve[];
  darkMode: boolean;
  onUpdateSettings: (next: RiskSettings) => void;
  onToggleTheme: () => void;
}

export function SettingsView({
  settings,
  sleeves,
  darkMode,
  onUpdateSettings,
  onToggleTheme,
}: SettingsViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-5 space-y-5">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Risk Guardrails &amp; Order Routing
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Pre-trade checks enforced before any order reaches the execution router.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="setting-pdt-floor"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              FINRA 4210 PDT Equity Floor ($)
            </label>
            <input
              id="setting-pdt-floor"
              type="number"
              min="5000"
              step="1000"
              value={settings.pdtFloor}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  pdtFloor: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="setting-max-notional"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Max Single Order Notional ($)
            </label>
            <input
              id="setting-max-notional"
              type="number"
              min="1000"
              step="1000"
              value={settings.maxOrderNotional}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  maxOrderNotional: Math.max(1000, Number(e.target.value) || 1000),
                })
              }
              className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="setting-default-route"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Default Venue Route
            </label>
            <select
              id="setting-default-route"
              value={settings.defaultRoute}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  defaultRoute: e.target.value as VenueRoute,
                })
              }
              className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="SIP-DIRECT">SIP-DIRECT</option>
              <option value="SMART-DARK">SMART-DARK</option>
              <option value="ARCA">ARCA</option>
              <option value="BATS">BATS</option>
              <option value="IEX">IEX</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-5 space-y-5">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Execution Environment &amp; Appearance
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage paper/live routing flags, automatic beta hedging, and display contrast.
          </p>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-[#19212E]">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                Paper Execution Mode
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Routes simulated orders to Alpaca Paper (PA33BCWZ2NX8)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.paperMode}
              onClick={() =>
                onUpdateSettings({ ...settings, paperMode: !settings.paperMode })
              }
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                settings.paperMode
                  ? 'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'border-slate-300 dark:border-[#2A3446] text-slate-600 dark:text-slate-400'
              }`}
            >
              {settings.paperMode ? 'Paper' : 'Live'}
            </button>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                Auto-Hedge Delta Neutrality
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Offsets excess net exposure across {sleeves.length} active sleeves
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoHedgeEnabled}
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  autoHedgeEnabled: !settings.autoHedgeEnabled,
                })
              }
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                settings.autoHedgeEnabled
                  ? 'border-blue-500/40 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                  : 'border-slate-300 dark:border-[#2A3446] text-slate-600 dark:text-slate-400'
              }`}
            >
              {settings.autoHedgeEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                Interface Theme
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Switch between Obsidian Dark and Daylight Paper contrast
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              className="rounded-md border border-slate-300 dark:border-[#2A3446] px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#182030]"
            >
              {darkMode ? 'Obsidian Dark' : 'Daylight Paper'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
