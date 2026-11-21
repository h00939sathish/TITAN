import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  BROKER_METADATA,
  INITIAL_AUDIT_LOGS,
  INITIAL_FILLS,
  INITIAL_HOLDINGS,
  INITIAL_PORTFOLIO_SNAPSHOT,
  INITIAL_RISK_SETTINGS,
  INITIAL_SLEEVES,
  INITIAL_WORKING_ORDERS,
} from './src/data/seedData.ts';
import type {
  AuditLogEntry,
  BrokerPortfolioPayload,
  ConnectionMode,
  FillRecord,
  Holding,
  MarketClockStatus,
  OrderSide,
  PortfolioSnapshot,
  RiskSettings,
  TimeInForce,
  TournamentSleeve,
  VenueRoute,
  WorkingOrder,
} from './src/types/trading.ts';
import { evaluateSleeveGuard } from './src/utils/guardEngine.ts';
import {
  computeHoldingPnl,
  computePortfolioMetrics,
  formatCurrency,
  formatTimeNow,
  roundToCents,
  validateBracketInput,
  validateOrderInput,
} from './src/utils/portfolioEngine.ts';
import {
  AutoTradingEngine,
  verifyCronBearerToken,
} from './src/server/autoTradingEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_ALPACA_HOSTS = new Set([
  'paper-api.alpaca.markets',
  'api.alpaca.markets',
]);

const VALID_ROUTES = new Set<VenueRoute>([
  'SIP-DIRECT',
  'SMART-DARK',
  'ARCA',
  'BATS',
  'IEX',
]);

const VALID_TIFS = new Set<TimeInForce>(['DAY', 'GTC', 'IOC']);

function resolveSafeAlpacaBaseUrl(): string {
  const raw = (
    process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets'
  ).trim();
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === 'https:' &&
      ALLOWED_ALPACA_HOSTS.has(parsed.hostname)
    ) {
      return `${parsed.protocol}//${parsed.hostname}`;
    }
  } catch {
    // Fall through to safe default
  }
  return 'https://paper-api.alpaca.markets';
}

function getAlpacaCredentials() {
  const keyId = (process.env.APCA_API_KEY_ID || '').trim();
  const secretKey = (process.env.APCA_API_SECRET_KEY || '').trim();
  const baseUrl = resolveSafeAlpacaBaseUrl();
  return {
    configured: Boolean(keyId && secretKey),
    keyId,
    secretKey,
    baseUrl,
  };
}

// Server-side authoritative paper state (also serves as safe fallback when Alpaca keys are unset)
interface ServerTradingState {
  holdings: Holding[];
  workingOrders: WorkingOrder[];
  fills: FillRecord[];
  sleeves: TournamentSleeve[];
  snapshot: PortfolioSnapshot;
  riskSettings: RiskSettings;
  logs: AuditLogEntry[];
  approvalsPaused: boolean;
  killSwitchEngaged: boolean;
  simulatedFaults: Record<string, boolean>;
}

const state: ServerTradingState = {
  holdings: structuredClone(INITIAL_HOLDINGS),
  workingOrders: structuredClone(INITIAL_WORKING_ORDERS),
  fills: structuredClone(INITIAL_FILLS),
  sleeves: structuredClone(INITIAL_SLEEVES).map((s) => ({
    ...s,
    // Fix the original 12/26 vs 12/48 mismatch in Sleeve B contract label
    strategy:
      s.id === 'sleeve-b' ? '4h EMA (12/48) Breakout' : s.strategy,
  })),
  snapshot: structuredClone(INITIAL_PORTFOLIO_SNAPSHOT),
  riskSettings: structuredClone(INITIAL_RISK_SETTINGS),
  logs: structuredClone(INITIAL_AUDIT_LOGS),
  approvalsPaused: false,
  killSwitchEngaged: false,
  simulatedFaults: {
    'sleeve-a': false,
    'sleeve-b': false,
    'sleeve-c': false,
    'sleeve-d': false,
  },
};

function appendLog(
  level: AuditLogEntry['level'],
  moduleName: string,
  message: string
) {
  state.logs = [
    {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: formatTimeNow(),
      level,
      module: moduleName,
      message,
    },
    ...state.logs.slice(0, 199),
  ];
}

function evaluateAllSleeves(
  marketClock: MarketClockStatus,
  connectionMode: ConnectionMode
): TournamentSleeve[] {
  return state.sleeves.map((sleeve) => {
    const faultActive = Boolean(state.simulatedFaults[sleeve.id]);
    const report = evaluateSleeveGuard(
      {
        sleeveId: sleeve.id,
        marketOpen: faultActive && sleeve.id === 'sleeve-a' ? false : marketClock.isOpen,
        isHoliday: faultActive && sleeve.id === 'sleeve-a' ? true : marketClock.isHoliday,
        peadEventsPresent: !(faultActive && sleeve.id === 'sleeve-a'),
        cryptoBarTimeframeMinutes: faultActive && sleeve.id === 'sleeve-b' ? 60 : 240,
        cryptoExpectedTimeframeMinutes: 240,
        cryptoFeedHealthy:
          connectionMode !== 'degraded' && !(faultActive && sleeve.id === 'sleeve-b'),
        // Fail-closed: Sleeve C requires live option chain quotes; trips when fault simulated
        optionsChainLive: !(faultActive && sleeve.id === 'sleeve-c'),
        optionsIvAvailable: !(faultActive && sleeve.id === 'sleeve-c'),
        indiaAllocatedCapitalInr: 100000,
        indiaComputedEquityInr:
          faultActive && sleeve.id === 'sleeve-d' ? 498540 : 101673,
        indiaMaxDriftPct: 15,
      },
      sleeve.armed,
      state.killSwitchEngaged
    );

    return {
      ...sleeve,
      faultSimulated: faultActive,
      guardReport: report,
    };
  });
}

async function fetchAlpacaJson(endpointPath: string, init?: RequestInit) {
  const creds = getAlpacaCredentials();
  if (!creds.configured) {
    throw new Error('Alpaca credentials not configured.');
  }
  const url = `${creds.baseUrl}${endpointPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'APCA-API-KEY-ID': creds.keyId,
        'APCA-API-SECRET-KEY': creds.secretKey,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Alpaca HTTP ${response.status}`);
    }
    if (response.status === 204) return null;
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function buildPortfolioPayload(): Promise<BrokerPortfolioPayload> {
  const creds = getAlpacaCredentials();
  const nowUtc = new Date().toISOString();

  // Default local paper session clock
  let marketClock: MarketClockStatus = {
    isOpen: true,
    isHoliday: false,
    sessionLabel: 'Regular Session (Simulated)',
    nextOpenEt: 'Next 09:30 ET',
    timestampUtc: nowUtc,
  };

  let connectionMode: ConnectionMode = 'local_paper';
  let connectionDetail =
    'Deterministic Local Paper Engine (configure APCA_API_KEY_ID & APCA_API_SECRET_KEY in server secrets for live Alpaca Paper proxy).';
  let brokerAccount = {
    broker: state.riskSettings.paperMode ? BROKER_METADATA.broker : 'Alpaca Live',
    accountId: BROKER_METADATA.accountId,
    route: state.riskSettings.defaultRoute,
    gateway: BROKER_METADATA.gateway,
  };

  if (creds.configured) {
    try {
      const [account, positions, orders, clock] = await Promise.all([
        fetchAlpacaJson('/v2/account'),
        fetchAlpacaJson('/v2/positions'),
        fetchAlpacaJson('/v2/orders?status=open'),
        fetchAlpacaJson('/v2/clock'),
      ]);

      connectionMode = 'alpaca_paper';
      connectionDetail = `Connected via server-side Express proxy to ${creds.baseUrl}.`;

      if (clock) {
        marketClock = {
          isOpen: Boolean(clock.is_open),
          isHoliday: false,
          sessionLabel: clock.is_open ? 'NYSE Regular Open' : 'Market Closed',
          nextOpenEt: String(clock.next_open || ''),
          timestampUtc: String(clock.timestamp || nowUtc),
        };
      }

      if (account) {
        const equity = Number(account.equity || state.snapshot.baseEquity);
        const lastEquity = Number(account.last_equity || equity);
        const cash = Number(account.cash || 0);
        const overnightBp = Number(
          account.regt_buying_power || account.buying_power || 0
        );
        brokerAccount = {
          broker: 'Alpaca Paper (Live)',
          accountId: String(account.account_number || BROKER_METADATA.accountId),
          route: state.riskSettings.defaultRoute,
          gateway: 'ALPACA-REST',
        };
        state.snapshot = {
          ...state.snapshot,
          baseEquity: roundToCents(lastEquity),
          availableCash: roundToCents(cash),
          overnightBuyingPower: roundToCents(overnightBp),
        };
      }

      if (Array.isArray(positions)) {
        state.holdings = positions.map((p: Record<string, unknown>, idx: number) => {
          const rawQty = Number(p.qty || 0);
          const side = rawQty < 0 || String(p.side).toLowerCase() === 'short' ? 'SHORT' : 'LONG';
          const absQty = Math.abs(rawQty);
          const avgEntry = Number(p.avg_entry_price || 0);
          const currentPx = Number(p.current_price || avgEntry);
          return {
            id: `alpaca-pos-${String(p.symbol || idx)}`,
            symbol: String(p.symbol || 'UNKNOWN').toUpperCase(),
            assetClass: String(p.asset_class || '').includes('etf') ? 'ETF' : 'Equity',
            sleeveId: 'sleeve-a',
            side,
            qty: absQty,
            fillPrice: roundToCents(avgEntry),
            markPrice: roundToCents(currentPx),
          };
        });
      }

      if (Array.isArray(orders)) {
        state.workingOrders = orders.map((o: Record<string, unknown>) => ({
          id: String(o.id),
          symbol: String(o.symbol || '').toUpperCase(),
          side: String(o.side || 'buy').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
          qty: Number(o.qty || 0),
          limitPrice: roundToCents(Number(o.limit_price || 0)),
          orderType: String(o.type || 'limit').toLowerCase() === 'market' ? 'MKT' : 'LMT',
          tif: (String(o.time_in_force || 'day').toUpperCase() as TimeInForce) || 'DAY',
          route: state.riskSettings.defaultRoute,
          timestamp: String(o.submitted_at || '').slice(11, 19) || formatTimeNow(),
          status: 'Working',
        }));
      }
    } catch (err) {
      connectionMode = 'degraded';
      connectionDetail = `Alpaca proxy unreachable (${err instanceof Error ? err.message : 'network error'}) — fail-closed protection active.`;
      appendLog(
        'WARN',
        'Broker Proxy',
        'Upstream Alpaca Paper request failed; switched to degraded fail-closed mode.'
      );
    }
  }

  const evaluatedSleeves = evaluateAllSleeves(marketClock, connectionMode);

  return {
    connectionMode,
    connectionDetail,
    brokerAccount,
    marketClock,
    approvalsPaused: state.approvalsPaused,
    killSwitchEngaged: state.killSwitchEngaged,
    holdings: state.holdings,
    workingOrders: state.workingOrders,
    fills: state.fills,
    sleeves: evaluatedSleeves,
    snapshot: state.snapshot,
    riskSettings: state.riskSettings,
    logs: state.logs,
  };
}

/**
 * Protects all mutating control endpoints against cross-site browser requests.
 * Requires the custom X-Requested-With header and validates Origin matches Host when present.
 */
function requireControlGuard(req: Request, res: Response, next: NextFunction) {
  const customHeader = req.get('X-Requested-With');
  if (customHeader !== 'TitanQuantUI') {
    res.status(403).json({ error: 'Missing required control verification header.' });
    return;
  }

  const origin = req.get('Origin');
  const expectedHost = req.get('X-Forwarded-Host') || req.get('Host');
  if (origin && expectedHost) {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.host !== expectedHost) {
        res.status(403).json({ error: 'Cross-origin control mutation rejected.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
  }

  next();
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') && err instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON request payload.' });
      return;
    }
    next(err);
  });

  // Health & guard summary endpoint
  app.get('/api/health', async (_req, res) => {
    const payload = await buildPortfolioPayload();
    const trippedCount = payload.sleeves.filter(
      (s) => s.guardReport?.status === 'TRIPPED'
    ).length;
    res.json({
      status: payload.connectionMode === 'degraded' ? 'degraded' : 'ok',
      connectionMode: payload.connectionMode,
      killSwitchEngaged: payload.killSwitchEngaged,
      approvalsPaused: payload.approvalsPaused,
      trippedSleeves: trippedCount,
      timestampUtc: new Date().toISOString(),
    });
  });

  // Read-only live connectivity check for configured server-side broker & data providers (never exposes keys)
  app.get('/api/providers/status', async (_req, res) => {
    const creds = getAlpacaCredentials();
    const polygonKey = (process.env.POLYGON_API_KEY || '').trim();
    const dhanClientId = (process.env.DHAN_CLIENT_ID || '').trim();
    const dhanAccessToken = (process.env.DHAN_ACCESS_TOKEN || '').trim();

    const [alpaca, polygon, dhan] = await Promise.all([
      (async () => {
        if (!creds.configured) {
          return { configured: false, ok: false, statusCode: null, detail: 'Not configured in server secrets.' };
        }
        try {
          const account = await fetchAlpacaJson('/v2/account');
          return {
            configured: true,
            ok: true,
            statusCode: 200,
            detail: `Active (${String(account?.status || 'ACTIVE')}) · Equity $${Number(account?.equity || 0).toFixed(2)}`,
          };
        } catch (err) {
          return {
            configured: true,
            ok: false,
            statusCode: null,
            detail: err instanceof Error ? err.message : 'Connection failed',
          };
        }
      })(),
      (async () => {
        if (!polygonKey) {
          return { configured: false, ok: false, statusCode: null, detail: 'Not configured in server secrets.' };
        }
        try {
          const r = await fetch('https://api.polygon.io/v1/marketstatus/now', {
            headers: { Authorization: `Bearer ${polygonKey}` },
            signal: AbortSignal.timeout(5000),
          });
          const data: Record<string, unknown> = await r.json().catch(() => ({}));
          return {
            configured: true,
            ok: r.ok,
            statusCode: r.status,
            detail: r.ok
              ? `Connected · US market: ${String(data.market || 'unknown')}`
              : String(data.error || data.message || `HTTP ${r.status}`),
          };
        } catch (err) {
          return {
            configured: true,
            ok: false,
            statusCode: null,
            detail: err instanceof Error ? err.message : 'Connection failed',
          };
        }
      })(),
      (async () => {
        if (!dhanClientId || !dhanAccessToken) {
          return { configured: false, ok: false, statusCode: null, detail: 'Not configured in server secrets.' };
        }
        try {
          const r = await fetch('https://api.dhan.co/v2/fundlimit', {
            headers: {
              'access-token': dhanAccessToken,
              'client-id': dhanClientId,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(5000),
          });
          const data: Record<string, unknown> = await r.json().catch(() => ({}));
          return {
            configured: true,
            ok: r.ok,
            statusCode: r.status,
            detail: r.ok
              ? `Connected · Available INR ${Number(data.availabelBalance ?? data.sodLimit ?? 0).toFixed(2)}`
              : String(data.errorMessage || data.errorCode || `HTTP ${r.status}`),
          };
        } catch (err) {
          return {
            configured: true,
            ok: false,
            statusCode: null,
            detail: err instanceof Error ? err.message : 'Connection failed',
          };
        }
      })(),
    ]);

    res.json({
      checkedAtUtc: new Date().toISOString(),
      alpaca,
      polygon,
      dhan,
    });
  });

  // Portfolio & telemetry read endpoint
  app.get('/api/portfolio', async (_req, res) => {
    const payload = await buildPortfolioPayload();
    res.json(payload);
  });

  // Stage / submit validated limit order
  app.post('/api/orders', requireControlGuard, async (req, res) => {
    if (state.killSwitchEngaged) {
      res.status(409).json({ error: 'Trading halt active. Reset Kill Switch before submitting orders.' });
      return;
    }

    const { symbol, side, qty, limitPrice, tif, route } = req.body ?? {};
    const safeSide: OrderSide = side === 'SELL' ? 'SELL' : 'BUY';
    const safeTif: TimeInForce = VALID_TIFS.has(tif) ? tif : 'DAY';
    const safeRoute: VenueRoute = VALID_ROUTES.has(route)
      ? route
      : state.riskSettings.defaultRoute;

    const validation = validateOrderInput(
      {
        symbol: String(symbol ?? ''),
        side: safeSide,
        qty: String(qty ?? ''),
        limitPrice: String(limitPrice ?? ''),
      },
      state.riskSettings.maxOrderNotional
    );

    if (!validation.valid || !validation.parsed) {
      res.status(400).json({
        error: 'Order validation failed.',
        fieldErrors: validation.errors,
      });
      return;
    }

    // Server-side FINRA 4210 PDT capital corridor check
    const currentMetrics = computePortfolioMetrics(
      state.holdings,
      state.snapshot,
      state.riskSettings
    );
    if (currentMetrics.pdtStatus === 'Breach') {
      appendLog(
        'RISK',
        'FINRA 4210',
        `Rejected ${validation.parsed.side} ${validation.parsed.symbol}: equity below ${formatCurrency(state.riskSettings.pdtFloor)} PDT floor.`
      );
      res.status(422).json({
        error: `FINRA 4210 PDT breach: equity below ${formatCurrency(state.riskSettings.pdtFloor)} floor.`,
      });
      return;
    }

    const creds = getAlpacaCredentials();
    if (creds.configured) {
      try {
        await fetchAlpacaJson('/v2/orders', {
          method: 'POST',
          body: JSON.stringify({
            symbol: validation.parsed.symbol,
            qty: String(validation.parsed.qty),
            side: validation.parsed.side.toLowerCase(),
            type: 'limit',
            limit_price: String(validation.parsed.limitPrice),
            time_in_force: safeTif.toLowerCase(),
          }),
        });
      } catch (err) {
        res.status(502).json({
          error: `Alpaca order submission failed: ${err instanceof Error ? err.message : 'upstream error'}`,
        });
        return;
      }
    } else {
      const created: WorkingOrder = {
        id: `ord-${Date.now()}`,
        symbol: validation.parsed.symbol,
        side: validation.parsed.side,
        qty: validation.parsed.qty,
        limitPrice: validation.parsed.limitPrice,
        orderType: 'LMT',
        tif: safeTif,
        route: safeRoute,
        timestamp: formatTimeNow(),
        status: state.approvalsPaused ? 'Staged' : 'Working',
      };
      state.workingOrders = [created, ...state.workingOrders];
    }

    appendLog(
      'EXEC',
      'Order Router',
      `Submitted ${validation.parsed.side} ${validation.parsed.qty} ${validation.parsed.symbol} @ ${formatCurrency(validation.parsed.limitPrice)} LMT/${safeTif} via ${safeRoute}.`
    );

    res.status(201).json(await buildPortfolioPayload());
  });

  // Modify working order
  app.patch('/api/orders/:id', requireControlGuard, async (req, res) => {
    const orderId = String(req.params.id || '');
    const existing = state.workingOrders.find((o) => o.id === orderId);
    if (!existing) {
      res.status(404).json({ error: 'Working order not found.' });
      return;
    }

    const validation = validateOrderInput(
      {
        symbol: existing.symbol,
        side: existing.side,
        qty: String(req.body?.qty ?? ''),
        limitPrice: String(req.body?.limitPrice ?? ''),
      },
      state.riskSettings.maxOrderNotional
    );

    if (!validation.valid || !validation.parsed) {
      res.status(400).json({
        error: 'Invalid order modification parameters.',
        fieldErrors: validation.errors,
      });
      return;
    }

    const creds = getAlpacaCredentials();
    if (creds.configured) {
      try {
        await fetchAlpacaJson(`/v2/orders/${encodeURIComponent(orderId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            qty: String(validation.parsed.qty),
            limit_price: String(validation.parsed.limitPrice),
          }),
        });
      } catch (err) {
        res.status(502).json({
          error: `Alpaca modify failed: ${err instanceof Error ? err.message : 'upstream error'}`,
        });
        return;
      }
    } else {
      state.workingOrders = state.workingOrders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              qty: validation.parsed!.qty,
              limitPrice: validation.parsed!.limitPrice,
            }
          : o
      );
    }

    appendLog(
      'EXEC',
      'Order Router',
      `Modified ${existing.symbol} order to ${validation.parsed.qty} shs @ ${formatCurrency(validation.parsed.limitPrice)}.`
    );

    res.json(await buildPortfolioPayload());
  });

  // Cancel single working order
  app.delete('/api/orders/:id', requireControlGuard, async (req, res) => {
    const orderId = String(req.params.id || '');
    const existing = state.workingOrders.find((o) => o.id === orderId);
    if (!existing) {
      res.status(404).json({ error: 'Working order not found.' });
      return;
    }

    const creds = getAlpacaCredentials();
    if (creds.configured) {
      try {
        await fetchAlpacaJson(`/v2/orders/${encodeURIComponent(orderId)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        res.status(502).json({
          error: `Alpaca cancel failed: ${err instanceof Error ? err.message : 'upstream error'}`,
        });
        return;
      }
    } else {
      state.workingOrders = state.workingOrders.filter((o) => o.id !== orderId);
    }

    appendLog(
      'EXEC',
      'Order Router',
      `Canceled working order: ${existing.side} ${existing.qty} ${existing.symbol} @ ${formatCurrency(existing.limitPrice)}.`
    );

    res.json(await buildPortfolioPayload());
  });

  // Cancel all working orders
  app.delete('/api/orders', requireControlGuard, async (_req, res) => {
    const count = state.workingOrders.length;
    const creds = getAlpacaCredentials();
    if (creds.configured) {
      try {
        await fetchAlpacaJson('/v2/orders', { method: 'DELETE' });
      } catch (err) {
        res.status(502).json({
          error: `Alpaca cancel-all failed: ${err instanceof Error ? err.message : 'upstream error'}`,
        });
        return;
      }
    } else {
      state.workingOrders = [];
    }

    appendLog('WARN', 'Order Router', `Canceled all ${count} active working orders.`);
    res.json(await buildPortfolioPayload());
  });

  // Flatten position
  app.post('/api/positions/:id/flatten', requireControlGuard, async (req, res) => {
    if (state.killSwitchEngaged) {
      res.status(409).json({ error: 'Trading halt active.' });
      return;
    }

    const posId = String(req.params.id || '');
    const target = state.holdings.find((h) => h.id === posId);
    if (!target) {
      res.status(404).json({ error: 'Position not found.' });
      return;
    }

    const enriched = computeHoldingPnl(target);
    const creds = getAlpacaCredentials();
    if (creds.configured) {
      try {
        await fetchAlpacaJson(
          `/v2/positions/${encodeURIComponent(target.symbol)}`,
          { method: 'DELETE' }
        );
      } catch (err) {
        res.status(502).json({
          error: `Alpaca flatten failed: ${err instanceof Error ? err.message : 'upstream error'}`,
        });
        return;
      }
    } else {
      state.holdings = state.holdings.filter((h) => h.id !== posId);
      state.snapshot = {
        ...state.snapshot,
        realizedPnlToday: roundToCents(
          state.snapshot.realizedPnlToday + enriched.unrealizedPnl
        ),
        availableCash: roundToCents(
          state.snapshot.availableCash + enriched.notionalValue
        ),
        filledOrdersCount: state.snapshot.filledOrdersCount + 1,
        totalOrdersSubmitted: state.snapshot.totalOrdersSubmitted + 1,
      };
      state.fills = [
        {
          id: `fill-${Date.now()}`,
          symbol: target.symbol,
          side: target.side === 'LONG' ? 'SELL' : 'BUY',
          qty: target.qty,
          fillPrice: target.markPrice,
          route: state.riskSettings.defaultRoute,
          timestamp: formatTimeNow(),
          sleeveName: 'Flatten',
          slippageBps: 0.1,
        },
        ...state.fills,
      ];
    }

    appendLog(
      'EXEC',
      'Blotter',
      `Flattened ${target.side} ${target.qty} ${target.symbol} @ ${formatCurrency(target.markPrice)} (realized ${formatCurrency(enriched.unrealizedPnl)}).`
    );

    res.json(await buildPortfolioPayload());
  });

  // Stage 50% delta hedge for position
  app.post('/api/positions/:id/hedge', requireControlGuard, async (req, res) => {
    if (state.killSwitchEngaged) {
      res.status(409).json({ error: 'Trading halt active.' });
      return;
    }

    const posId = String(req.params.id || '');
    const target = state.holdings.find((h) => h.id === posId);
    if (!target) {
      res.status(404).json({ error: 'Position not found.' });
      return;
    }

    const hedgeSide: OrderSide = target.side === 'LONG' ? 'SELL' : 'BUY';
    const hedgeQty = Math.max(1, Math.round(target.qty * 0.5));
    const newOrder: WorkingOrder = {
      id: `ord-${Date.now()}`,
      symbol: target.symbol,
      side: hedgeSide,
      qty: hedgeQty,
      limitPrice: target.markPrice,
      orderType: 'LMT',
      tif: 'DAY',
      route: state.riskSettings.defaultRoute,
      timestamp: formatTimeNow(),
      status: 'Working',
    };
    state.workingOrders = [newOrder, ...state.workingOrders];
    appendLog(
      'RISK',
      'Delta Hedge',
      `Staged 50% hedge order: ${hedgeSide} ${hedgeQty} ${target.symbol} @ ${formatCurrency(target.markPrice)}.`
    );

    res.json(await buildPortfolioPayload());
  });

  // Update SL/TP risk bracket
  app.patch('/api/positions/:id/bracket', requireControlGuard, async (req, res) => {
    const posId = String(req.params.id || '');
    const target = state.holdings.find((h) => h.id === posId);
    if (!target) {
      res.status(404).json({ error: 'Position not found.' });
      return;
    }

    const check = validateBracketInput(
      req.body?.stopLoss !== undefined ? String(req.body.stopLoss) : '',
      req.body?.takeProfit !== undefined ? String(req.body.takeProfit) : '',
      target.side,
      target.markPrice
    );

    if (!check.valid) {
      res.status(400).json({ error: check.error || 'Invalid bracket prices.' });
      return;
    }

    state.holdings = state.holdings.map((h) =>
      h.id === posId
        ? { ...h, stopLoss: check.stopLoss, takeProfit: check.takeProfit }
        : h
    );

    appendLog(
      'RISK',
      'Risk Bracket',
      `Updated ${target.symbol} brackets — SL: ${
        check.stopLoss ? formatCurrency(check.stopLoss) : 'None'
      }, TP: ${check.takeProfit ? formatCurrency(check.takeProfit) : 'None'}.`
    );

    res.json(await buildPortfolioPayload());
  });

  // Arm / pause sleeve
  app.post('/api/sleeves/:id/toggle', requireControlGuard, async (req, res) => {
    if (state.killSwitchEngaged) {
      res.status(409).json({ error: 'Cannot toggle sleeves while Kill Switch is active.' });
      return;
    }
    const sleeveId = String(req.params.id || '');
    const target = state.sleeves.find((s) => s.id === sleeveId);
    if (!target) {
      res.status(404).json({ error: 'Sleeve not found.' });
      return;
    }

    state.sleeves = state.sleeves.map((s) =>
      s.id === sleeveId ? { ...s, armed: !s.armed } : s
    );
    const nextLabel = !target.armed ? 'Armed' : 'Paused';
    appendLog('RISK', target.code, `${target.name} switched to ${nextLabel}.`);
    res.json(await buildPortfolioPayload());
  });

  // Toggle fail-closed fault simulation on a sleeve (verifies auto-halt protection)
  app.post('/api/sleeves/:id/fault-test', requireControlGuard, async (req, res) => {
    const sleeveId = String(req.params.id || '');
    const target = state.sleeves.find((s) => s.id === sleeveId);
    if (!target) {
      res.status(404).json({ error: 'Sleeve not found.' });
      return;
    }

    const nextFault = !state.simulatedFaults[sleeveId];
    state.simulatedFaults[sleeveId] = nextFault;
    appendLog(
      nextFault ? 'WARN' : 'RISK',
      target.code,
      nextFault
        ? `Fail-closed guard test triggered on ${target.name} — execution halted automatically.`
        : `Fail-closed fault cleared on ${target.name} — pre-trade invariants restored.`
    );
    res.json(await buildPortfolioPayload());
  });

  // Run full fail-closed pre-flight diagnostics across all 4 sleeves
  app.post('/api/sleeves/preflight', requireControlGuard, async (_req, res) => {
    const payload = await buildPortfolioPayload();
    const nominalCount = payload.sleeves.filter(
      (s) => s.guardReport?.status === 'NOMINAL'
    ).length;
    const trippedCount = payload.sleeves.filter(
      (s) => s.guardReport?.status === 'TRIPPED'
    ).length;

    appendLog(
      trippedCount > 0 ? 'WARN' : 'RISK',
      'Pre-Flight',
      `4-sleeve fail-closed check complete: ${nominalCount} nominal, ${trippedCount} tripped.`
    );
    res.json(await buildPortfolioPayload());
  });

  // Pause / resume approvals
  app.post('/api/control/pause', requireControlGuard, async (_req, res) => {
    if (state.killSwitchEngaged) {
      res.status(409).json({ error: 'Trading halt active.' });
      return;
    }
    state.approvalsPaused = !state.approvalsPaused;
    appendLog(
      'WARN',
      'Approval Gate',
      state.approvalsPaused
        ? 'Automated strategy approvals paused by operator.'
        : 'Automated strategy approvals resumed.'
    );
    res.json(await buildPortfolioPayload());
  });

  // Emergency Kill Switch / Reset Halt
  app.post('/api/control/kill', requireControlGuard, async (_req, res) => {
    if (state.killSwitchEngaged) {
      state.killSwitchEngaged = false;
      appendLog('RISK', 'Kill Switch', 'Trading halt cleared by operator.');
      res.json(await buildPortfolioPayload());
      return;
    }

    const creds = getAlpacaCredentials();
    if (creds.configured) {
      try {
        await fetchAlpacaJson('/v2/orders', { method: 'DELETE' });
        await fetchAlpacaJson('/v2/positions?cancel_orders=true', {
          method: 'DELETE',
        });
      } catch (err) {
        appendLog(
          'WARN',
          'Kill Switch',
          `Alpaca liquidation returned error: ${err instanceof Error ? err.message : 'upstream error'}`
        );
      }
    }

    const enriched = state.holdings.map(computeHoldingPnl);
    const totalRealized = enriched.reduce((sum, h) => sum + h.unrealizedPnl, 0);
    const totalNotional = enriched.reduce((sum, h) => sum + h.notionalValue, 0);
    const canceledCount = state.workingOrders.length;
    const flattenedCount = state.holdings.length;

    state.killSwitchEngaged = true;
    state.approvalsPaused = true;
    state.workingOrders = [];
    state.holdings = [];
    state.sleeves = state.sleeves.map((s) => ({ ...s, armed: false }));
    state.snapshot = {
      ...state.snapshot,
      realizedPnlToday: roundToCents(state.snapshot.realizedPnlToday + totalRealized),
      availableCash: roundToCents(state.snapshot.availableCash + totalNotional),
    };

    appendLog(
      'WARN',
      'Kill Switch',
      `Emergency halt engaged: canceled ${canceledCount} orders, flattened ${flattenedCount} positions, disarmed all sleeves.`
    );

    res.json(await buildPortfolioPayload());
  });

  // Refresh marks / broker telemetry
  app.post('/api/control/refresh', requireControlGuard, async (_req, res) => {
    const creds = getAlpacaCredentials();
    if (!creds.configured) {
      state.holdings = state.holdings.map((h, i) => {
        const deltaFactor = i % 2 === 0 ? 1.0008 : 0.9993;
        return { ...h, markPrice: roundToCents(h.markPrice * deltaFactor) };
      });
      const currentMetrics = computePortfolioMetrics(
        state.holdings,
        state.snapshot,
        state.riskSettings
      );
      state.snapshot = {
        ...state.snapshot,
        latencyMs: state.snapshot.latencyMs === 14 ? 13 : 14,
        intradayEquityCurve: [
          ...state.snapshot.intradayEquityCurve.slice(1),
          Math.round(currentMetrics.totalEquity),
        ],
      };
    }

    appendLog(
      'INFO',
      'Market Data',
      creds.configured
        ? 'Synchronized live account, positions, and open orders from Alpaca Paper.'
        : 'Refreshed SIP-DIRECT mark prices for open holdings.'
    );
    res.json(await buildPortfolioPayload());
  });

  // Update risk settings
  app.patch('/api/settings', requireControlGuard, async (req, res) => {
    const body = req.body ?? {};
    const pdtFloor = Number(body.pdtFloor);
    const maxOrderNotional = Number(body.maxOrderNotional);
    const defaultRoute = VALID_ROUTES.has(body.defaultRoute)
      ? (body.defaultRoute as VenueRoute)
      : state.riskSettings.defaultRoute;

    state.riskSettings = {
      ...state.riskSettings,
      pdtFloor: Number.isFinite(pdtFloor) && pdtFloor >= 0 ? pdtFloor : state.riskSettings.pdtFloor,
      maxOrderNotional:
        Number.isFinite(maxOrderNotional) && maxOrderNotional >= 1000
          ? maxOrderNotional
          : state.riskSettings.maxOrderNotional,
      defaultRoute,
      autoHedgeEnabled:
        typeof body.autoHedgeEnabled === 'boolean'
          ? body.autoHedgeEnabled
          : state.riskSettings.autoHedgeEnabled,
      paperMode:
        typeof body.paperMode === 'boolean'
          ? body.paperMode
          : state.riskSettings.paperMode,
    };

    appendLog(
      'RISK',
      'Settings',
      `Updated risk settings (PDT floor ${formatCurrency(state.riskSettings.pdtFloor)}, route ${state.riskSettings.defaultRoute}).`
    );
    res.json(await buildPortfolioPayload());
  });

  // Clear audit log
  app.delete('/api/logs', requireControlGuard, async (_req, res) => {
    state.logs = [];
    res.json(await buildPortfolioPayload());
  });

  // Automated 4-Sleeve Trading Loop Engine (live market data -> real signals -> paper broker orders)
  const autoEngine = new AutoTradingEngine({
    getAlpacaCredentials,
    fetchAlpacaJson,
    syncBeforeCycle: async () => {
      await buildPortfolioPayload();
    },
    getCurrentState: () => {
      const currentMetrics = computePortfolioMetrics(
        state.holdings,
        state.snapshot,
        state.riskSettings
      );
      return {
        holdings: state.holdings,
        equityUsd: currentMetrics.totalEquity,
        pdtBreach: currentMetrics.pdtStatus === 'Breach',
        killSwitchEngaged: state.killSwitchEngaged,
        approvalsPaused: state.approvalsPaused,
        riskSettings: state.riskSettings,
        armedSleeveIds: new Set(
          state.sleeves.filter((s) => s.armed).map((s) => s.id)
        ),
        simulatedFaults: state.simulatedFaults,
      };
    },
    appendLog,
    recordLocalPaperOrder: ({ symbol, side, qty, price }) => {
      const created: WorkingOrder = {
        id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        symbol,
        side,
        qty,
        limitPrice: roundToCents(price),
        orderType: 'MKT',
        tif: symbol.includes('/') ? 'GTC' : 'DAY',
        route: state.riskSettings.defaultRoute,
        timestamp: formatTimeNow(),
        status: state.approvalsPaused ? 'Staged' : 'Working',
      };
      state.workingOrders = [created, ...state.workingOrders];
    },
  });
  autoEngine.startHeartbeat();

  app.get('/api/engine/status', (_req, res) => {
    res.json(autoEngine.getStatus());
  });

  app.post('/api/engine/config', requireControlGuard, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const next = autoEngine.updateConfig({
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      executionMode:
        body.executionMode === 'dry_run' || body.executionMode === 'live_paper'
          ? body.executionMode
          : undefined,
      intervalMinutes:
        typeof body.intervalMinutes === 'number' ? body.intervalMinutes : undefined,
      perSleeveAllocationPct:
        typeof body.perSleeveAllocationPct === 'number'
          ? body.perSleeveAllocationPct
          : undefined,
      maxTradeNotionalUsd:
        typeof body.maxTradeNotionalUsd === 'number'
          ? body.maxTradeNotionalUsd
          : undefined,
      enabledSleeves:
        body.enabledSleeves && typeof body.enabledSleeves === 'object'
          ? (body.enabledSleeves as {
              'sleeve-a': boolean;
              'sleeve-b': boolean;
              'sleeve-c': boolean;
              'sleeve-d': boolean;
            })
          : undefined,
    });
    res.json(next);
  });

  app.post('/api/engine/run', requireControlGuard, async (req, res) => {
    const rawTarget = String(req.body?.sleeve ?? 'all');
    const validTargets = new Set(['all', 'sleeve-a', 'sleeve-b', 'sleeve-c', 'sleeve-d']);
    const target = (
      validTargets.has(rawTarget) ? rawTarget : 'all'
    ) as 'all' | 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d';

    try {
      const engine = await autoEngine.runCycle('manual', target);
      const portfolio = await buildPortfolioPayload();
      res.json({ engine, portfolio });
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Cycle execution failed.',
      });
    }
  });

  // Secured external 24/7 cron endpoint (GitHub Actions / Cloud Scheduler)
  app.post('/api/engine/cron', async (req, res) => {
    const authCheck = verifyCronBearerToken(req.get('Authorization'));
    if (!authCheck.configured) {
      res.status(503).json({
        error: 'ENGINE_CRON_SECRET is not configured in server secrets.',
      });
      return;
    }
    if (!authCheck.authorized) {
      res.status(401).json({ error: 'Invalid cron authorization token.' });
      return;
    }

    const rawTarget = String(req.body?.sleeve ?? 'all');
    const validTargets = new Set(['all', 'sleeve-a', 'sleeve-b', 'sleeve-c', 'sleeve-d']);
    const target = (
      validTargets.has(rawTarget) ? rawTarget : 'all'
    ) as 'all' | 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d';

    try {
      const engine = await autoEngine.runCycle('cron', target);
      res.json({ ok: true, engine });
    } catch (err) {
      res.status(409).json({
        error: err instanceof Error ? err.message : 'Cron cycle skipped.',
      });
    }
  });

  // Frontend serving: Vite middleware in development, static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Titan Quant Express gateway listening on http://0.0.0.0:${port}`);
  });
}

startServer();
