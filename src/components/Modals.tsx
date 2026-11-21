import { useState, type FormEvent } from 'react';
import { OctagonAlert, X } from 'lucide-react';
import type {
  HoldingWithPnl,
  OrderSide,
  TimeInForce,
  VenueRoute,
  WorkingOrder,
} from '../types/trading';
import {
  formatCurrency,
  validateBracketInput,
  validateOrderInput,
} from '../utils/portfolioEngine';

interface NewOrderModalProps {
  defaultRoute: VenueRoute;
  maxOrderNotional: number;
  onClose: () => void;
  onSubmitOrder: (payload: {
    symbol: string;
    side: OrderSide;
    qty: number;
    limitPrice: number;
    tif: TimeInForce;
    route: VenueRoute;
  }) => void;
}

export function NewOrderModal({
  defaultRoute,
  maxOrderNotional,
  onClose,
  onSubmitOrder,
}: NewOrderModalProps) {
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<OrderSide>('BUY');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [tif, setTif] = useState<TimeInForce>('DAY');
  const [route, setRoute] = useState<VenueRoute>(defaultRoute);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const estimatedNotional =
    Number(qty) > 0 && Number(limitPrice) > 0
      ? Number(qty) * Number(limitPrice)
      : 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const check = validateOrderInput(
      { symbol, side, qty, limitPrice },
      maxOrderNotional
    );
    if (!check.valid || !check.parsed) {
      setErrors(check.errors as Record<string, string>);
      return;
    }
    onSubmitOrder({
      ...check.parsed,
      tif,
      route,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-[#242E40] bg-white dark:bg-[#111620] shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E2633] px-5 py-3.5">
          <h2
            id="new-order-title"
            className="font-display text-sm font-semibold text-slate-900 dark:text-white"
          >
            Stage Limit Order
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new order dialog"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#1A2232] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4">
          {/* Side segmented toggle */}
          <div className="grid grid-cols-2 gap-1.5 rounded-md bg-slate-100 dark:bg-[#0B0E14] p-1 border border-slate-200 dark:border-[#1E2633]">
            {(['BUY', 'SELL'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                className={`rounded py-1.5 text-xs font-semibold transition-colors ${
                  side === option
                    ? option === 'BUY'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-red-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {option === 'BUY' ? 'Buy' : 'Sell Short / Exit'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="order-symbol"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Ticker Symbol
              </label>
              <input
                id="order-symbol"
                type="text"
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value.toUpperCase());
                  setErrors((prev) => ({ ...prev, symbol: '' }));
                }}
                placeholder="e.g. NVDA"
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
              {errors.symbol && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {errors.symbol}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="order-qty"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Quantity (Shares)
              </label>
              <input
                id="order-qty"
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setErrors((prev) => ({ ...prev, qty: '', notional: '' }));
                }}
                placeholder="e.g. 25"
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
              {errors.qty && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {errors.qty}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="order-limit"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Limit Price ($)
              </label>
              <input
                id="order-limit"
                type="number"
                min="0.01"
                step="0.01"
                value={limitPrice}
                onChange={(e) => {
                  setLimitPrice(e.target.value);
                  setErrors((prev) => ({ ...prev, limitPrice: '', notional: '' }));
                }}
                placeholder="135.50"
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
              {errors.limitPrice && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                  {errors.limitPrice}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="order-tif"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Time in Force
              </label>
              <select
                id="order-tif"
                value={tif}
                onChange={(e) => setTif(e.target.value as TimeInForce)}
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-2 font-mono text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="DAY">DAY</option>
                <option value="GTC">GTC</option>
                <option value="IOC">IOC</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="order-route"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Route
              </label>
              <select
                id="order-route"
                value={route}
                onChange={(e) => setRoute(e.target.value as VenueRoute)}
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-2.5 py-2 font-mono text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="SIP-DIRECT">SIP-DIRECT</option>
                <option value="SMART-DARK">SMART-DARK</option>
                <option value="ARCA">ARCA</option>
                <option value="BATS">BATS</option>
                <option value="IEX">IEX</option>
              </select>
            </div>
          </div>

          {errors.notional && (
            <p className="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {errors.notional}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 dark:border-[#1E2633] pt-3 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Estimated Notional (Limit {formatCurrency(maxOrderNotional)})
            </span>
            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
              {formatCurrency(estimatedNotional)}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 dark:border-[#2A3446] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2232]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Submit Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ModifyOrderModalProps {
  order: WorkingOrder;
  maxOrderNotional: number;
  onClose: () => void;
  onSave: (orderId: string, qty: number, limitPrice: number) => void;
}

export function ModifyOrderModal({
  order,
  maxOrderNotional,
  onClose,
  onSave,
}: ModifyOrderModalProps) {
  const [qty, setQty] = useState(String(order.qty));
  const [limitPrice, setLimitPrice] = useState(order.limitPrice.toFixed(2));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = validateOrderInput(
      { symbol: order.symbol, side: order.side, qty, limitPrice },
      maxOrderNotional
    );
    if (!res.valid || !res.parsed) {
      setError(
        res.errors.qty ||
          res.errors.limitPrice ||
          res.errors.notional ||
          'Check order parameters.'
      );
      return;
    }
    onSave(order.id, res.parsed.qty, res.parsed.limitPrice);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modify-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-[#242E40] bg-white dark:bg-[#111620] shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E2633] px-5 py-3.5">
          <h2
            id="modify-order-title"
            className="font-display text-sm font-semibold text-slate-900 dark:text-white"
          >
            Modify {order.side} {order.symbol}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modify order dialog"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#1A2232]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="mod-qty"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Quantity
              </label>
              <input
                id="mod-qty"
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="mod-price"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Limit Price ($)
              </label>
              <input
                id="mod-price"
                type="number"
                min="0.01"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 dark:border-[#2A3446] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2232]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Update Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface BracketModalProps {
  holding: HoldingWithPnl;
  onClose: () => void;
  onSave: (holdingId: string, stopLoss?: number, takeProfit?: number) => void;
}

export function BracketModal({ holding, onClose, onSave }: BracketModalProps) {
  const [stopLoss, setStopLoss] = useState(
    holding.stopLoss !== undefined ? holding.stopLoss.toFixed(2) : ''
  );
  const [takeProfit, setTakeProfit] = useState(
    holding.takeProfit !== undefined ? holding.takeProfit.toFixed(2) : ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const check = validateBracketInput(
      stopLoss,
      takeProfit,
      holding.side,
      holding.markPrice
    );
    if (!check.valid) {
      setError(check.error ?? 'Invalid bracket levels.');
      return;
    }
    onSave(holding.id, check.stopLoss, check.takeProfit);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bracket-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-[#242E40] bg-white dark:bg-[#111620] shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1E2633] px-5 py-3.5">
          <h2
            id="bracket-title"
            className="font-display text-sm font-semibold text-slate-900 dark:text-white"
          >
            Risk Bracket · {holding.symbol} ({holding.side})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close SL/TP dialog"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#1A2232]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Current Mark Price</span>
            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
              {formatCurrency(holding.markPrice)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="bracket-sl"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Stop Loss ($)
              </label>
              <input
                id="bracket-sl"
                type="number"
                step="0.01"
                value={stopLoss}
                onChange={(e) => {
                  setStopLoss(e.target.value);
                  setError(null);
                }}
                placeholder="Optional"
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="bracket-tp"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Take Profit ($)
              </label>
              <input
                id="bracket-tp"
                type="number"
                step="0.01"
                value={takeProfit}
                onChange={(e) => {
                  setTakeProfit(e.target.value);
                  setError(null);
                }}
                placeholder="Optional"
                className="w-full rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#0B0E14] px-3 py-2 font-mono tabular-nums text-xs text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 dark:border-[#2A3446] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1A2232]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Save Bracket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface KillSwitchModalProps {
  killSwitchEngaged: boolean;
  holdingsCount: number;
  workingOrdersCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function KillSwitchModal({
  killSwitchEngaged,
  holdingsCount,
  workingOrdersCount,
  onClose,
  onConfirm,
}: KillSwitchModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kill-switch-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-md rounded-lg border border-red-300 dark:border-red-500/40 bg-white dark:bg-[#111620] shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 dark:border-[#1E2633] px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
            <OctagonAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="kill-switch-title"
              className="font-display text-sm font-semibold text-slate-950 dark:text-white"
            >
              {killSwitchEngaged
                ? 'Reset Emergency Trading Halt'
                : 'Confirm Emergency Kill Switch'}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {killSwitchEngaged
                ? 'Re-enables order entry and allows sleeves to be re-armed manually. Previously canceled orders are not restored.'
                : `Immediately cancels all ${workingOrdersCount} working orders, disarms all tournament sleeves, and flattens ${holdingsCount} open positions at current mark prices.`}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 dark:bg-[#0D1119] rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 dark:border-[#2A3446] bg-white dark:bg-[#131924] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A2232]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`rounded-md px-4 py-2 text-xs font-semibold text-white transition-colors ${
              killSwitchEngaged
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {killSwitchEngaged ? 'Resume Trading System' : 'Execute Kill Switch'}
          </button>
        </div>
      </div>
    </div>
  );
}
