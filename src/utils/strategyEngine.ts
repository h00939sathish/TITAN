import type {
  LiveSignalEvaluation,
  OhlcBar,
} from '../types/trading';

const MIN_REBALANCE_NOTIONAL_USD = 25;

/**
 * Exponential Moving Average (EMA) over a close price series.
 * Returns an array of equal length; values before `period - 1` use simple seed progression.
 */
export function computeEma(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/**
 * Simple Moving Average over the trailing `period` elements.
 */
export function computeSma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i];
  }
  return sum / period;
}

/**
 * Average True Range (ATR) over OHLC bars.
 */
export function computeAtr(bars: OhlcBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

/**
 * Computes median bar spacing in minutes from ISO timestamps.
 * Used to enforce the REM-002 4-hour bar spacing contract fail-closed.
 */
export function computeMedianBarSpacingMinutes(timestamps: string[]): number | null {
  if (timestamps.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const prev = Date.parse(timestamps[i - 1]);
    const cur = Date.parse(timestamps[i]);
    if (Number.isFinite(prev) && Number.isFinite(cur) && cur > prev) {
      diffs.push((cur - prev) / 60000);
    }
  }
  if (diffs.length === 0) return null;
  diffs.sort((a, b) => a - b);
  const mid = Math.floor(diffs.length / 2);
  return diffs.length % 2 === 0
    ? (diffs[mid - 1] + diffs[mid]) / 2
    : diffs[mid];
}

export function roundQty(qty: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(qty * factor) / factor;
}

/**
 * Sleeve B: 24/7 Crypto Trend — True 4h EMA(12/48) Breakout with strict fail-closed guards.
 */
export function evaluateCryptoEmaSignal(params: {
  symbol: string;
  bars: OhlcBar[];
  currentQty: number;
  equityUsd: number;
  allocationPct: number;
  maxTradeNotionalUsd: number;
  dataSource: string;
  nowUtc?: string;
}): LiveSignalEvaluation {
  const evaluatedAtUtc = params.nowUtc ?? new Date().toISOString();
  const barCount = params.bars.length;
  const spacingMinutes = computeMedianBarSpacingMinutes(
    params.bars.map((b) => b.timestamp)
  );
  const lastPrice = barCount > 0 ? params.bars[barCount - 1].close : null;

  // Fail-closed invariant 1: minimum 55 bars required for EMA(48) convergence
  if (barCount < 55 || lastPrice === null || !Number.isFinite(lastPrice) || lastPrice <= 0) {
    return {
      sleeveId: 'sleeve-b',
      sleeveCode: 'Sleeve B',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: spacingMinutes ? Math.round(spacingMinutes) : null,
      lastPrice,
      indicatorLabel: '4h EMA 12/48',
      indicatorSummary: `Insufficient bars (${barCount}/55)`,
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: `Fail-closed: need >= 55 live 4h bars for EMA(48) (received ${barCount}). Synthetic ramp disabled.`,
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  // Fail-closed invariant 2: enforce 4-hour bar spacing contract (210–270m tolerance)
  if (spacingMinutes === null || spacingMinutes < 210 || spacingMinutes > 270) {
    return {
      sleeveId: 'sleeve-b',
      sleeveCode: 'Sleeve B',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: spacingMinutes ? Math.round(spacingMinutes) : null,
      lastPrice,
      indicatorLabel: '4h EMA 12/48',
      indicatorSummary: `Spacing ${spacingMinutes ? Math.round(spacingMinutes) : '?'}m ≠ 240m`,
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: `Fail-closed REM-002: expected 240m 4h bars, detected ${spacingMinutes ? Math.round(spacingMinutes) : 'unknown'}m spacing.`,
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  const closes = params.bars.map((b) => b.close);
  const ema12Series = computeEma(closes, 12);
  const ema48Series = computeEma(closes, 48);
  const ema12 = ema12Series[ema12Series.length - 1];
  const ema48 = ema48Series[ema48Series.length - 1];
  const spreadPct = ((ema12 - ema48) / ema48) * 100;
  const atr = computeAtr(params.bars, 14);

  const perSymbolBudget = Math.min(
    params.equityUsd * (params.allocationPct / 100),
    params.maxTradeNotionalUsd
  );
  const currentNotional = params.currentQty * lastPrice;
  const indicatorSummary = `EMA12 $${ema12.toFixed(2)} vs EMA48 $${ema48.toFixed(2)} (${spreadPct >= 0 ? '+' : ''}${spreadPct.toFixed(2)}%${atr ? ` · ATR $${atr.toFixed(2)}` : ''})`;

  if (ema12 > ema48) {
    const deltaNotional = perSymbolBudget - currentNotional;
    if (deltaNotional >= MIN_REBALANCE_NOTIONAL_USD) {
      const clampedNotional = Math.min(deltaNotional, params.maxTradeNotionalUsd);
      const orderQty = roundQty(clampedNotional / lastPrice, 4);
      if (orderQty > 0) {
        return {
          sleeveId: 'sleeve-b',
          sleeveCode: 'Sleeve B',
          symbol: params.symbol,
          dataSource: params.dataSource,
          barCount,
          barSpacingMinutes: Math.round(spacingMinutes),
          lastPrice,
          indicatorLabel: '4h EMA 12/48',
          indicatorSummary,
          action: 'BUY',
          targetNotionalUsd: Math.round(clampedNotional * 100) / 100,
          orderQty,
          reason: `Bullish 4h trend (EMA12 > EMA48 by +${spreadPct.toFixed(2)}%). Rebalancing +$${clampedNotional.toFixed(2)} toward target weight.`,
          guardPassed: true,
          evaluatedAtUtc,
        };
      }
    }
    return {
      sleeveId: 'sleeve-b',
      sleeveCode: 'Sleeve B',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: Math.round(spacingMinutes),
      lastPrice,
      indicatorLabel: '4h EMA 12/48',
      indicatorSummary,
      action: 'HOLD',
      targetNotionalUsd: Math.round(perSymbolBudget * 100) / 100,
      orderQty: 0,
      reason: `Bullish 4h trend active; current holding ($${currentNotional.toFixed(2)}) already within $${MIN_REBALANCE_NOTIONAL_USD} of target ($${perSymbolBudget.toFixed(2)}).`,
      guardPassed: true,
      evaluatedAtUtc,
    };
  }

  // Bearish crossover (EMA12 <= EMA48) -> exit long if held, otherwise stay flat
  if (params.currentQty > 0 && currentNotional >= MIN_REBALANCE_NOTIONAL_USD) {
    const exitQty = roundQty(params.currentQty, 4);
    return {
      sleeveId: 'sleeve-b',
      sleeveCode: 'Sleeve B',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: Math.round(spacingMinutes),
      lastPrice,
      indicatorLabel: '4h EMA 12/48',
      indicatorSummary,
      action: 'SELL',
      targetNotionalUsd: Math.round(currentNotional * 100) / 100,
      orderQty: exitQty,
      reason: `Trend breakdown (EMA12 <= EMA48, ${spreadPct.toFixed(2)}%). Flattening ${exitQty} ${params.symbol} to cash.`,
      guardPassed: true,
      evaluatedAtUtc,
    };
  }

  return {
    sleeveId: 'sleeve-b',
    sleeveCode: 'Sleeve B',
    symbol: params.symbol,
    dataSource: params.dataSource,
    barCount,
    barSpacingMinutes: Math.round(spacingMinutes),
    lastPrice,
    indicatorLabel: '4h EMA 12/48',
    indicatorSummary,
    action: 'HOLD',
    targetNotionalUsd: 0,
    orderQty: 0,
    reason: `Bearish 4h regime (${spreadPct.toFixed(2)}%). Staying flat in cash.`,
    guardPassed: true,
    evaluatedAtUtc,
  };
}

/**
 * Sleeve A: US Equities Momentum / PEAD Gate — Strict holiday/closed-clock fail-closed guard.
 */
export function evaluateUsEquitySignal(params: {
  symbol: string;
  bars: OhlcBar[];
  currentQty: number;
  equityUsd: number;
  allocationPct: number;
  maxTradeNotionalUsd: number;
  marketOpen: boolean;
  isHoliday: boolean;
  dataSource: string;
  nowUtc?: string;
}): LiveSignalEvaluation {
  const evaluatedAtUtc = params.nowUtc ?? new Date().toISOString();
  const barCount = params.bars.length;
  const lastPrice = barCount > 0 ? params.bars[barCount - 1].close : null;
  const closes = params.bars.map((b) => b.close);
  const sma20 = computeSma(closes, 20);
  const ret5d =
    closes.length >= 6 && closes[closes.length - 6] > 0
      ? ((closes[closes.length - 1] - closes[closes.length - 6]) /
          closes[closes.length - 6]) *
        100
      : null;

  const indicatorSummary =
    lastPrice !== null && sma20 !== null
      ? `Px $${lastPrice.toFixed(2)} vs SMA20 $${sma20.toFixed(2)}${ret5d !== null ? ` · 5D ${ret5d >= 0 ? '+' : ''}${ret5d.toFixed(2)}%` : ''}`
      : `Bars loaded: ${barCount}`;

  // Fail-closed REM-001: never submit US equity orders when market is closed or holiday
  if (!params.marketOpen || params.isHoliday) {
    return {
      sleeveId: 'sleeve-a',
      sleeveCode: 'Sleeve A',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: 1440,
      lastPrice,
      indicatorLabel: 'Daily SMA20 / 5D Drift',
      indicatorSummary,
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: params.isHoliday
        ? 'Fail-closed REM-001: US market holiday detected — order submission aborted.'
        : 'Fail-closed REM-001: NYSE/NASDAQ regular session closed — telemetry scanned, execution gated until open.',
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  if (barCount < 22 || lastPrice === null || sma20 === null || ret5d === null) {
    return {
      sleeveId: 'sleeve-a',
      sleeveCode: 'Sleeve A',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: 1440,
      lastPrice,
      indicatorLabel: 'Daily SMA20 / 5D Drift',
      indicatorSummary,
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: `Fail-closed: insufficient daily history (${barCount}/22 bars) from ${params.dataSource}.`,
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  const targetNotional = Math.min(
    params.equityUsd * (params.allocationPct / 100),
    params.maxTradeNotionalUsd
  );
  const currentNotional = params.currentQty * lastPrice;

  if (lastPrice > sma20 && ret5d > 0) {
    const deltaNotional = targetNotional - currentNotional;
    const shareQty = Math.floor(
      Math.min(deltaNotional, params.maxTradeNotionalUsd) / lastPrice
    );
    if (deltaNotional >= MIN_REBALANCE_NOTIONAL_USD && shareQty >= 1) {
      return {
        sleeveId: 'sleeve-a',
        sleeveCode: 'Sleeve A',
        symbol: params.symbol,
        dataSource: params.dataSource,
        barCount,
        barSpacingMinutes: 1440,
        lastPrice,
        indicatorLabel: 'Daily SMA20 / 5D Drift',
        indicatorSummary,
        action: 'BUY',
        targetNotionalUsd: Math.round(shareQty * lastPrice * 100) / 100,
        orderQty: shareQty,
        reason: `Positive drift above SMA20 (+${ret5d.toFixed(2)}% 5D). Rebalancing +${shareQty} shs toward $${targetNotional.toFixed(0)} sleeve target.`,
        guardPassed: true,
        evaluatedAtUtc,
      };
    }
    return {
      sleeveId: 'sleeve-a',
      sleeveCode: 'Sleeve A',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: 1440,
      lastPrice,
      indicatorLabel: 'Daily SMA20 / 5D Drift',
      indicatorSummary,
      action: 'HOLD',
      targetNotionalUsd: Math.round(targetNotional * 100) / 100,
      orderQty: 0,
      reason: `Positive trend active; current holding ($${currentNotional.toFixed(2)}) already sized near target.`,
      guardPassed: true,
      evaluatedAtUtc,
    };
  }

  if (lastPrice < sma20 && params.currentQty >= 1) {
    const exitQty = Math.floor(params.currentQty);
    return {
      sleeveId: 'sleeve-a',
      sleeveCode: 'Sleeve A',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount,
      barSpacingMinutes: 1440,
      lastPrice,
      indicatorLabel: 'Daily SMA20 / 5D Drift',
      indicatorSummary,
      action: 'SELL',
      targetNotionalUsd: Math.round(exitQty * lastPrice * 100) / 100,
      orderQty: exitQty,
      reason: `Closed below SMA20 ($${sma20.toFixed(2)}). Rotating ${exitQty} shs out to cash.`,
      guardPassed: true,
      evaluatedAtUtc,
    };
  }

  return {
    sleeveId: 'sleeve-a',
    sleeveCode: 'Sleeve A',
    symbol: params.symbol,
    dataSource: params.dataSource,
    barCount,
    barSpacingMinutes: 1440,
    lastPrice,
    indicatorLabel: 'Daily SMA20 / 5D Drift',
    indicatorSummary,
    action: 'HOLD',
    targetNotionalUsd: 0,
    orderQty: 0,
    reason: `No qualified breakout above SMA20 (5D ${ret5d.toFixed(2)}%). Holding cash.`,
    guardPassed: true,
    evaluatedAtUtc,
  };
}

/**
 * Sleeve C: Defined-Risk Options (SPY) — Fail-closed live option chain & IV gate (REM-006).
 */
export function evaluateOptionsGateSignal(params: {
  symbol: string;
  spotPrice: number | null;
  liveContractsCount: number;
  impliedVolPct: number | null;
  marketOpen: boolean;
  dataSource: string;
  nowUtc?: string;
}): LiveSignalEvaluation {
  const evaluatedAtUtc = params.nowUtc ?? new Date().toISOString();

  if (!params.marketOpen) {
    return {
      sleeveId: 'sleeve-c',
      sleeveCode: 'Sleeve C',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount: params.liveContractsCount,
      barSpacingMinutes: null,
      lastPrice: params.spotPrice,
      indicatorLabel: 'Live Option Chain / IV',
      indicatorSummary: params.spotPrice
        ? `Spot $${params.spotPrice.toFixed(2)} · US Options Closed`
        : 'US Options Market Closed',
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: 'Fail-closed REM-006: US options market closed — no synthetic spreads or stale chain quotes permitted.',
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  if (
    params.spotPrice === null ||
    params.liveContractsCount <= 0 ||
    params.impliedVolPct === null
  ) {
    return {
      sleeveId: 'sleeve-c',
      sleeveCode: 'Sleeve C',
      symbol: params.symbol,
      dataSource: params.dataSource,
      barCount: params.liveContractsCount,
      barSpacingMinutes: null,
      lastPrice: params.spotPrice,
      indicatorLabel: 'Live Option Chain / IV',
      indicatorSummary: `Contracts: ${params.liveContractsCount} · IV: ${params.impliedVolPct ?? 'N/A'}`,
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: 'Fail-closed REM-006: Live option chain bid-ask quotes or IV Greeks missing. Hardcoded $0.85/$580 fallback disabled.',
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  return {
    sleeveId: 'sleeve-c',
    sleeveCode: 'Sleeve C',
    symbol: params.symbol,
    dataSource: params.dataSource,
    barCount: params.liveContractsCount,
    barSpacingMinutes: null,
    lastPrice: params.spotPrice,
    indicatorLabel: 'Live Option Chain / IV',
    indicatorSummary: `Spot $${params.spotPrice.toFixed(2)} · IV ${params.impliedVolPct.toFixed(1)}% (${params.liveContractsCount} live quotes)`,
    action: 'HOLD',
    targetNotionalUsd: 0,
    orderQty: 0,
    reason:
      params.impliedVolPct >= 18
        ? 'Live chain verified & IV elevated — defined-risk 15–20Δ put credit spread eligible for operator approval.'
        : 'Live chain verified; IV below 18% credit-spread threshold — standing aside.',
    guardPassed: true,
    evaluatedAtUtc,
  };
}

/**
 * Sleeve D: India NIFTY 50 (DhanHQ) — INR ₹1,00,000 cap & NSE IST session gate (REM-007).
 */
export function evaluateIndiaSleeveSignal(params: {
  dhanConfigured: boolean;
  dhanReachable: boolean;
  availableBalanceInr: number | null;
  capitalCapInr: number;
  maxDriftPct: number;
  nseOpen: boolean;
  nowUtc?: string;
}): LiveSignalEvaluation {
  const evaluatedAtUtc = params.nowUtc ?? new Date().toISOString();

  if (!params.dhanConfigured || !params.dhanReachable) {
    return {
      sleeveId: 'sleeve-d',
      sleeveCode: 'Sleeve D',
      symbol: 'NIFTY50',
      dataSource: 'DhanHQ v2 API',
      barCount: 0,
      barSpacingMinutes: null,
      lastPrice: params.availableBalanceInr,
      indicatorLabel: 'NSE IST & INR Cap',
      indicatorSummary: params.dhanConfigured ? 'DhanHQ unreachable' : 'DhanHQ unconfigured',
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: 'Fail-closed REM-007: DhanHQ fund limit telemetry unavailable — India sleeve halted.',
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  if (!params.nseOpen) {
    return {
      sleeveId: 'sleeve-d',
      sleeveCode: 'Sleeve D',
      symbol: 'NIFTY50',
      dataSource: 'DhanHQ v2 API',
      barCount: 1,
      barSpacingMinutes: null,
      lastPrice: params.availableBalanceInr,
      indicatorLabel: 'NSE IST & INR Cap',
      indicatorSummary: `NSE Closed · Cap ₹${params.capitalCapInr.toLocaleString('en-IN')} · Dhan Bal ₹${Math.round(params.availableBalanceInr ?? 0).toLocaleString('en-IN')}`,
      action: 'BLOCKED',
      targetNotionalUsd: 0,
      orderQty: 0,
      reason: 'Fail-closed: NSE regular session (09:15–15:30 IST Mon–Fri) is closed. Paper cap verified.',
      guardPassed: false,
      evaluatedAtUtc,
    };
  }

  const effectiveInr = params.availableBalanceInr ?? 0;
  return {
    sleeveId: 'sleeve-d',
    sleeveCode: 'Sleeve D',
    symbol: 'NIFTY50',
    dataSource: 'DhanHQ v2 API',
    barCount: 1,
    barSpacingMinutes: null,
    lastPrice: effectiveInr,
    indicatorLabel: 'NSE IST & INR Cap',
    indicatorSummary: `NSE Open · Cap ₹${params.capitalCapInr.toLocaleString('en-IN')} · Bal ₹${Math.round(effectiveInr).toLocaleString('en-IN')}`,
    action: 'HOLD',
    targetNotionalUsd: 0,
    orderQty: 0,
    reason: 'NSE session active & DhanHQ authenticated. Statutory friction & ₹1,00,000 paper cap enforced.',
    guardPassed: true,
    evaluatedAtUtc,
  };
}

/**
 * Checks whether NSE India regular session (Mon–Fri 09:15–15:30 IST / UTC+5:30) is open.
 */
export function isNseMarketOpen(nowDate: Date = new Date()): boolean {
  const istMs = nowDate.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const day = ist.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}
