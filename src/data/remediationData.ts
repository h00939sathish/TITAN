import type { RemediationTask } from '../types/trading';

export const INITIAL_REMEDIATION_TASKS: RemediationTask[] = [
  // Phase 0: Emergency Fail-Closed Safety Fixes
  {
    id: 'REM-001',
    phase: 'P0',
    severity: 'Critical',
    subsystem: 'Scheduler & Market Clock',
    title: 'Abort rebalance on market holidays & closed clock',
    rootCause:
      'The rebalance scheduler logs a warning when Alpaca clock reports market closed, but continues straight into order dispatch instead of aborting.',
    actionPlan:
      'Enforce an early return / fail-closed guard whenever clock.is_open is false or a trading holiday is detected, logging a RISK skip event.',
    acceptanceTest:
      'Unit test with mock closed clock confirms 0 orders dispatched and explicit holiday skip audit record.',
    status: 'verified',
  },
  {
    id: 'REM-002',
    phase: 'P0',
    severity: 'Critical',
    subsystem: 'Sleeve B · Crypto',
    title: 'Remove synthetic linear bull-ramp fallback on API outage',
    rootCause:
      'Crypto bar fetching silently falls back to a fabricated upward price ramp (60000 + i*100) on rate-limit or network errors, generating bogus BUY signals.',
    actionPlan:
      'Replace synthetic fallback with fail-closed feed health checks that immediately trip Sleeve B to TRIPPED and block delta order generation.',
    acceptanceTest:
      'Simulating an Alpaca crypto data exception sets guard status to TRIPPED and produces zero orders.',
    status: 'verified',
  },
  {
    id: 'REM-003',
    phase: 'P0',
    severity: 'Critical',
    subsystem: 'Sleeve A · PEAD',
    title: 'Fail closed when point-in-time earnings events are missing',
    rootCause:
      'PEAD factor calculation silently falls back to fixed 63-bar calendar slices when events_df is missing, trading arbitrary price noise as earnings drift.',
    actionPlan:
      'Require verified PIT consensus earnings feed timestamps in live/paper execution; raise a hard GuardTripped error if missing or stale.',
    acceptanceTest:
      'Calling live rebalance with empty events_df halts Sleeve A without staging any equity orders.',
    status: 'in_progress',
  },
  {
    id: 'REM-004',
    phase: 'P0',
    severity: 'Critical',
    subsystem: 'Control Gateway',
    title: 'Protect Kill Switch and order mutations with server-side guards',
    rootCause:
      'Legacy local dashboard exposed POST /api/control/kill with raw innerHTML bindings and zero origin/header verification.',
    actionPlan:
      'Route all broker controls through an Express backend proxy enforcing custom request headers, same-origin checks, schema validation, and server-only secrets.',
    acceptanceTest:
      'Mutating requests missing required headers or valid order schemas return HTTP 400/403 before touching broker API.',
    status: 'verified',
  },

  // Phase 1: Sleeve Math, Timeframe Alignment & Real Pricing
  {
    id: 'REM-005',
    phase: 'P1',
    severity: 'Critical',
    subsystem: 'Sleeve B · Crypto',
    title: 'Align 4-hour bar timeframe and 12/48 EMA specification',
    rootCause:
      'Crypto engine expects 4-hour bars (12/48 EMA), dashboard displayed 12/26 EMA, while the bar fetcher requested 1-hour bars—causing 4x faster noisy turnover.',
    actionPlan:
      'Standardize bar aggregation and EMA parameters to a single shared contract (4h bars, 12/48 EMA) and verify bar spacing before signal computation.',
    acceptanceTest:
      'Guard engine trips immediately if incoming bar interval differs from 240 minutes.',
    status: 'verified',
  },
  {
    id: 'REM-006',
    phase: 'P1',
    severity: 'Critical',
    subsystem: 'Sleeve C · Options',
    title: 'Replace hardcoded SPY spread strikes, expiration, and $0.85 credit',
    rootCause:
      'Options engine hardcoded 2026-12-18 expiration, 0.965 strike approximation, $0.85 credit, and $580 fallback SPY price while claiming 86.4% win rate.',
    actionPlan:
      'Require live option chain snapshots (bid/ask spread, IV, real delta Greeks) before arming Sleeve C; block execution automatically when chain feed is absent.',
    acceptanceTest:
      'Sleeve C guard evaluates chain availability and IV; without live chain data it remains safely halted.',
    status: 'in_progress',
  },
  {
    id: 'REM-007',
    phase: 'P1',
    severity: 'High',
    subsystem: 'Sleeve D · India',
    title: 'Reconcile ₹1,00,000 capital budget and atomic INR ledger writes',
    rootCause:
      'Default budget was ₹1,00,000, but initial state seeded ₹1,78,540 cash plus ~₹3.2L of hardcoded NIFTY holdings (~₹5L total) in an unguarded JSON file.',
    actionPlan:
      'Enforce strict INR budget reconciliation (cash + mark-to-market holdings + statutory STT/GST/stamp duty within tolerance) and atomic temp-file-rename persistence.',
    acceptanceTest:
      'Guard engine trips if INR ledger equity drifts outside configured allocation tolerance.',
    status: 'in_progress',
  },
  {
    id: 'REM-008',
    phase: 'P1',
    severity: 'High',
    subsystem: 'Tournament & UI Math',
    title: 'Fix cost-basis P&L %, live mark vs. fill pricing, and order counts',
    rootCause:
      'Dashboard divided P&L by market_value instead of cost basis, duplicated Fill and Mark prices, hardcoded 0 unrealized P&L for Sleeves B/C, and displayed 0 active orders.',
    actionPlan:
      'Compute every position metric and KPI from one reconciled portfolio engine with exact cost-basis P&L % and live working-order counts.',
    acceptanceTest:
      'Unit test suite verifies Long/Short P&L, equity reconciliation, and PDT cushion to the cent.',
    status: 'verified',
  },

  // Phase 2: Single Execution Path & Repository Consolidation
  {
    id: 'REM-009',
    phase: 'P2',
    severity: 'High',
    subsystem: 'Core Architecture',
    title: 'Eliminate split-brain between Rust core and live Python path',
    rootCause:
      'Rust+PyO3 core and 1,196 tests were completely bypassed by the live Alpaca/tournament scripts, creating maintenance tax with zero runtime protection.',
    actionPlan:
      'Standardize live order validation, PDT compliance, and audit event recording onto a single unified execution gateway and archive unused split-brain adapters.',
    acceptanceTest:
      'Every live paper order and cancel passes through one audited risk & compliance pipeline.',
    status: 'pending',
  },
  {
    id: 'REM-010',
    phase: 'P2',
    severity: 'High',
    subsystem: 'Repository Hygiene',
    title: 'Archive 90+ legacy scripts and superseded research runners',
    rootCause:
      '983 files (90+ ad-hoc scripts, 29 ADRs, 13 root governance docs) sit alongside live trading entry points, obscuring which code actually executes.',
    actionPlan:
      'Move historical backtests, superseded experiment runners, and dead fixtures to an archive branch/folder so active live code stays under 25 clear modules.',
    acceptanceTest:
      'Root directory contains only active runtime, tests, and a single authoritative architecture guide.',
    status: 'pending',
  },
  {
    id: 'REM-011',
    phase: 'P2',
    severity: 'Medium',
    subsystem: 'Dashboard Packaging',
    title: 'Commit real dashboard server and remove HTML injection scripts',
    rootCause:
      'start_dashboard.py imported an uncommitted dashboard.server module, and inject_live_bindings.py mutated generated HTML with brittle string replacement.',
    actionPlan:
      'Replace string-injected HTML with a typed React + Express workspace backed by structured JSON API routes.',
    acceptanceTest:
      'Fresh clone starts cleanly on port 3000 with zero missing module imports.',
    status: 'verified',
  },

  // Phase 3: Production Readiness & Paper Qualification
  {
    id: 'REM-012',
    phase: 'P3',
    severity: 'High',
    subsystem: 'Qualification Gate',
    title: 'Run 60-day cost-attributed paper qualification per sleeve',
    rootCause:
      'Tournament sleeves were staged before recording real slippage, borrow fees, and out-of-sample paper Sharpe against pre-registered kill criteria.',
    actionPlan:
      'Log every fill with realized slippage bps, commissions/STT, and daily sleeve equity curve; auto-demote any sleeve breaching drawdown or Sharpe floors.',
    acceptanceTest:
      '60-day paper audit bundle matches pre-registered promotion thresholds before any live capital.',
    status: 'pending',
  },
  {
    id: 'REM-013',
    phase: 'P3',
    severity: 'Medium',
    subsystem: 'Broker Reconciliation',
    title: 'Add startup position & open-order reconciliation before arming',
    rootCause:
      'Process restarts or partial network drops can leave local state out of sync with Alpaca Paper open orders and positions.',
    actionPlan:
      'Query broker account, positions, and open orders on boot and before each rebalance cycle; halt automatically if unexpected discrepancies exceed threshold.',
    acceptanceTest:
      'Simulated orphan order on broker triggers reconciliation warning and blocks new entries until resolved.',
    status: 'pending',
  },
  {
    id: 'REM-014',
    phase: 'P3',
    severity: 'Medium',
    subsystem: 'Observability & Alerts',
    title: 'Add structured health endpoints and fail-closed Telegram alerts',
    rootCause:
      'Silent exception catches across scripts mask broken tokens (DhanHQ/Alpaca) and stale feeds until manual inspection.',
    actionPlan:
      'Expose /api/health with per-sleeve guard statuses and dispatch concise alerts only on guard trips, PDT threshold breaches, or kill-switch activations.',
    acceptanceTest:
      'Health endpoint reflects degraded state within 1 poll cycle when broker credentials or feeds fail.',
    status: 'pending',
  },
];
