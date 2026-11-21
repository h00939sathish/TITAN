import type {
  ComputedPortfolioMetrics,
  Holding,
  HoldingSortKey,
  HoldingWithPnl,
  OrderSide,
  PortfolioSnapshot,
  RiskSettings,
  SideFilter,
  SortDirection,
} from '../types/trading';

export function computeHoldingPnl(holding: Holding): HoldingWithPnl {
  const signedQty = holding.side === 'LONG' ? holding.qty : -holding.qty;
  const priceDiff =
    holding.side === 'LONG'
      ? holding.markPrice - holding.fillPrice
      : holding.fillPrice - holding.markPrice;

  const unrealizedPnl = roundToCents(priceDiff * holding.qty);
  const costBasis = holding.fillPrice * holding.qty;
  const pnlPercent = costBasis > 0 ? roundToCents((unrealizedPnl / costBasis) * 100) : 0;
  const notionalValue = roundToCents(holding.markPrice * holding.qty);

  return {
    ...holding,
    signedQty,
    notionalValue,
    unrealizedPnl,
    pnlPercent,
  };
}

export function computePortfolioMetrics(
  holdings: Holding[],
  snapshot: PortfolioSnapshot,
  risk: RiskSettings
): ComputedPortfolioMetrics {
  const enriched = holdings.map(computeHoldingPnl);
  const totalUnrealizedPnl = roundToCents(
    enriched.reduce((sum, h) => sum + h.unrealizedPnl, 0)
  );
  const todayPnl = roundToCents(snapshot.realizedPnlToday + totalUnrealizedPnl);
  const totalEquity = roundToCents(snapshot.baseEquity + todayPnl);
  const todayPnlPct =
    snapshot.baseEquity > 0 ? roundToCents((todayPnl / snapshot.baseEquity) * 100) : 0;

  const grossExposure = roundToCents(
    enriched.reduce((sum, h) => sum + h.notionalValue, 0)
  );
  const netExposure = roundToCents(
    enriched.reduce(
      (sum, h) => sum + (h.side === 'LONG' ? h.notionalValue : -h.notionalValue),
      0
    )
  );

  // Buying power scales cleanly from equity and current exposure
  const buyingPower = roundToCents(
    Math.max(0, totalEquity * snapshot.dayTradeMultiplier - grossExposure * 1.15)
  );
  const marginUtilizedPct =
    totalEquity > 0
      ? roundToCents(Math.min(100, (grossExposure / (totalEquity * 2)) * 100))
      : 0;

  const pdtCushion = roundToCents(totalEquity - risk.pdtFloor);
  let pdtStatus: 'Safe' | 'Caution' | 'Breach' = 'Safe';
  let pdtTierLabel = 'Tier 1 Margin';
  if (pdtCushion < 0) {
    pdtStatus = 'Breach';
    pdtTierLabel = 'PDT Restricted';
  } else if (pdtCushion < 10000) {
    pdtStatus = 'Caution';
    pdtTierLabel = 'Tier 2 Buffer';
  }

  const pacingPct =
    snapshot.totalOrdersSubmitted > 0
      ? roundToCents(
          (snapshot.filledOrdersCount / snapshot.totalOrdersSubmitted) * 100
        )
      : 100;

  return {
    totalEquity,
    todayPnl,
    todayPnlPct,
    totalUnrealizedPnl,
    availableCash: snapshot.availableCash,
    buyingPower,
    overnightBuyingPower: snapshot.overnightBuyingPower,
    marginUtilizedPct,
    pdtCushion,
    pdtStatus,
    pdtTierLabel,
    grossExposure,
    netExposure,
    pacingPct,
  };
}

export function sortHoldings(
  holdings: HoldingWithPnl[],
  sortKey: HoldingSortKey,
  direction: SortDirection
): HoldingWithPnl[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...holdings].sort((a, b) => {
    switch (sortKey) {
      case 'ticker':
        return a.symbol.localeCompare(b.symbol) * dir;
      case 'pnlDollar':
        return (a.unrealizedPnl - b.unrealizedPnl) * dir;
      case 'pnlPercent':
        return (a.pnlPercent - b.pnlPercent) * dir;
      case 'notional':
        return (a.notionalValue - b.notionalValue) * dir;
    }
  });
}

export function filterHoldings(
  holdings: HoldingWithPnl[],
  sideFilter: SideFilter,
  query: string
): HoldingWithPnl[] {
  const normalizedQuery = query.trim().toUpperCase();
  return holdings.filter((h) => {
    if (sideFilter !== 'ALL' && h.side !== sideFilter) {
      return false;
    }
    if (normalizedQuery && !h.symbol.toUpperCase().includes(normalizedQuery)) {
      return false;
    }
    return true;
  });
}

export interface NewOrderInput {
  symbol: string;
  side: OrderSide;
  qty: string;
  limitPrice: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof NewOrderInput | 'notional', string>>;
  parsed?: {
    symbol: string;
    side: OrderSide;
    qty: number;
    limitPrice: number;
  };
}

export function validateOrderInput(
  input: NewOrderInput,
  maxOrderNotional: number
): ValidationResult {
  const errors: ValidationResult['errors'] = {};
  const cleanSymbol = input.symbol.trim().toUpperCase();

  if (!cleanSymbol || !/^[A-Z]{1,6}$/.test(cleanSymbol)) {
    errors.symbol = 'Enter a valid 1–6 letter ticker symbol (e.g. NVDA).';
  }

  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
    errors.qty = 'Quantity must be a positive whole number.';
  }

  const limitPrice = Number(input.limitPrice);
  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    errors.limitPrice = 'Limit price must be greater than $0.00.';
  }

  if (
    !errors.qty &&
    !errors.limitPrice &&
    qty * limitPrice > maxOrderNotional
  ) {
    errors.notional = `Order notional (${formatCurrency(
      qty * limitPrice
    )}) exceeds max guardrail (${formatCurrency(maxOrderNotional)}).`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: {},
    parsed: {
      symbol: cleanSymbol,
      side: input.side,
      qty,
      limitPrice: roundToCents(limitPrice),
    },
  };
}

export function validateBracketInput(
  stopLossStr: string,
  takeProfitStr: string,
  side: 'LONG' | 'SHORT',
  markPrice: number
): { valid: boolean; error?: string; stopLoss?: number; takeProfit?: number } {
  const sl = stopLossStr.trim() === '' ? undefined : Number(stopLossStr);
  const tp = takeProfitStr.trim() === '' ? undefined : Number(takeProfitStr);

  if (sl !== undefined && (!Number.isFinite(sl) || sl <= 0)) {
    return { valid: false, error: 'Stop loss must be a positive price.' };
  }
  if (tp !== undefined && (!Number.isFinite(tp) || tp <= 0)) {
    return { valid: false, error: 'Take profit must be a positive price.' };
  }

  if (side === 'LONG') {
    if (sl !== undefined && sl >= markPrice) {
      return {
        valid: false,
        error: `Stop loss for a LONG position must be below mark price (${formatCurrency(markPrice)}).`,
      };
    }
    if (tp !== undefined && tp <= markPrice) {
      return {
        valid: false,
        error: `Take profit for a LONG position must be above mark price (${formatCurrency(markPrice)}).`,
      };
    }
  } else {
    if (sl !== undefined && sl <= markPrice) {
      return {
        valid: false,
        error: `Stop loss for a SHORT position must be above mark price (${formatCurrency(markPrice)}).`,
      };
    }
    if (tp !== undefined && tp >= markPrice) {
      return {
        valid: false,
        error: `Take profit for a SHORT position must be below mark price (${formatCurrency(markPrice)}).`,
      };
    }
  }

  return {
    valid: true,
    stopLoss: sl !== undefined ? roundToCents(sl) : undefined,
    takeProfit: tp !== undefined ? roundToCents(tp) : undefined,
  };
}

export function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedCurrency(value: number): string {
  const absFormatted = formatCurrency(Math.abs(value));
  if (value > 0) return `+${absFormatted}`;
  if (value < 0) return `-${absFormatted}`;
  return absFormatted;
}

export function formatSignedPercent(value: number): string {
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `-${abs}%`;
  return `0.00%`;
}

export function formatTimeNow(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

export interface SparklinePoint {
  index: number;
  timeLabel: string;
  equity: number;
  deltaFromOpen: number;
}

/**
 * Maps raw intradayEquityCurve values into labeled Recharts points
 * spanning regular US market hours starting at 09:30 ET.
 */
export function buildSparklineSeries(points: number[]): SparklinePoint[] {
  if (points.length === 0) return [];
  const openEquity = points[0];
  const startMinutes = 9 * 60 + 30; // 09:30 ET
  const stepMinutes = 10;

  return points.map((equity, index) => {
    const totalMinutes = startMinutes + index * stepMinutes;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return {
      index,
      timeLabel: `${hh}:${mm} ET`,
      equity: roundToCents(equity),
      deltaFromOpen: roundToCents(equity - openEquity),
    };
  });
}
