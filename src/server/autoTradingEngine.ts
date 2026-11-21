import crypto from 'node:crypto';
import type {
  AutoEngineConfig,
  EngineOrderExecution,
  EngineStatusPayload,
  EngineTriggerSource,
  Holding,
  LiveSignalEvaluation,
  MarketClockStatus,
  OhlcBar,
  RiskSettings,
} from '../types/trading.ts';
import {
  evaluateCryptoEmaSignal,
  evaluateIndiaSleeveSignal,
  evaluateOptionsGateSignal,
  evaluateUsEquitySignal,
  isNseMarketOpen,
} from '../utils/strategyEngine.ts';

const CRYPTO_UNIVERSE = ['BTC/USD', 'ETH/USD', 'SOL/USD'] as const;
const US_EQUITY_UNIVERSE = ['NVDA', 'MSFT', 'AAPL', 'SPY'] as const;
const INDIA_CAPITAL_CAP_INR = 100000;

export interface EngineRuntimeDeps {
  getAlpacaCredentials: () => {
    configured: boolean;
    keyId: string;
    secretKey: string;
    baseUrl: string;
  };
  fetchAlpacaJson: (endpointPath: string, init?: RequestInit) => Promise<unknown>;
  getCurrentState: () => {
    holdings: Holding[];
    equityUsd: number;
    pdtBreach: boolean;
    killSwitchEngaged: boolean;
    approvalsPaused: boolean;
    riskSettings: RiskSettings;
    armedSleeveIds: Set<string>;
    simulatedFaults: Record<string, boolean>;
  };
  appendLog: (
    level: 'INFO' | 'EXEC' | 'RISK' | 'WARN',
    moduleName: string,
    message: string
  ) => void;
  recordLocalPaperOrder: (params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    qty: number;
    price: number;
    sleeveName: string;
  }) => void;
  syncBeforeCycle?: () => Promise<void>;
}

function normalizeSymbolKey(sym: string): string {
  return sym.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function findPositionQty(holdings: Holding[], symbol: string): number {
  const target = normalizeSymbolKey(symbol);
  const match = holdings.find((h) => normalizeSymbolKey(h.symbol) === target);
  if (!match) return 0;
  return match.side === 'SHORT' ? -match.qty : match.qty;
}

function formatIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Constant-time token verifier for external 24/7 cron triggers (POST /api/engine/cron).
 * Fails closed when ENGINE_CRON_SECRET is not configured.
 */
export function verifyCronBearerToken(authHeader: string | undefined): {
  configured: boolean;
  authorized: boolean;
} {
  const expected = (process.env.ENGINE_CRON_SECRET || '').trim();
  if (!expected) {
    return { configured: false, authorized: false };
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { configured: true, authorized: false };
  }
  const provided = authHeader.slice('Bearer '.length).trim();
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return { configured: true, authorized: false };
  }
  return { configured: true, authorized: crypto.timingSafeEqual(a, b) };
}

export class AutoTradingEngine {
  private config: AutoEngineConfig = {
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

  private isRunningCycle = false;
  private lastRunAtUtc: string | null = null;
  private nextRunAtMs: number | null = null;
  private totalCyclesRun = 0;
  private totalOrdersSubmitted = 0;
  private latestSignals: LiveSignalEvaluation[] = [];
  private runHistory: EngineOrderExecution[] = [];
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private deps: EngineRuntimeDeps;

  constructor(deps: EngineRuntimeDeps) {
    this.deps = deps;
  }

  public startHeartbeat(): void {
    if (this.timerHandle) return;
    this.timerHandle = setInterval(() => {
      if (!this.config.enabled || this.isRunningCycle) return;
      if (this.nextRunAtMs !== null && Date.now() >= this.nextRunAtMs) {
        void this.runCycle('auto_loop', 'all').catch((err) => {
          this.deps.appendLog(
            'WARN',
            'Auto Engine',
            `Scheduled cycle failed: ${err instanceof Error ? err.message : 'unknown error'}`
          );
        });
      }
    }, 15_000);
  }

  public getStatus(): EngineStatusPayload {
    const creds = this.deps.getAlpacaCredentials();
    const paperEndpointVerified =
      !creds.configured || creds.baseUrl === 'https://paper-api.alpaca.markets';

    return {
      config: structuredClone(this.config),
      isRunningCycle: this.isRunningCycle,
      lastRunAtUtc: this.lastRunAtUtc,
      nextRunAtUtc:
        this.config.enabled && this.nextRunAtMs
          ? new Date(this.nextRunAtMs).toISOString()
          : null,
      totalCyclesRun: this.totalCyclesRun,
      totalOrdersSubmitted: this.totalOrdersSubmitted,
      cronSecretConfigured: Boolean((process.env.ENGINE_CRON_SECRET || '').trim()),
      paperEndpointVerified,
      latestSignals: this.latestSignals,
      runHistory: this.runHistory,
    };
  }

  public updateConfig(patch: Partial<AutoEngineConfig>): EngineStatusPayload {
    const prevEnabled = this.config.enabled;

    if (typeof patch.enabled === 'boolean') {
      this.config.enabled = patch.enabled;
    }
    if (
      patch.executionMode === 'dry_run' ||
      patch.executionMode === 'live_paper'
    ) {
      this.config.executionMode = patch.executionMode;
    }
    if (typeof patch.intervalMinutes === 'number' && Number.isFinite(patch.intervalMinutes)) {
      this.config.intervalMinutes = Math.max(
        1,
        Math.min(240, Math.round(patch.intervalMinutes))
      );
    }
    if (
      typeof patch.perSleeveAllocationPct === 'number' &&
      Number.isFinite(patch.perSleeveAllocationPct)
    ) {
      this.config.perSleeveAllocationPct = Math.max(
        1,
        Math.min(25, Math.round(patch.perSleeveAllocationPct))
      );
    }
    if (
      typeof patch.maxTradeNotionalUsd === 'number' &&
      Number.isFinite(patch.maxTradeNotionalUsd)
    ) {
      this.config.maxTradeNotionalUsd = Math.max(
        100,
        Math.min(50000, Math.round(patch.maxTradeNotionalUsd))
      );
    }
    if (patch.enabledSleeves && typeof patch.enabledSleeves === 'object') {
      const es = patch.enabledSleeves;
      this.config.enabledSleeves = {
        'sleeve-a':
          typeof es['sleeve-a'] === 'boolean'
            ? es['sleeve-a']
            : this.config.enabledSleeves['sleeve-a'],
        'sleeve-b':
          typeof es['sleeve-b'] === 'boolean'
            ? es['sleeve-b']
            : this.config.enabledSleeves['sleeve-b'],
        'sleeve-c':
          typeof es['sleeve-c'] === 'boolean'
            ? es['sleeve-c']
            : this.config.enabledSleeves['sleeve-c'],
        'sleeve-d':
          typeof es['sleeve-d'] === 'boolean'
            ? es['sleeve-d']
            : this.config.enabledSleeves['sleeve-d'],
      };
    }

    if (this.config.enabled) {
      if (!prevEnabled || this.nextRunAtMs === null) {
        this.nextRunAtMs = Date.now() + this.config.intervalMinutes * 60_000;
      }
    } else {
      this.nextRunAtMs = null;
    }

    this.deps.appendLog(
      'RISK',
      'Auto Engine',
      `Updated loop config: ${this.config.enabled ? 'ENABLED' : 'STOPPED'} · Mode: ${
        this.config.executionMode === 'live_paper' ? 'LIVE PAPER ORDERS' : 'DRY-RUN'
      } · Interval: ${this.config.intervalMinutes}m · Cap: $${this.config.maxTradeNotionalUsd}.`
    );

    return this.getStatus();
  }

  private async fetchSingleCryptoSymbol4hBars(
    symbol: string,
    startIso: string,
    headers: Record<string, string>
  ): Promise<OhlcBar[]> {
    const collected: OhlcBar[] = [];
    let pageToken: string | null = null;

    // Alpaca Crypto v1beta3 paginates ~42 4h bars per page; fetch up to 3 pages descending for latest ~100 bars
    for (let page = 0; page < 3 && collected.length < 85; page++) {
      const qs = new URLSearchParams({
        symbols: symbol,
        timeframe: '4Hour',
        start: startIso,
        limit: '100',
        sort: 'desc',
      });
      if (pageToken) {
        qs.set('page_token', pageToken);
      }
      const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?${qs.toString()}`;
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`Alpaca Crypto Data HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        bars?: Record<
          string,
          Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>
        >;
        next_page_token?: string | null;
      };
      const rawList = json?.bars?.[symbol] ?? [];
      for (const b of rawList) {
        collected.push({
          timestamp: String(b.t),
          open: Number(b.o),
          high: Number(b.h),
          low: Number(b.l),
          close: Number(b.c),
          volume: Number(b.v),
        });
      }
      pageToken = json?.next_page_token ?? null;
      if (!pageToken || rawList.length === 0) break;
    }

    // Deduplicate and return in chronological ascending order for EMA(12/48)
    const uniqueByTs = new Map<string, OhlcBar>();
    for (const bar of collected) {
      uniqueByTs.set(bar.timestamp, bar);
    }
    return Array.from(uniqueByTs.values()).sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
    );
  }

  private async fetchLiveCrypto4hBars(): Promise<{
    barsBySymbol: Record<string, OhlcBar[]>;
    dataSource: string;
  }> {
    const creds = this.deps.getAlpacaCredentials();
    const startIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (creds.configured) {
      headers['APCA-API-KEY-ID'] = creds.keyId;
      headers['APCA-API-SECRET-KEY'] = creds.secretKey;
    }

    const results = await Promise.all(
      CRYPTO_UNIVERSE.map(async (sym) => ({
        sym,
        bars: await this.fetchSingleCryptoSymbol4hBars(sym, startIso, headers),
      }))
    );

    const barsBySymbol: Record<string, OhlcBar[]> = {};
    for (const { sym, bars } of results) {
      barsBySymbol[sym] = bars;
    }

    return { barsBySymbol, dataSource: 'Alpaca Crypto 4h API' };
  }

  private async fetchLiveUsDailyBars(
    symbol: string
  ): Promise<{ bars: OhlcBar[]; dataSource: string }> {
    const polygonKey = (process.env.POLYGON_API_KEY || '').trim();
    const fromDate = formatIsoDate(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const toDate = formatIsoDate(Date.now());

    if (polygonKey) {
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${polygonKey}` },
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
          };
          const rows = json?.results ?? [];
          if (rows.length > 0) {
            return {
              dataSource: 'Polygon.io Daily',
              bars: rows.map((r) => ({
                timestamp: new Date(r.t).toISOString(),
                open: Number(r.o),
                high: Number(r.h),
                low: Number(r.l),
                close: Number(r.c),
                volume: Number(r.v),
              })),
            };
          }
        }
      } catch {
        // Fall through to Alpaca IEX stock bars
      }
    }

    const creds = this.deps.getAlpacaCredentials();
    if (creds.configured) {
      try {
        const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Day&start=${encodeURIComponent(`${fromDate}T00:00:00Z`)}&limit=45&feed=iex`;
        const res = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': creds.keyId,
            'APCA-API-SECRET-KEY': creds.secretKey,
          },
          signal: AbortSignal.timeout(7000),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
          };
          const rows = json?.bars ?? [];
          return {
            dataSource: 'Alpaca IEX Daily',
            bars: rows.map((r) => ({
              timestamp: String(r.t),
              open: Number(r.o),
              high: Number(r.h),
              low: Number(r.l),
              close: Number(r.c),
              volume: Number(r.v),
            })),
          };
        }
      } catch {
        // Fail closed with empty bars
      }
    }

    return { bars: [], dataSource: 'Unavailable' };
  }

  private async fetchLiveMarketClock(): Promise<MarketClockStatus> {
    const creds = this.deps.getAlpacaCredentials();
    const nowUtc = new Date().toISOString();
    if (creds.configured) {
      try {
        const clock = (await this.deps.fetchAlpacaJson('/v2/clock')) as Record<
          string,
          unknown
        >;
        return {
          isOpen: Boolean(clock?.is_open),
          isHoliday: false,
          sessionLabel: clock?.is_open ? 'NYSE Regular Open' : 'Market Closed',
          nextOpenEt: String(clock?.next_open || ''),
          timestampUtc: String(clock?.timestamp || nowUtc),
        };
      } catch {
        // Fail closed when clock cannot be verified
      }
    }
    return {
      isOpen: false,
      isHoliday: false,
      sessionLabel: 'Market Clock Unverified (Fail-Closed)',
      nextOpenEt: '',
      timestampUtc: nowUtc,
    };
  }

  private async fetchOptionsSnapshot(
    spotPrice: number | null
  ): Promise<{ liveContractsCount: number; impliedVolPct: number | null; dataSource: string }> {
    const creds = this.deps.getAlpacaCredentials();
    if (!creds.configured) {
      return {
        liveContractsCount: 0,
        impliedVolPct: null,
        dataSource: 'Alpaca Options API',
      };
    }
    try {
      const url = 'https://data.alpaca.markets/v1beta1/options/snapshots/SPY?limit=20';
      const res = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': creds.keyId,
          'APCA-API-SECRET-KEY': creds.secretKey,
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) {
        return {
          liveContractsCount: 0,
          impliedVolPct: null,
          dataSource: `Alpaca Options HTTP ${res.status}`,
        };
      }
      const json = (await res.json()) as {
        snapshots?: Record<string, { impliedVolatility?: number }>;
      };
      const entries = Object.values(json?.snapshots ?? {});
      const ivs = entries
        .map((e) => Number(e?.impliedVolatility))
        .filter((v) => Number.isFinite(v) && v > 0);
      const avgIv =
        ivs.length > 0
          ? (ivs.reduce((a, b) => a + b, 0) / ivs.length) * 100
          : null;
      return {
        liveContractsCount: entries.length,
        impliedVolPct: avgIv !== null ? Math.round(avgIv * 10) / 10 : null,
        dataSource: spotPrice ? 'Alpaca Options Chain' : 'Alpaca Options Chain',
      };
    } catch {
      return {
        liveContractsCount: 0,
        impliedVolPct: null,
        dataSource: 'Alpaca Options API',
      };
    }
  }

  private async fetchDhanHealth(): Promise<{
    configured: boolean;
    reachable: boolean;
    availableBalanceInr: number | null;
  }> {
    const clientId = (process.env.DHAN_CLIENT_ID || '').trim();
    const accessToken = (process.env.DHAN_ACCESS_TOKEN || '').trim();
    if (!clientId || !accessToken) {
      return { configured: false, reachable: false, availableBalanceInr: null };
    }
    try {
      const res = await fetch('https://api.dhan.co/v2/fundlimit', {
        headers: {
          'access-token': accessToken,
          'client-id': clientId,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) {
        return { configured: true, reachable: false, availableBalanceInr: null };
      }
      const data = (await res.json()) as Record<string, unknown>;
      const rawBal = Number(data.availabelBalance ?? data.sodLimit ?? 0);
      return {
        configured: true,
        reachable: true,
        availableBalanceInr: Number.isFinite(rawBal) ? rawBal : 0,
      };
    } catch {
      return { configured: true, reachable: false, availableBalanceInr: null };
    }
  }

  private pushHistory(entry: EngineOrderExecution): void {
    this.runHistory = [entry, ...this.runHistory.slice(0, 79)];
  }

  private async maybeExecuteSignal(
    signal: LiveSignalEvaluation,
    trigger: EngineTriggerSource,
    isCrypto: boolean
  ): Promise<void> {
    const runtime = this.deps.getCurrentState();
    const creds = this.deps.getAlpacaCredentials();
    const nowUtc = new Date().toISOString();

    // Non-actionable signals get logged cleanly in history
    if (signal.action === 'BLOCKED') {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: this.config.executionMode,
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: 'BLOCKED',
        qty: 0,
        price: signal.lastPrice,
        notionalUsd: 0,
        status: 'BLOCKED',
        detail: signal.reason,
      });
      return;
    }

    if (signal.action === 'HOLD' || signal.orderQty <= 0) {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: this.config.executionMode,
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: 'HOLD',
        qty: 0,
        price: signal.lastPrice,
        notionalUsd: 0,
        status: 'HOLD',
        detail: signal.reason,
      });
      return;
    }

    // Global safety gates before any BUY/SELL execution
    if (runtime.killSwitchEngaged) {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: this.config.executionMode,
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice,
        notionalUsd: signal.targetNotionalUsd,
        status: 'BLOCKED',
        detail: 'Blocked by global Kill Switch.',
      });
      return;
    }

    if (runtime.approvalsPaused) {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: this.config.executionMode,
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice,
        notionalUsd: signal.targetNotionalUsd,
        status: 'BLOCKED',
        detail: 'Blocked: automated approvals are paused by operator.',
      });
      return;
    }

    if (!runtime.armedSleeveIds.has(signal.sleeveId) || runtime.simulatedFaults[signal.sleeveId]) {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: this.config.executionMode,
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice,
        notionalUsd: signal.targetNotionalUsd,
        status: 'BLOCKED',
        detail: `Blocked: ${signal.sleeveCode} is disarmed or fault-tripped.`,
      });
      return;
    }

    if (!isCrypto && runtime.pdtBreach) {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: this.config.executionMode,
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice,
        notionalUsd: signal.targetNotionalUsd,
        status: 'BLOCKED',
        detail: 'Blocked by FINRA 4210 PDT capital floor.',
      });
      return;
    }

    // Dry-run mode evaluates live data & computes exact order sizing without routing to broker
    if (this.config.executionMode === 'dry_run') {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: 'dry_run',
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice,
        notionalUsd: signal.targetNotionalUsd,
        status: 'DRY_RUN',
        detail: `Dry-Run simulated ${signal.action} ${signal.orderQty} ${signal.symbol} (~$${signal.targetNotionalUsd.toFixed(2)}). Switch to Live Paper Orders to execute on Alpaca.`,
      });
      return;
    }

    // Hard fail-closed check: never allow automated loop to hit live real-money Alpaca host
    if (creds.configured && creds.baseUrl !== 'https://paper-api.alpaca.markets') {
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: 'live_paper',
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice,
        notionalUsd: signal.targetNotionalUsd,
        status: 'BLOCKED',
        detail: 'Fail-closed: automated loop refuses non-paper Alpaca endpoints.',
      });
      return;
    }

    // Route real paper order to Alpaca Paper API (or local paper fallback when keys unset)
    if (creds.configured) {
      try {
        const brokerResp = (await this.deps.fetchAlpacaJson('/v2/orders', {
          method: 'POST',
          body: JSON.stringify({
            symbol: signal.symbol,
            qty: String(signal.orderQty),
            side: signal.action.toLowerCase(),
            type: 'market',
            time_in_force: isCrypto ? 'gtc' : 'day',
          }),
        })) as Record<string, unknown>;

        const brokerOrderId = String(brokerResp?.id || '');
        this.totalOrdersSubmitted += 1;

        this.pushHistory({
          id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestampUtc: nowUtc,
          trigger,
          executionMode: 'live_paper',
          sleeveId: signal.sleeveId,
          sleeveCode: signal.sleeveCode,
          symbol: signal.symbol,
          action: signal.action,
          qty: signal.orderQty,
          price: signal.lastPrice,
          notionalUsd: signal.targetNotionalUsd,
          status: 'SUBMITTED',
          brokerOrderId,
          detail: `Submitted live Alpaca Paper ${signal.action} ${signal.orderQty} ${signal.symbol} (${isCrypto ? 'MKT/GTC' : 'MKT/DAY'}).`,
        });

        this.deps.appendLog(
          'EXEC',
          'Auto Engine',
          `Live Paper ${signal.action} ${signal.orderQty} ${signal.symbol} @ ~$${(signal.lastPrice ?? 0).toFixed(2)} (${signal.sleeveCode}, Order ${brokerOrderId.slice(0, 8)}).`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Alpaca order rejected';
        this.pushHistory({
          id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestampUtc: nowUtc,
          trigger,
          executionMode: 'live_paper',
          sleeveId: signal.sleeveId,
          sleeveCode: signal.sleeveCode,
          symbol: signal.symbol,
          action: signal.action,
          qty: signal.orderQty,
          price: signal.lastPrice,
          notionalUsd: signal.targetNotionalUsd,
          status: 'ERROR',
          detail: `Broker error: ${msg}`,
        });
        this.deps.appendLog(
          'WARN',
          'Auto Engine',
          `Failed submitting ${signal.action} ${signal.symbol}: ${msg}`
        );
      }
    } else {
      this.deps.recordLocalPaperOrder({
        symbol: signal.symbol,
        side: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice ?? 0,
        sleeveName: signal.sleeveCode,
      });
      this.totalOrdersSubmitted += 1;
      this.pushHistory({
        id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestampUtc: nowUtc,
        trigger,
        executionMode: 'live_paper',
        sleeveId: signal.sleeveId,
        sleeveCode: signal.sleeveCode,
        symbol: signal.symbol,
        action: signal.action,
        qty: signal.orderQty,
        price: signal.lastPrice,
        notionalUsd: signal.targetNotionalUsd,
        status: 'SUBMITTED',
        brokerOrderId: `local-${Date.now()}`,
        detail: `Staged local paper order ${signal.action} ${signal.orderQty} ${signal.symbol}.`,
      });
    }
  }

  public async runCycle(
    trigger: EngineTriggerSource,
    targetSleeve: 'all' | 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d' = 'all'
  ): Promise<EngineStatusPayload> {
    if (this.isRunningCycle) {
      throw new Error('An automated trading cycle is already running.');
    }

    this.isRunningCycle = true;
    const nowUtc = new Date().toISOString();

    try {
      if (this.deps.syncBeforeCycle) {
        await this.deps.syncBeforeCycle();
      }
      const runtime = this.deps.getCurrentState();
      const maxTradeCap = Math.min(
        this.config.maxTradeNotionalUsd,
        runtime.riskSettings.maxOrderNotional
      );
      const clock = await this.fetchLiveMarketClock();
      const evaluatedMap = new Map<string, LiveSignalEvaluation>(
        this.latestSignals.map((s) => [`${s.sleeveId}:${s.symbol}`, s])
      );

      // 1. Sleeve B: 24/7 Crypto Trend (Real 4h bars from Alpaca Crypto Data API)
      if (
        (targetSleeve === 'all' || targetSleeve === 'sleeve-b') &&
        this.config.enabledSleeves['sleeve-b']
      ) {
        try {
          const { barsBySymbol, dataSource } = await this.fetchLiveCrypto4hBars();
          for (const sym of CRYPTO_UNIVERSE) {
            const bars = barsBySymbol[sym] ?? [];
            const currentQty = findPositionQty(runtime.holdings, sym);
            const sig = evaluateCryptoEmaSignal({
              symbol: sym,
              bars,
              currentQty,
              equityUsd: runtime.equityUsd,
              allocationPct: this.config.perSleeveAllocationPct,
              maxTradeNotionalUsd: maxTradeCap,
              dataSource,
              nowUtc,
            });
            evaluatedMap.set(`sleeve-b:${sym}`, sig);
            await this.maybeExecuteSignal(sig, trigger, true);
          }
        } catch (err) {
          for (const sym of CRYPTO_UNIVERSE) {
            const failedSig: LiveSignalEvaluation = {
              sleeveId: 'sleeve-b',
              sleeveCode: 'Sleeve B',
              symbol: sym,
              dataSource: 'Alpaca Crypto 4h API',
              barCount: 0,
              barSpacingMinutes: null,
              lastPrice: null,
              indicatorLabel: '4h EMA 12/48',
              indicatorSummary: 'Feed error (fail-closed)',
              action: 'BLOCKED',
              targetNotionalUsd: 0,
              orderQty: 0,
              reason: `Fail-closed: ${err instanceof Error ? err.message : 'crypto data unreachable'}`,
              guardPassed: false,
              evaluatedAtUtc: nowUtc,
            };
            evaluatedMap.set(`sleeve-b:${sym}`, failedSig);
            await this.maybeExecuteSignal(failedSig, trigger, true);
          }
        }
      }

      // 2. Sleeve A: US Equities Momentum / PEAD (Real Polygon / Alpaca Daily bars + Market Clock Gate)
      let spySpot: number | null = null;
      if (
        (targetSleeve === 'all' || targetSleeve === 'sleeve-a') &&
        this.config.enabledSleeves['sleeve-a']
      ) {
        const fetched = await Promise.all(
          US_EQUITY_UNIVERSE.map(async (sym) => ({
            sym,
            data: await this.fetchLiveUsDailyBars(sym),
          }))
        );

        for (const { sym, data } of fetched) {
          if (sym === 'SPY' && data.bars.length > 0) {
            spySpot = data.bars[data.bars.length - 1].close;
          }
          const currentQty = findPositionQty(runtime.holdings, sym);
          const sig = evaluateUsEquitySignal({
            symbol: sym,
            bars: data.bars,
            currentQty,
            equityUsd: runtime.equityUsd,
            allocationPct: this.config.perSleeveAllocationPct,
            maxTradeNotionalUsd: maxTradeCap,
            marketOpen: clock.isOpen,
            isHoliday: clock.isHoliday,
            dataSource: data.dataSource,
            nowUtc,
          });
          evaluatedMap.set(`sleeve-a:${sym}`, sig);
          await this.maybeExecuteSignal(sig, trigger, false);
        }
      }

      // 3. Sleeve C: Defined-Risk Options (Live SPY chain & IV gate — never hardcoded)
      if (
        (targetSleeve === 'all' || targetSleeve === 'sleeve-c') &&
        this.config.enabledSleeves['sleeve-c']
      ) {
        const opt = await this.fetchOptionsSnapshot(spySpot);
        const sig = evaluateOptionsGateSignal({
          symbol: 'SPY',
          spotPrice: spySpot,
          liveContractsCount: opt.liveContractsCount,
          impliedVolPct: opt.impliedVolPct,
          marketOpen: clock.isOpen,
          dataSource: opt.dataSource,
          nowUtc,
        });
        evaluatedMap.set('sleeve-c:SPY', sig);
        await this.maybeExecuteSignal(sig, trigger, false);
      }

      // 4. Sleeve D: India NIFTY 50 (Live DhanHQ fundlimit + NSE IST window + ₹1,00,000 cap)
      if (
        (targetSleeve === 'all' || targetSleeve === 'sleeve-d') &&
        this.config.enabledSleeves['sleeve-d']
      ) {
        const dhan = await this.fetchDhanHealth();
        const sig = evaluateIndiaSleeveSignal({
          dhanConfigured: dhan.configured,
          dhanReachable: dhan.reachable,
          availableBalanceInr: dhan.availableBalanceInr,
          capitalCapInr: INDIA_CAPITAL_CAP_INR,
          maxDriftPct: 15,
          nseOpen: isNseMarketOpen(),
          nowUtc,
        });
        evaluatedMap.set('sleeve-d:NIFTY50', sig);
        await this.maybeExecuteSignal(sig, trigger, false);
      }

      this.latestSignals = Array.from(evaluatedMap.values());
      this.lastRunAtUtc = nowUtc;
      this.totalCyclesRun += 1;
      if (this.config.enabled) {
        this.nextRunAtMs = Date.now() + this.config.intervalMinutes * 60_000;
      }

      this.deps.appendLog(
        'INFO',
        'Auto Engine',
        `Completed ${trigger} cycle (${targetSleeve}, ${this.config.executionMode === 'live_paper' ? 'Live Paper' : 'Dry-Run'}) — evaluated ${this.latestSignals.length} live instruments.`
      );

      this.isRunningCycle = false;
      return this.getStatus();
    } finally {
      this.isRunningCycle = false;
    }
  }
}
