import { useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Cpu,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type {
  AutoEngineConfig,
  ConnectionMode,
  EngineExecutionMode,
  EngineStatusPayload,
} from '../types/trading';

interface AutoTradingEngineViewProps {
  status: EngineStatusPayload | null;
  connectionMode: ConnectionMode;
  killSwitchEngaged: boolean;
  approvalsPaused: boolean;
  isRunningManual: boolean;
  onUpdateConfig: (patch: Partial<AutoEngineConfig>) => Promise<void>;
  onRunCycle: (
    sleeve: 'all' | 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d'
  ) => Promise<void>;
  onNotify: (msg: string) => void;
}

const SLEEVE_LABELS: {
  id: 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d';
  code: string;
  label: string;
  schedule: string;
}[] = [
  { id: 'sleeve-b', code: 'Sleeve B', label: '24/7 Crypto 4h EMA 12/48', schedule: '24/7 Live' },
  { id: 'sleeve-a', code: 'Sleeve A', label: 'US Equities SMA20 / Drift', schedule: 'NYSE Open' },
  { id: 'sleeve-c', code: 'Sleeve C', label: 'Defined-Risk Options Gate', schedule: 'US Options' },
  { id: 'sleeve-d', code: 'Sleeve D', label: 'India NIFTY 50 (DhanHQ)', schedule: 'NSE IST' },
];

const GITHUB_DIRECT_YAML = `name: Titan Quant 24/7 Paper Engine (Zero Billing)

on:
  schedule:
    - cron: "5 */4 * * *"      # 24/7 Crypto 4h EMA 12/48
    - cron: "35 14,15 * * 1-5" # US Equities & Options open
    - cron: "5 4 * * 1-5"      # India NSE NIFTY 50 session
  workflow_dispatch:

jobs:
  run-trading-cycle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - run: npm ci
      - name: Run 4-Sleeve Fail-Closed Cycle
        env:
          APCA_API_KEY_ID: \${{ secrets.APCA_API_KEY_ID }}
          APCA_API_SECRET_KEY: \${{ secrets.APCA_API_SECRET_KEY }}
          APCA_API_BASE_URL: "https://paper-api.alpaca.markets"
          POLYGON_API_KEY: \${{ secrets.POLYGON_API_KEY }}
          DHAN_CLIENT_ID: \${{ secrets.DHAN_CLIENT_ID }}
          DHAN_ACCESS_TOKEN: \${{ secrets.DHAN_ACCESS_TOKEN }}
        run: npx tsx scripts/run-cycle.ts --sleeve=all --mode=live_paper --cap=2500
`;

const GITHUB_CRON_YAML = `name: Titan Quant 24/7 Cloud Loop

on:
  schedule:
    - cron: "5 */4 * * *"     # 24/7 Crypto 4h candle close
    - cron: "35 14,15 * * 1-5" # US Equities & Options open
    - cron: "5 4 * * 1-5"      # India NSE NIFTY 50 session
  workflow_dispatch:

jobs:
  trigger-engine:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Titan Quant Automated Cycle
        run: |
          curl --fail-with-body -sS -X POST "\${{ secrets.TITAN_APP_URL }}/api/engine/cron" \\
            -H "Authorization: Bearer \${{ secrets.ENGINE_CRON_SECRET }}" \\
            -H "Content-Type: application/json" \\
            -d '{"sleeve":"all","mode":"live_paper"}'
`;

function formatUtcShort(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function AutoTradingEngineView({
  status,
  connectionMode,
  killSwitchEngaged,
  approvalsPaused,
  isRunningManual,
  onUpdateConfig,
  onRunCycle,
  onNotify,
}: AutoTradingEngineViewProps) {
  const [copiedCron, setCopiedCron] = useState(false);
  const [cronTab, setCronTab] = useState<'direct' | 'webhook'>('direct');

  const config: AutoEngineConfig = status?.config ?? {
    enabled: false,
    executionMode: 'dry_run',
    intervalMinutes: 15,
    perSleeveAllocationPct: 5,
    maxTradeNotionalUsd: 2500,
    enabledSleeves: {
      'sleeve-a': true,
      'sleeve-b': true,
      'sleeve-c': true,
      'sleeve-d': true,
    },
  };

  const busy = isRunningManual || Boolean(status?.isRunningCycle);
  const signals = status?.latestSignals ?? [];
  const history = status?.runHistory ?? [];

  const activeCronYaml =
    cronTab === 'direct' ? GITHUB_DIRECT_YAML : GITHUB_CRON_YAML;

  const handleCopyCron = async () => {
    try {
      await navigator.clipboard.writeText(activeCronYaml);
      setCopiedCron(true);
      onNotify(
        cronTab === 'direct'
          ? 'Copied zero-billing GitHub Actions Direct Runner YAML.'
          : 'Copied Cloud Run Webhook Cron YAML to clipboard.'
      );
      window.setTimeout(() => setCopiedCron(false), 2200);
    } catch {
      onNotify('Clipboard unavailable — copy the YAML snippet manually.');
    }
  };

  const handleModeChange = (mode: EngineExecutionMode) => {
    void onUpdateConfig({ executionMode: mode });
  };

  return (
    <div className="space-y-4">
      {/* Header & Primary Control Strip */}
      <section
        aria-label="Automated Trading Engine Controls"
        className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Cpu
              className={`h-4 w-4 shrink-0 ${
                config.enabled
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-blue-600 dark:text-blue-400'
              }`}
              aria-hidden="true"
            />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Automated 4-Sleeve Execution Loop
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pulls real live market data (Alpaca 4h Crypto, Polygon Daily, Alpaca Options, DhanHQ), computes signals, enforces fail-closed guards, and routes Alpaca Paper orders.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Execution Mode Toggle */}
            <div
              role="group"
              aria-label="Execution mode"
              className="inline-flex items-center rounded-md border border-slate-200 dark:border-[#243045] bg-slate-100 dark:bg-[#0D1119] p-0.5"
            >
              <button
                type="button"
                onClick={() => handleModeChange('dry_run')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  config.executionMode === 'dry_run'
                    ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Dry-Run Signals
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('live_paper')}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  config.executionMode === 'live_paper'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Live Paper Orders
              </button>
            </div>

            {/* Start / Stop Background Auto-Loop */}
            <button
              type="button"
              disabled={killSwitchEngaged}
              onClick={() => void onUpdateConfig({ enabled: !config.enabled })}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-40 ${
                config.enabled
                  ? 'border-emerald-500/50 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-[#2A3446] dark:bg-[#131924] dark:text-slate-100 dark:hover:bg-[#1A2232]'
              }`}
            >
              {config.enabled ? (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Stop Auto-Loop</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Start Auto-Loop</span>
                </>
              )}
            </button>

            {/* Primary Immediate Run Button */}
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRunCycle('all')}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{busy ? 'Scanning Feeds...' : 'Run Cycle Now'}</span>
            </button>
          </div>
        </div>

        {/* Telemetry Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-[#1E2633] bg-slate-50/60 dark:bg-[#0D1119]/60 text-xs">
          <div className="px-4 py-2.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Loop Status</p>
            <p
              className={`mt-0.5 font-mono font-semibold ${
                killSwitchEngaged
                  ? 'text-red-600 dark:text-red-400'
                  : config.enabled
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {killSwitchEngaged
                ? 'HALTED (KILL)'
                : config.enabled
                  ? `ACTIVE (${config.intervalMinutes}m)`
                  : 'STANDBY (MANUAL)'}
            </p>
          </div>

          <div className="px-4 py-2.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Broker Target</p>
            <p className="mt-0.5 font-mono font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              {status?.paperEndpointVerified !== false ? (
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 text-red-500 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                {connectionMode === 'alpaca_paper' ? 'Alpaca Paper API' : 'Local Paper Engine'}
              </span>
            </p>
          </div>

          <div className="px-4 py-2.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Cycles / Orders</p>
            <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
              {status?.totalCyclesRun ?? 0} runs · {status?.totalOrdersSubmitted ?? 0} orders
            </p>
          </div>

          <div className="px-4 py-2.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Last Scan</p>
            <p className="mt-0.5 font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-300 truncate">
              {formatUtcShort(status?.lastRunAtUtc ?? null)}
            </p>
          </div>

          <div className="px-4 py-2.5 col-span-2 lg:col-span-1">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Next Auto Tick</p>
            <p className="mt-0.5 font-mono tabular-nums text-[11px] text-blue-600 dark:text-blue-400 truncate">
              {config.enabled ? formatUtcShort(status?.nextRunAtUtc ?? null) : 'Loop stopped'}
            </p>
          </div>
        </div>

        {/* Guard Warnings */}
        {(killSwitchEngaged || approvalsPaused || config.executionMode === 'live_paper') && (
          <div className="border-t border-slate-200 dark:border-[#1E2633] px-4 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2 bg-slate-50/40 dark:bg-[#0E131D]">
            {killSwitchEngaged ? (
              <span className="font-semibold text-red-600 dark:text-red-400">
                Global Kill Switch is active — automated order routing is hard-blocked until reset.
              </span>
            ) : approvalsPaused ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Approvals are paused in TopBar — signals will scan live data, but order execution is blocked.
              </span>
            ) : (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Live Paper Orders armed: BUY/SELL signals that pass all fail-closed invariants will submit real market orders to your Alpaca Paper account (capped at ${config.maxTradeNotionalUsd.toLocaleString()}/order).
              </span>
            )}
          </div>
        )}

        {/* Loop Parameters & Per-Sleeve Enable Matrix */}
        <div className="border-t border-slate-200 dark:border-[#1E2633] px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          <div className="lg:col-span-5 grid grid-cols-3 gap-2.5">
            <label className="block">
              <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Cycle Interval
              </span>
              <select
                aria-label="Cycle interval"
                value={config.intervalMinutes}
                onChange={(e) =>
                  void onUpdateConfig({ intervalMinutes: Number(e.target.value) })
                }
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0D1119] px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              >
                <option value={5}>Every 5 min</option>
                <option value={15}>Every 15 min</option>
                <option value={60}>Every 1 hr</option>
                <option value={240}>Every 4 hr</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Target Weight %
              </span>
              <select
                aria-label="Target weight per symbol"
                value={config.perSleeveAllocationPct}
                onChange={(e) =>
                  void onUpdateConfig({
                    perSleeveAllocationPct: Number(e.target.value),
                  })
                }
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0D1119] px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              >
                <option value={2}>2% Equity</option>
                <option value={5}>5% Equity</option>
                <option value={10}>10% Equity</option>
                <option value={15}>15% Equity</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Max Order Cap
              </span>
              <select
                aria-label="Max trade notional cap"
                value={config.maxTradeNotionalUsd}
                onChange={(e) =>
                  void onUpdateConfig({
                    maxTradeNotionalUsd: Number(e.target.value),
                  })
                }
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0D1119] px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
              >
                <option value={500}>$500</option>
                <option value={1000}>$1,000</option>
                <option value={2500}>$2,500</option>
                <option value={5000}>$5,000</option>
                <option value={10000}>$10,000</option>
              </select>
            </label>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 gap-2">
            {SLEEVE_LABELS.map((s) => {
              const checked = config.enabledSleeves[s.id];
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-[#243045] bg-slate-50 dark:bg-[#0D1119] px-2.5 py-1.5 text-[11px]"
                >
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        void onUpdateConfig({
                          enabledSleeves: {
                            ...config.enabledSleeves,
                            [s.id]: !checked,
                          },
                        })
                      }
                      className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {s.code}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 truncate">
                      {s.schedule}
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !checked}
                    aria-label={`Run ${s.code} scan now`}
                    onClick={() => void onRunCycle(s.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/15 disabled:opacity-40 shrink-0"
                  >
                    Run
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live Signal Matrix */}
      <section
        aria-label="Live Strategy Signal Matrix"
        className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Live Market Data &amp; Signal Matrix
            </h3>
          </div>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {signals.length > 0
              ? `${signals.length} instruments evaluated`
              : 'Click "Run Cycle Now" to pull live bars and compute signals'}
          </span>
        </div>

        {signals.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No live scan executed in this session yet.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Click <strong className="text-slate-700 dark:text-slate-200">Run Cycle Now</strong> above to fetch live 4-hour Alpaca crypto candles (BTC/USD, ETH/USD, SOL/USD), Polygon US equity bars, Alpaca Options quotes, and DhanHQ balances.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1E2633] bg-slate-50/70 dark:bg-[#0D1119]/60 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pl-4 pr-2 font-medium">Instrument</th>
                  <th className="py-2 px-2 font-medium">Live Feed</th>
                  <th className="py-2 px-2 text-right font-medium">Last Px</th>
                  <th className="py-2 px-2 font-medium">Quantitative Signal</th>
                  <th className="py-2 px-2 text-right font-medium">Decision</th>
                  <th className="py-2 pl-2 pr-4 font-medium">Guard / Execution Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#19212E]">
                {signals.map((sig) => {
                  const actionColor =
                    sig.action === 'BUY'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : sig.action === 'SELL'
                        ? 'text-red-600 dark:text-red-400'
                        : sig.action === 'BLOCKED'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-400';

                  return (
                    <tr
                      key={`${sig.sleeveId}-${sig.symbol}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-[#151C28]"
                    >
                      <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {sig.symbol}
                        </span>
                        <span className="ml-2 text-[11px] text-blue-600 dark:text-blue-400 font-mono">
                          {sig.sleeveCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        <div>{sig.dataSource}</div>
                        <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          {sig.barCount} bars
                          {sig.barSpacingMinutes ? ` · ${sig.barSpacingMinutes}m` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {sig.lastPrice !== null
                          ? sig.sleeveId === 'sleeve-d'
                            ? `₹${Math.round(sig.lastPrice).toLocaleString('en-IN')}`
                            : `$${sig.lastPrice.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {sig.indicatorLabel}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {sig.indicatorSummary}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <div className={`font-mono font-bold ${actionColor}`}>
                          {sig.action}
                        </div>
                        {sig.orderQty > 0 && (
                          <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {sig.orderQty} (~${sig.targetNotionalUsd.toFixed(0)})
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-[11px] text-slate-600 dark:text-slate-300 max-w-md">
                        {sig.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Automated Execution Run Log + 24/7 Cloud Cron */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <section
          aria-label="Automated Trade Execution History"
          className="xl:col-span-8 rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Cycle Execution Log
            </h3>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {history.length} recent evaluations
            </span>
          </div>

          {history.length === 0 ? (
            <div className="px-4 py-6 text-xs text-slate-500 dark:text-slate-400">
              No automated cycle records yet. Run a scan or start the Auto-Loop to populate audit records.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-[#0D1119]">
                  <tr className="border-b border-slate-200 dark:border-[#1E2633] text-[11px] text-slate-500 dark:text-slate-400">
                    <th className="py-2 pl-4 pr-2 font-medium">Time (UTC)</th>
                    <th className="py-2 px-2 font-medium">Trigger</th>
                    <th className="py-2 px-2 font-medium">Symbol</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 pl-2 pr-4 font-medium">Execution Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#19212E]">
                  {history.slice(0, 30).map((row) => {
                    const statusTone =
                      row.status === 'SUBMITTED'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : row.status === 'DRY_RUN'
                          ? 'text-blue-600 dark:text-blue-400'
                          : row.status === 'BLOCKED' || row.status === 'ERROR'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400';

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-[#151C28]">
                        <td className="py-2 pl-4 pr-2 font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {row.timestampUtc.slice(11, 19)}
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {row.trigger}
                        </td>
                        <td className="py-2 px-2 font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {row.symbol}
                        </td>
                        <td className={`py-2 px-2 font-mono font-semibold whitespace-nowrap ${statusTone}`}>
                          {row.status}
                        </td>
                        <td className="py-2 pl-2 pr-4 text-[11px] text-slate-600 dark:text-slate-300">
                          {row.detail}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 24/7 Cloud Cron Webhook Card */}
        <section
          aria-label="24/7 Cloud Cron Trigger"
          className="xl:col-span-4 rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                24/7 Always-On Cloud Cron
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyCron()}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#131924] px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A2232]"
            >
              {copiedCron ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  <span>Copy YAML</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 space-y-3 text-xs">
            <div
              role="tablist"
              aria-label="24/7 deployment method"
              className="grid grid-cols-2 rounded-md border border-slate-200 dark:border-[#243045] bg-slate-100 dark:bg-[#0D1119] p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={cronTab === 'direct'}
                onClick={() => setCronTab('direct')}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  cronTab === 'direct'
                    ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                GitHub Direct ($0 · No Card)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cronTab === 'webhook'}
                onClick={() => setCronTab('webhook')}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  cronTab === 'webhook'
                    ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Cloud Run Webhook
              </button>
            </div>

            {cronTab === 'direct' ? (
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                <strong className="text-emerald-600 dark:text-emerald-400">Zero Google Cloud billing required:</strong> push this repo to GitHub and add your Alpaca/Polygon/Dhan keys under GitHub <strong className="text-slate-800 dark:text-slate-200">Settings → Secrets → Actions</strong>. The workflow is already included at <code className="font-mono text-[11px] text-blue-600 dark:text-blue-400">.github/workflows/titan-24-7-engine.yml</code>.
              </p>
            ) : (
              <>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  For Cloud Run / Render hosted URLs, set <code className="font-mono text-[11px] text-blue-600 dark:text-blue-400">ENGINE_CRON_SECRET</code> in server secrets and trigger <code className="font-mono text-[11px] text-blue-600 dark:text-blue-400">POST /api/engine/cron</code>:
                </p>
                <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-[#1E2633] bg-slate-50 dark:bg-[#0D1119] px-3 py-2 text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Cron Secret Gate</span>
                  <span
                    className={`font-mono font-semibold ${
                      status?.cronSecretConfigured
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {status?.cronSecretConfigured ? 'Configured (Bearer Active)' : 'Not Set (Fail-Closed 503)'}
                  </span>
                </div>
              </>
            )}

            <pre className="rounded-md border border-slate-200 dark:border-[#1E2633] bg-slate-950 text-slate-200 p-3 text-[11px] font-mono overflow-x-auto leading-relaxed">
              <code>{activeCronYaml}</code>
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
