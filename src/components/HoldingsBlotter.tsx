import { ArrowDownUp, RefreshCw, Search } from 'lucide-react';
import type {
  HoldingSortKey,
  HoldingWithPnl,
  SideFilter,
  SortDirection,
} from '../types/trading';
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
} from '../utils/portfolioEngine';

interface HoldingsBlotterProps {
  holdings: HoldingWithPnl[];
  totalCount: number;
  sideFilter: SideFilter;
  searchQuery: string;
  sortKey: HoldingSortKey;
  sortDirection: SortDirection;
  killSwitchEngaged: boolean;
  onChangeSideFilter: (filter: SideFilter) => void;
  onChangeSearch: (query: string) => void;
  onToggleSort: (key: HoldingSortKey) => void;
  onRefreshMarks: () => void;
  onOpenBracket: (holding: HoldingWithPnl) => void;
  onHedge: (holding: HoldingWithPnl) => void;
  onFlatten: (holding: HoldingWithPnl) => void;
  onOpenNewOrder: () => void;
}

export function HoldingsBlotter({
  holdings,
  totalCount,
  sideFilter,
  searchQuery,
  sortKey,
  sortDirection,
  killSwitchEngaged,
  onChangeSideFilter,
  onChangeSearch,
  onToggleSort,
  onRefreshMarks,
  onOpenBracket,
  onHedge,
  onFlatten,
  onOpenNewOrder,
}: HoldingsBlotterProps) {
  return (
    <section
      aria-label="Active Holdings Blotter"
      className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
    >
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Active Holdings Blotter
          </h2>
          <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {holdings.length} of {totalCount} positions
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search input */}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="Filter ticker..."
              aria-label="Filter holdings by ticker"
              className="w-32 sm:w-36 rounded-md border border-slate-200 dark:border-[#242E40] bg-slate-50 dark:bg-[#0D1119] pl-8 pr-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Interactive Side Filter Segmented Control */}
          <div
            role="group"
            aria-label="Filter by position side"
            className="inline-flex items-center rounded-md bg-slate-100 dark:bg-[#0D1119] p-0.5 border border-slate-200/80 dark:border-[#1E2633]"
          >
            {(['ALL', 'LONG', 'SHORT'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChangeSideFilter(option)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  sideFilter === option
                    ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {option === 'ALL' ? 'All' : option === 'LONG' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>

          {/* Sort Controls */}
          <div
            role="group"
            aria-label="Sort holdings"
            className="inline-flex items-center rounded-md bg-slate-100 dark:bg-[#0D1119] p-0.5 border border-slate-200/80 dark:border-[#1E2633]"
          >
            <button
              type="button"
              onClick={() => onToggleSort('pnlDollar')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                sortKey === 'pnlDollar'
                  ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span>P&amp;L $</span>
              {sortKey === 'pnlDollar' && (
                <ArrowDownUp className="h-3 w-3 opacity-70" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onToggleSort('ticker')}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                sortKey === 'ticker'
                  ? 'bg-white dark:bg-[#1B2434] text-slate-950 dark:text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span>Ticker</span>
              {sortKey === 'ticker' && (
                <ArrowDownUp className="h-3 w-3 opacity-70" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Refresh Marks */}
          <button
            type="button"
            onClick={onRefreshMarks}
            aria-label="Refresh live mark prices"
            title={`Refresh mark prices (sorted ${sortKey} ${sortDirection})`}
            className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-[#242E40] bg-white dark:bg-[#131924] p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1A2232] dark:hover:text-slate-100 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Table or Empty State */}
      {holdings.length === 0 ? (
        <div className="px-6 py-10 text-center space-y-2.5">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {totalCount === 0
              ? 'No open positions in the portfolio.'
              : 'No positions match the current filter.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {totalCount === 0
              ? 'Submit a new order to open a position or re-arm your tournament sleeves.'
              : 'Clear your ticker search or switch the side filter back to All.'}
          </p>
          <div className="pt-1">
            {totalCount === 0 ? (
              <button
                type="button"
                onClick={onOpenNewOrder}
                disabled={killSwitchEngaged}
                className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Place New Order
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onChangeSideFilter('ALL');
                  onChangeSearch('');
                }}
                className="rounded-md border border-slate-300 dark:border-[#2A3446] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#182030]"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1E2633] text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#0D1119]/60">
                <th className="py-2.5 pl-4 pr-3 font-medium">Symbol</th>
                <th className="py-2.5 px-3 font-medium">Side / Qty</th>
                <th className="py-2.5 px-3 text-right font-medium">Avg Fill</th>
                <th className="py-2.5 px-3 text-right font-medium">Mark</th>
                <th className="py-2.5 px-3 text-right font-medium">Unrealized P&amp;L</th>
                <th className="py-2.5 px-3 text-right font-medium">P&amp;L %</th>
                <th className="py-2.5 pl-3 pr-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#19212E] text-[13px]">
              {holdings.map((h) => {
                const isProfit = h.unrealizedPnl >= 0;
                const hasBrackets = h.stopLoss !== undefined || h.takeProfit !== undefined;
                return (
                  <tr
                    key={h.id}
                    className="hover:bg-slate-50/90 dark:hover:bg-[#151C28] transition-colors"
                  >
                    <td className="py-2.5 pl-4 pr-3 whitespace-nowrap">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-semibold text-slate-950 dark:text-white">
                          {h.symbol}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {h.assetClass}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
                        <span
                          className={`font-semibold ${
                            h.side === 'LONG'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {h.side}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {h.signedQty > 0 ? `+${h.signedQty}` : h.signedQty} shs
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatCurrency(h.fillPrice)}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatCurrency(h.markPrice)}
                    </td>

                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums text-xs font-semibold whitespace-nowrap ${
                        isProfit
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatSignedCurrency(h.unrealizedPnl)}
                    </td>

                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums text-xs font-medium whitespace-nowrap ${
                        isProfit
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatSignedPercent(h.pnlPercent)}
                    </td>

                    <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenBracket(h)}
                          aria-label={`Configure SL/TP for ${h.symbol}`}
                          className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                            hasBrackets
                              ? 'text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:bg-[#1B2434] dark:hover:bg-[#243045]'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1B2434] dark:hover:text-slate-100'
                          }`}
                        >
                          SL/TP
                        </button>
                        <button
                          type="button"
                          onClick={() => onHedge(h)}
                          disabled={killSwitchEngaged}
                          aria-label={`Hedge ${h.symbol} position`}
                          className="rounded px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 disabled:opacity-40 transition-colors whitespace-nowrap"
                        >
                          Hedge
                        </button>
                        <button
                          type="button"
                          onClick={() => onFlatten(h)}
                          disabled={killSwitchEngaged}
                          aria-label={`Flatten ${h.symbol} position`}
                          className="rounded px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 disabled:opacity-40 transition-colors whitespace-nowrap"
                        >
                          Flatten
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
