export type NavSection =
  | 'overview'
  | 'engine'
  | 'execution'
  | 'holdings'
  | 'tournament'
  | 'alpha'
  | 'roadmap'
  | 'qualification'
  | 'logs'
  | 'settings';

export type PositionSide = 'LONG' | 'SHORT';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LMT' | 'MKT';
export type TimeInForce = 'DAY' | 'GTC' | 'IOC';
export type VenueRoute = 'SIP-DIRECT' | 'SMART-DARK' | 'ARCA' | 'BATS' | 'IEX';

export type ConnectionMode = 'alpaca_paper' | 'local_paper' | 'degraded';

export interface MarketClockStatus {
  isOpen: boolean;
  isHoliday: boolean;
  sessionLabel: string;
  nextOpenEt: string;
  timestampUtc: string;
}

export type SleeveGuardStatus = 'NOMINAL' | 'TRIPPED' | 'PAUSED';

export interface SleeveGuardCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SleeveGuardInput {
  sleeveId: string;
  marketOpen: boolean;
  isHoliday: boolean;
  peadEventsPresent: boolean;
  cryptoBarTimeframeMinutes: number;
  cryptoExpectedTimeframeMinutes: number;
  cryptoFeedHealthy: boolean;
  optionsChainLive: boolean;
  optionsIvAvailable: boolean;
  indiaAllocatedCapitalInr: number;
  indiaComputedEquityInr: number;
  indiaMaxDriftPct: number;
}

export interface SleeveGuardReport {
  sleeveId: string;
  status: SleeveGuardStatus;
  canExecute: boolean;
  summary: string;
  checks: SleeveGuardCheck[];
}

export interface Holding {
  id: string;
  symbol: string;
  assetClass: 'Equity' | 'ETF';
  sleeveId: string;
  side: PositionSide;
  qty: number;
  fillPrice: number;
  markPrice: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface HoldingWithPnl extends Holding {
  signedQty: number;
  notionalValue: number;
  unrealizedPnl: number;
  pnlPercent: number;
}

export interface WorkingOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  limitPrice: number;
  orderType: OrderType;
  tif: TimeInForce;
  route: VenueRoute;
  timestamp: string;
  status: 'Working' | 'Staged';
}

export interface FillRecord {
  id: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  fillPrice: number;
  route: VenueRoute;
  timestamp: string;
  sleeveName: string;
  slippageBps: number;
}

export interface TournamentSleeve {
  id: string;
  code: string;
  name: string;
  strategy: string;
  armed: boolean;
  winRate: number;
  isTopWinRate?: boolean;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  secondaryMetricLabel: string;
  secondaryMetricValue: string;
  budgetLabel: string;
  allocationDetail: string;
  dayPerformance: string;
  dayPositive: boolean;
  signalNote?: string;
  progressRatio: number;
  accentTone: 'emerald' | 'blue' | 'amber' | 'slate';
  guardReport?: SleeveGuardReport;
  faultSimulated?: boolean;
}

export interface StrategyRow {
  id: string;
  rank: number;
  name: string;
  sleeveCode: string;
  winRate: number;
  sharpe: number;
  profitFactor: number;
  status: 'Live' | 'Live (INR)' | 'Paused';
  isTop?: boolean;
  monthlyReturns: number[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'EXEC' | 'RISK' | 'WARN';
  module: string;
  message: string;
}

export interface RiskSettings {
  pdtFloor: number;
  maintenanceCallFloorPct: number;
  maxOrderNotional: number;
  defaultRoute: VenueRoute;
  autoHedgeEnabled: boolean;
  paperMode: boolean;
}

export interface PortfolioSnapshot {
  baseEquity: number;
  realizedPnlToday: number;
  availableCash: number;
  shortProceedsReserved: number;
  dayTradeMultiplier: number;
  overnightBuyingPower: number;
  filledOrdersCount: number;
  totalOrdersSubmitted: number;
  droppedOrdersCount: number;
  latencyMs: number;
  intradayEquityCurve: number[];
}

export interface ComputedPortfolioMetrics {
  totalEquity: number;
  todayPnl: number;
  todayPnlPct: number;
  totalUnrealizedPnl: number;
  availableCash: number;
  buyingPower: number;
  overnightBuyingPower: number;
  marginUtilizedPct: number;
  pdtCushion: number;
  pdtStatus: 'Safe' | 'Caution' | 'Breach';
  pdtTierLabel: string;
  grossExposure: number;
  netExposure: number;
  pacingPct: number;
}

export type HoldingSortKey = 'pnlDollar' | 'pnlPercent' | 'ticker' | 'notional';
export type SortDirection = 'asc' | 'desc';
export type SideFilter = 'ALL' | 'LONG' | 'SHORT';

export type RemediationPhase = 'P0' | 'P1' | 'P2' | 'P3';
export type RemediationSeverity = 'Critical' | 'High' | 'Medium';
export type RemediationStatus = 'pending' | 'in_progress' | 'verified';

export interface RemediationTask {
  id: string;
  phase: RemediationPhase;
  severity: RemediationSeverity;
  subsystem: string;
  title: string;
  rootCause: string;
  actionPlan: string;
  acceptanceTest: string;
  status: RemediationStatus;
}

export interface BrokerPortfolioPayload {
  connectionMode: ConnectionMode;
  connectionDetail: string;
  brokerAccount: {
    broker: string;
    accountId: string;
    route: VenueRoute;
    gateway: string;
  };
  marketClock: MarketClockStatus;
  approvalsPaused: boolean;
  killSwitchEngaged: boolean;
  holdings: Holding[];
  workingOrders: WorkingOrder[];
  fills: FillRecord[];
  sleeves: TournamentSleeve[];
  snapshot: PortfolioSnapshot;
  riskSettings: RiskSettings;
  logs: AuditLogEntry[];
}

export type CloudSyncStatus = 'signed_out' | 'syncing' | 'synced' | 'error';

export interface QualificationEntry {
  entryId: string;
  date: string;
  dayNumber: number;
  equityUsd: number;
  dailyPnlUsd: number;
  netSharpe: number;
  maxDrawdownPct: number;
  slippageCostUsd: number;
  guardTripsCount: number;
  allGuardsNominal: boolean;
  notes: string;
}

export interface QualificationSummary {
  targetDays: number;
  totalLoggedDays: number;
  nominalDays: number;
  progressPct: number;
  cumulativePnlUsd: number;
  cumulativeSlippageUsd: number;
  avgNetSharpe: number;
  worstDrawdownPct: number;
  totalGuardTrips: number;
  daysGatePassed: boolean;
  sharpeGatePassed: boolean;
  drawdownGatePassed: boolean;
  latestGuardsNominal: boolean;
  qualifiedForLive: boolean;
}

export type EngineExecutionMode = 'dry_run' | 'live_paper';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD' | 'BLOCKED';
export type EngineTriggerSource = 'manual' | 'auto_loop' | 'cron';

export interface OhlcBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AutoEngineConfig {
  enabled: boolean;
  executionMode: EngineExecutionMode;
  intervalMinutes: number;
  perSleeveAllocationPct: number;
  maxTradeNotionalUsd: number;
  enabledSleeves: {
    'sleeve-a': boolean;
    'sleeve-b': boolean;
    'sleeve-c': boolean;
    'sleeve-d': boolean;
  };
}

export interface LiveSignalEvaluation {
  sleeveId: 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d';
  sleeveCode: string;
  symbol: string;
  dataSource: string;
  barCount: number;
  barSpacingMinutes: number | null;
  lastPrice: number | null;
  indicatorLabel: string;
  indicatorSummary: string;
  action: SignalAction;
  targetNotionalUsd: number;
  orderQty: number;
  reason: string;
  guardPassed: boolean;
  evaluatedAtUtc: string;
}

export interface EngineOrderExecution {
  id: string;
  timestampUtc: string;
  trigger: EngineTriggerSource;
  executionMode: EngineExecutionMode;
  sleeveId: string;
  sleeveCode: string;
  symbol: string;
  action: SignalAction;
  qty: number;
  price: number | null;
  notionalUsd: number;
  status: 'SUBMITTED' | 'DRY_RUN' | 'HOLD' | 'BLOCKED' | 'ERROR';
  brokerOrderId?: string;
  detail: string;
}

export interface EngineStatusPayload {
  config: AutoEngineConfig;
  isRunningCycle: boolean;
  lastRunAtUtc: string | null;
  nextRunAtUtc: string | null;
  totalCyclesRun: number;
  totalOrdersSubmitted: number;
  cronSecretConfigured: boolean;
  paperEndpointVerified: boolean;
  latestSignals: LiveSignalEvaluation[];
  runHistory: EngineOrderExecution[];
}


