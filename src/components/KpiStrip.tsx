import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ComputedPortfolioMetrics, PortfolioSnapshot, RiskSettings } from '../types/trading';
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
} from '../utils/portfolioEngine';
import { IntradayEquitySparkline } from './IntradayEquitySparkline';

interface KpiStripProps {
  metrics: ComputedPortfolioMetrics;
  snapshot: PortfolioSnapshot;
  risk: RiskSettings;
}

export function KpiStrip({ metrics, snapshot, risk }: KpiStripProps) {
  const isPositiveDay = metrics.todayPnl >= 0;
  const pdtRatio = Math.min(
    100,
    Math.max(8, (risk.pdtFloor / Math.max(metrics.totalEquity, risk.pdtFloor)) * 100)
  );
  const marginBarWidth = Math.min(100, Math.max(2, metrics.marginUtilizedPct));

  return (
    <section aria-label="Account risk and portfolio metrics" className="space-y-3">
      {/* Unified FINRA 4210 PDT Capital Corridor Strip (replaces the two conflicting headers) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
            {metrics.pdtStatus === 'Safe' ? (
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            )}
            <span>PDT Capital Corridor</span>
          </span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
          <span className="text-slate-500 dark:text-slate-400">FINRA 4210</span>
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
          <span
            className={`font-medium ${
              metrics.pdtStatus === 'Safe'
                ? 'text-emerald-700 dark:text-emerald-400'
                : metrics.pdtStatus === 'Caution'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-red-700 dark:text-red-400'
            }`}
          >
            {metrics.pdtStatus} ({metrics.pdtTierLabel}, {formatSignedCurrency(metrics.pdtCushion)} cushion)
          </span>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Floor {formatCurrency(risk.pdtFloor)}
          </span>
          <div className="relative h-2 w-28 sm:w-36 rounded-full bg-slate-200 dark:bg-[#1E2633] overflow-hidden shrink-0">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                metrics.pdtStatus === 'Safe'
                  ? 'bg-emerald-500'
                  : metrics.pdtStatus === 'Caution'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(12, Math.round(100 - pdtRatio + 10)))}%`,
              }}
            />
            <span
              className="absolute top-0 bottom-0 w-0.5 bg-slate-900/50 dark:bg-white/70"
              style={{ left: `${Math.min(92, Math.max(8, Math.round(pdtRatio)))}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="font-mono tabular-nums text-[11px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
            Today{' '}
            <span
              className={
                isPositiveDay
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }
            >
              {formatSignedCurrency(metrics.todayPnl)} ({formatSignedPercent(metrics.todayPnlPct)})
            </span>
          </span>
        </div>
      </div>

      {/* 5-Column Institutional Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* 1. Total Equity */}
        <div className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Equity
            </span>
            <span
              className={`font-mono tabular-nums text-xs font-semibold ${
                isPositiveDay
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatSignedPercent(metrics.todayPnlPct)}
            </span>
          </div>
          <p className="font-mono tabular-nums text-[22px] font-semibold tracking-tight text-slate-950 dark:text-white leading-none">
            {formatCurrency(metrics.totalEquity)}
          </p>
          <div className="flex items-end justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Intraday delta
            </span>
            <IntradayEquitySparkline
              points={snapshot.intradayEquityCurve}
              positive={isPositiveDay}
            />
          </div>
        </div>

        {/* 2. Available Cash */}
        <div className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Available Cash
            </span>
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
              Reserved
            </span>
          </div>
          <p className="font-mono tabular-nums text-[22px] font-semibold tracking-tight text-slate-950 dark:text-white leading-none">
            {formatCurrency(metrics.availableCash)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Includes {formatCurrency(snapshot.shortProceedsReserved)} short proceeds
          </p>
        </div>

        {/* 3. Buying Power */}
        <div className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Buying Power
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {snapshot.dayTradeMultiplier}x Intraday
            </span>
          </div>
          <p className="font-mono tabular-nums text-[22px] font-semibold tracking-tight text-slate-950 dark:text-white leading-none">
            {formatCurrency(metrics.buyingPower)}
          </p>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Overnight BP</span>
            <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
              {formatCurrency(metrics.overnightBuyingPower)}
            </span>
          </div>
        </div>

        {/* 4. Margin Utilized */}
        <div className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Margin Utilized
            </span>
            <span
              className={`text-[11px] font-medium ${
                metrics.marginUtilizedPct < risk.maintenanceCallFloorPct
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {metrics.marginUtilizedPct < risk.maintenanceCallFloorPct ? 'Tier 1 Nominal' : 'Elevated'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-mono tabular-nums text-[22px] font-semibold tracking-tight text-slate-950 dark:text-white leading-none">
              {metrics.marginUtilizedPct.toFixed(1)}%
            </p>
            <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-[#1E2633] overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  metrics.marginUtilizedPct < risk.maintenanceCallFloorPct
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${marginBarWidth}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Maintenance floor</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              &gt; {risk.maintenanceCallFloorPct.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* 5. Execution Health */}
        <div className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] p-4 flex flex-col justify-between gap-3 sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Execution Health
            </span>
            <span className="font-mono tabular-nums text-[11px] text-emerald-600 dark:text-emerald-400">
              {snapshot.latencyMs}ms RTT
            </span>
          </div>
          <p className="font-mono tabular-nums text-[22px] font-semibold tracking-tight text-emerald-600 dark:text-emerald-400 leading-none">
            {snapshot.filledOrdersCount}/{snapshot.totalOrdersSubmitted} Filled
          </p>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">
              Dropped: {snapshot.droppedOrdersCount}
            </span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              {metrics.pacingPct.toFixed(0)}% pacing
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
