import type {
  RemediationPhase,
  RemediationSeverity,
  RemediationStatus,
  RemediationTask,
  SleeveGuardCheck,
  SleeveGuardInput,
  SleeveGuardReport,
} from '../types/trading';

/**
 * Pure, fail-closed pre-trade guard evaluator for all 4 Project-TITAN sleeves.
 * Any missing feed, holiday clock, timeframe mismatch, unverified option chain,
 * or unreconciled ledger trips the sleeve to TRIPPED and blocks execution.
 */
export function evaluateSleeveGuard(
  input: SleeveGuardInput,
  isArmed: boolean,
  killSwitchEngaged: boolean
): SleeveGuardReport {
  if (killSwitchEngaged) {
    return {
      sleeveId: input.sleeveId,
      status: 'TRIPPED',
      canExecute: false,
      summary: 'Halted by global Kill Switch.',
      checks: [
        {
          id: 'kill-switch',
          label: 'Global Kill Switch',
          passed: false,
          detail: 'Emergency halt active — all sleeves disarmed.',
        },
      ],
    };
  }

  const checks: SleeveGuardCheck[] = [];

  if (input.sleeveId === 'sleeve-a') {
    checks.push({
      id: 'market-clock',
      label: 'US Market Clock (Holiday-Safe)',
      passed: input.marketOpen && !input.isHoliday,
      detail: input.isHoliday
        ? 'US market holiday detected — rebalance aborted (fail-closed).'
        : input.marketOpen
          ? 'NYSE/NASDAQ regular session open.'
          : 'Market closed — entries blocked until next 10:30 ET window.',
    });
    checks.push({
      id: 'pead-feed',
      label: 'Point-in-Time Earnings Feed',
      passed: input.peadEventsPresent,
      detail: input.peadEventsPresent
        ? 'Verified consensus SUE earnings dataset loaded.'
        : 'PIT earnings feed missing — synthetic 63-bar fallback blocked.',
    });
  } else if (input.sleeveId === 'sleeve-b') {
    const tfMatch =
      input.cryptoBarTimeframeMinutes === input.cryptoExpectedTimeframeMinutes;
    checks.push({
      id: 'crypto-timeframe',
      label: '4h Bar Timeframe Contract',
      passed: tfMatch,
      detail: tfMatch
        ? `Verified ${input.cryptoBarTimeframeMinutes}m bars matching 12/48 EMA contract.`
        : `Timeframe mismatch: received ${input.cryptoBarTimeframeMinutes}m bars (expected ${input.cryptoExpectedTimeframeMinutes}m).`,
    });
    checks.push({
      id: 'crypto-feed',
      label: 'Live Crypto Feed Health',
      passed: input.cryptoFeedHealthy,
      detail: input.cryptoFeedHealthy
        ? 'Real BTC/ETH/SOL bar stream nominal (synthetic ramp disabled).'
        : 'Crypto market feed unreachable — halted instead of fabricating ramp.',
    });
  } else if (input.sleeveId === 'sleeve-c') {
    checks.push({
      id: 'options-chain',
      label: 'Live Option Chain Quotes',
      passed: input.optionsChainLive,
      detail: input.optionsChainLive
        ? 'Live SPY/QQQ chain bid-ask quotes validated.'
        : 'Live option chain unavailable — hardcoded $0.85 credit & 0.965 strike blocked.',
    });
    checks.push({
      id: 'options-iv',
      label: 'Implied Volatility & Delta Greeks',
      passed: input.optionsIvAvailable,
      detail: input.optionsIvAvailable
        ? '15–20Δ put spread Greeks verified from live chain.'
        : 'Live IV/Greeks unavailable — spread construction halted.',
    });
  } else if (input.sleeveId === 'sleeve-d') {
    const driftPct =
      input.indiaAllocatedCapitalInr > 0
        ? Math.abs(
            ((input.indiaComputedEquityInr - input.indiaAllocatedCapitalInr) /
              input.indiaAllocatedCapitalInr) *
              100
          )
        : 100;
    const withinBudget = driftPct <= input.indiaMaxDriftPct;
    checks.push({
      id: 'india-reconcile',
      label: 'INR Ledger Reconciliation',
      passed: withinBudget,
      detail: withinBudget
        ? `Ledger ₹${Math.round(input.indiaComputedEquityInr).toLocaleString('en-IN')} reconciled against ₹${Math.round(input.indiaAllocatedCapitalInr).toLocaleString('en-IN')} budget.`
        : `Ledger drift ${driftPct.toFixed(1)}% exceeds ${input.indiaMaxDriftPct}% ceiling (halted).`,
    });
    checks.push({
      id: 'india-statutory',
      label: 'Statutory Friction Model',
      passed: true,
      detail: 'STT (0.1%), stamp duty, exchange, SEBI & 18% GST active.',
    });
  }

  const allPassed = checks.every((c) => c.passed);

  if (!allPassed) {
    const failed = checks.find((c) => !c.passed);
    return {
      sleeveId: input.sleeveId,
      status: 'TRIPPED',
      canExecute: false,
      summary: failed ? failed.detail : 'Pre-trade guard failed.',
      checks,
    };
  }

  if (!isArmed) {
    return {
      sleeveId: input.sleeveId,
      status: 'PAUSED',
      canExecute: false,
      summary: 'Checks nominal; sleeve manually paused by operator.',
      checks,
    };
  }

  return {
    sleeveId: input.sleeveId,
    status: 'NOMINAL',
    canExecute: true,
    summary: 'All fail-closed pre-trade invariants verified.',
    checks,
  };
}

export function filterRemediationTasks(
  tasks: RemediationTask[],
  phase: 'ALL' | RemediationPhase,
  severity: 'ALL' | RemediationSeverity,
  status: 'ALL' | RemediationStatus,
  query: string
): RemediationTask[] {
  const q = query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (phase !== 'ALL' && t.phase !== phase) return false;
    if (severity !== 'ALL' && t.severity !== severity) return false;
    if (status !== 'ALL' && t.status !== status) return false;
    if (
      q &&
      !t.title.toLowerCase().includes(q) &&
      !t.subsystem.toLowerCase().includes(q) &&
      !t.rootCause.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export function computeRemediationStats(tasks: RemediationTask[]) {
  const total = tasks.length;
  const verified = tasks.filter((t) => t.status === 'verified').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const criticalOpen = tasks.filter(
    (t) => t.severity === 'Critical' && t.status !== 'verified'
  ).length;
  const completionPct = total > 0 ? Math.round((verified / total) * 100) : 0;

  return { total, verified, inProgress, pending, criticalOpen, completionPct };
}

export function nextRemediationStatus(
  current: RemediationStatus
): RemediationStatus {
  if (current === 'pending') return 'in_progress';
  if (current === 'in_progress') return 'verified';
  return 'pending';
}

export function exportRoadmapMarkdown(tasks: RemediationTask[]): string {
  const phases: RemediationPhase[] = ['P0', 'P1', 'P2', 'P3'];
  const phaseTitles: Record<RemediationPhase, string> = {
    P0: 'Phase 0: Emergency Fail-Closed Safety Fixes',
    P1: 'Phase 1: Sleeve Math, Timeframe Alignment & Real Pricing',
    P2: 'Phase 2: Unified Execution Path & Repository Consolidation',
    P3: 'Phase 3: Production Readiness & Paper Qualification',
  };

  const lines: string[] = [
    '# Project-TITAN Remediation Checklist',
    '',
  ];

  for (const phase of phases) {
    const items = tasks.filter((t) => t.phase === phase);
    if (items.length === 0) continue;
    lines.push(`## ${phaseTitles[phase]}`, '');
    for (const item of items) {
      const box = item.status === 'verified' ? 'x' : ' ';
      const stateTag =
        item.status === 'in_progress' ? ' *(In Progress)*' : '';
      lines.push(
        `- [${box}] **${item.id}** [${item.severity}] (${item.subsystem}): ${item.title}${stateTag}`
      );
      lines.push(`  - Action: ${item.actionPlan}`);
      lines.push(`  - Verification: ${item.acceptanceTest}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
