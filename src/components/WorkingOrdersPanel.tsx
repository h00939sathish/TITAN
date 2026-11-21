import { Plus } from 'lucide-react';
import type { WorkingOrder } from '../types/trading';
import { formatCurrency } from '../utils/portfolioEngine';

interface WorkingOrdersPanelProps {
  orders: WorkingOrder[];
  killSwitchEngaged: boolean;
  onModifyOrder: (order: WorkingOrder) => void;
  onCancelOrder: (order: WorkingOrder) => void;
  onCancelAll: () => void;
  onOpenNewOrder: () => void;
}

export function WorkingOrdersPanel({
  orders,
  killSwitchEngaged,
  onModifyOrder,
  onCancelOrder,
  onCancelAll,
  onOpenNewOrder,
}: WorkingOrdersPanelProps) {
  return (
    <section
      aria-label="Active Working Orders Queue"
      className="rounded-lg border border-slate-200 dark:border-[#1E2633] bg-white dark:bg-[#111620] overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-[#1E2633] px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Working Orders Queue
          </h2>
          <span
            data-testid="working-orders-count"
            className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
          >
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} active
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenNewOrder}
            disabled={killSwitchEngaged}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-[#242E40] bg-slate-50 dark:bg-[#151C28] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1C2536] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Stage Order</span>
          </button>

          {orders.length > 0 && (
            <button
              type="button"
              onClick={onCancelAll}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors whitespace-nowrap"
            >
              Cancel All
            </button>
          )}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="px-4 py-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            No active working orders
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All staged limit orders have been filled or canceled.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#1E2633] text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-[#0D1119]/60">
                <th className="py-2 pl-4 pr-3 font-medium">Order</th>
                <th className="py-2 px-3 font-medium">Type / TIF</th>
                <th className="py-2 px-3 font-medium">Route</th>
                <th className="py-2 px-3 text-right font-medium">Notional</th>
                <th className="py-2 px-3 text-right font-medium">Time</th>
                <th className="py-2 pl-3 pr-4 text-right font-medium">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#19212E] text-xs">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-slate-50/90 dark:hover:bg-[#151C28] transition-colors"
                >
                  <td className="py-2.5 pl-4 pr-3 whitespace-nowrap font-mono tabular-nums">
                    <span
                      className={`font-semibold mr-2 ${
                        order.side === 'BUY'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {order.side}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {order.qty} {order.symbol}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                      @ {formatCurrency(order.limitPrice)}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                    {order.orderType} / {order.tif}
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap font-mono text-blue-600 dark:text-blue-400">
                    {order.route}
                  </td>

                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {formatCurrency(order.qty * order.limitPrice)}
                  </td>

                  <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {order.timestamp}
                  </td>

                  <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onModifyOrder(order)}
                        aria-label={`Modify ${order.symbol} order`}
                        className="rounded px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-200 dark:bg-[#1B2434] dark:hover:bg-[#243045] transition-colors whitespace-nowrap"
                      >
                        Modify
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancelOrder(order)}
                        aria-label={`Cancel ${order.symbol} order`}
                        className="rounded px-2 py-1 text-[11px] font-medium text-red-700 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
