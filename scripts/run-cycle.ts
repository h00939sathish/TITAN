import 'dotenv/config';
import fs from 'node:fs';
import { AutoTradingEngine } from '../src/server/autoTradingEngine.ts';
import type { Holding, RiskSettings } from '../src/types/trading.ts';

type TargetSleeve = 'all' | 'sleeve-a' | 'sleeve-b' | 'sleeve-c' | 'sleeve-d';
type RunMode = 'dry_run' | 'live_paper';

const VALID_SLEEVES = new Set<TargetSleeve>([
  'all',
  'sleeve-a',
  'sleeve-b',
  'sleeve-c',
  'sleeve-d',
]);

function parseArgs(): {
  sleeve: TargetSleeve;
  mode: RunMode;
  maxNotional: number;
  allocationPct: number;
} {
  let sleeve: TargetSleeve = 'all';
  let mode: RunMode =
    (process.env.ENGINE_DEFAULT_MODE || '').trim() === 'live_paper'
      ? 'live_paper'
      : 'dry_run';
  let maxNotional = 2500;
  let allocationPct = 5;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--sleeve=')) {
      const v = arg.slice('--sleeve='.length) as TargetSleeve;
      if (VALID_SLEEVES.has(v)) sleeve = v;
    } else if (arg.startsWith('--mode=')) {
      const v = arg.slice('--mode='.length);
      if (v === 'live_paper' || v === 'dry_run') mode = v;
    } else if (arg.startsWith('--cap=')) {
      const n = Number(arg.slice('--cap='.length));
      if (Number.isFinite(n) && n >= 100 && n <= 50000) maxNotional = Math.round(n);
    } else if (arg.startsWith('--alloc=')) {
      const n = Number(arg.slice('--alloc='.length));
      if (Number.isFinite(n) && n >= 1 && n <= 25) allocationPct = Math.round(n);
    }
  }

  return { sleeve, mode, maxNotional, allocationPct };
}

function getSafePaperCreds() {
  const keyId = (process.env.APCA_API_KEY_ID || '').trim();
  const secretKey = (process.env.APCA_API_SECRET_KEY || '').trim();
  // Hard fail-closed lock: standalone headless cron strictly targets Alpaca Paper API
  const rawBase = (
    process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets'
  ).trim();
  const baseUrl =
    rawBase === 'https://paper-api.alpaca.markets'
      ? rawBase
      : 'https://paper-api.alpaca.markets';

  return {
    configured: Boolean(keyId && secretKey),
    keyId,
    secretKey,
    baseUrl,
  };
}

async function fetchAlpacaPaperJson(endpointPath: string, init?: RequestInit) {
  const creds = getSafePaperCreds();
  if (!creds.configured) {
    throw new Error('APCA_API_KEY_ID / APCA_API_SECRET_KEY not configured.');
  }
  const res = await fetch(`${creds.baseUrl}${endpointPath}`, {
    ...init,
    signal: AbortSignal.timeout(8000),
    headers: {
      'APCA-API-KEY-ID': creds.keyId,
      'APCA-API-SECRET-KEY': creds.secretKey,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Alpaca HTTP ${res.status} on ${endpointPath}`);
  }
  if (res.status === 204) return null;
  return await res.json();
}

async function main() {
  const { sleeve, mode, maxNotional, allocationPct } = parseArgs();
  const creds = getSafePaperCreds();

  if (!creds.configured && mode === 'live_paper') {
    console.error(
      'ERROR: APCA_API_KEY_ID and APCA_API_SECRET_KEY must be set in GitHub Secrets for live_paper mode.'
    );
    process.exit(1);
  }

  let liveEquityUsd = 100000;
  let liveHoldings: Holding[] = [];

  const riskSettings: RiskSettings = {
    pdtFloor: 25000,
    maintenanceCallFloorPct: 45,
    maxOrderNotional: maxNotional,
    defaultRoute: 'SIP-DIRECT',
    autoHedgeEnabled: false,
    paperMode: true,
  };

  const engine = new AutoTradingEngine({
    getAlpacaCredentials: getSafePaperCreds,
    fetchAlpacaJson: fetchAlpacaPaperJson,
    syncBeforeCycle: async () => {
      if (!creds.configured) return;
      const [account, positions] = await Promise.all([
        fetchAlpacaPaperJson('/v2/account') as Promise<Record<string, unknown>>,
        fetchAlpacaPaperJson('/v2/positions') as Promise<Record<string, unknown>[]>,
      ]);
      const eq = Number(account?.equity ?? 100000);
      if (Number.isFinite(eq) && eq > 0) {
        liveEquityUsd = eq;
      }
      if (Array.isArray(positions)) {
        liveHoldings = positions.map((p, idx) => {
          const rawQty = Number(p.qty || 0);
          return {
            id: `alpaca-pos-${String(p.symbol || idx)}`,
            symbol: String(p.symbol || '').toUpperCase(),
            assetClass: String(p.asset_class || '').includes('etf')
              ? 'ETF'
              : 'Equity',
            sleeveId: 'sleeve-a',
            side:
              rawQty < 0 || String(p.side).toLowerCase() === 'short'
                ? 'SHORT'
                : 'LONG',
            qty: Math.abs(rawQty),
            fillPrice: Number(p.avg_entry_price || 0),
            markPrice: Number(p.current_price || 0),
          };
        });
      }
    },
    getCurrentState: () => ({
      holdings: liveHoldings,
      equityUsd: liveEquityUsd,
      pdtBreach: liveEquityUsd < riskSettings.pdtFloor,
      killSwitchEngaged: false,
      approvalsPaused: false,
      riskSettings,
      armedSleeveIds: new Set(['sleeve-a', 'sleeve-b', 'sleeve-c', 'sleeve-d']),
      simulatedFaults: {},
    }),
    appendLog: (level, mod, message) => {
      console.log(`[${new Date().toISOString()}] [${level}] [${mod}] ${message}`);
    },
    recordLocalPaperOrder: ({ symbol, side, qty, price }) => {
      console.log(
        `[LOCAL-PAPER] ${side} ${qty} ${symbol} @ ~$${price.toFixed(2)}`
      );
    },
  });

  engine.updateConfig({
    executionMode: mode,
    maxTradeNotionalUsd: maxNotional,
    perSleeveAllocationPct: allocationPct,
  });

  console.log(
    `\n=== Titan Quant Standalone 24/7 Runner | Sleeve: ${sleeve} | Mode: ${mode} | Cap: $${maxNotional} ===\n`
  );

  const status = await engine.runCycle('cron', sleeve, mode);

  console.log(
    `Live Account Equity: $${liveEquityUsd.toFixed(2)} | Open Positions: ${liveHoldings.length} | Orders Submitted: ${status.totalOrdersSubmitted}\n`
  );

  const rows = status.latestSignals.map((s) => ({
    Sleeve: s.sleeveCode,
    Symbol: s.symbol,
    Feed: `${s.dataSource} (${s.barCount})`,
    Price: s.lastPrice !== null ? Number(s.lastPrice.toFixed(2)) : null,
    Signal: s.indicatorSummary,
    Decision: s.action,
    Qty: s.orderQty,
    Guard: s.guardPassed ? 'PASS' : 'TRIPPED',
  }));
  console.table(rows);

  // Write clean Markdown summary when running inside GitHub Actions
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const mdLines = [
      `## Titan Quant 24/7 Paper Cycle (\`${mode}\` · \`${sleeve}\`)`,
      '',
      `- **UTC Time:** ${status.lastRunAtUtc}`,
      `- **Alpaca Paper Equity:** $${liveEquityUsd.toFixed(2)} (${liveHoldings.length} open positions)`,
      `- **Orders Submitted:** ${status.totalOrdersSubmitted}`,
      '',
      '| Sleeve | Symbol | Feed | Last Price | Indicator | Decision | Guard | Detail |',
      '| :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- |',
      ...status.latestSignals.map((s) => {
        const px =
          s.lastPrice !== null
            ? s.sleeveId === 'sleeve-d'
              ? `₹${Math.round(s.lastPrice).toLocaleString('en-IN')}`
              : `$${s.lastPrice.toFixed(2)}`
            : '—';
        return `| ${s.sleeveCode} | **${s.symbol}** | ${s.dataSource} (${s.barCount}) | ${px} | ${s.indicatorSummary} | **${s.action}** | ${s.guardPassed ? 'PASS' : 'BLOCKED'} | ${s.reason} |`;
      }),
      '',
    ];
    fs.appendFileSync(summaryPath, mdLines.join('\n'));
  }
}

main().catch((err) => {
  console.error('Fatal runner error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
