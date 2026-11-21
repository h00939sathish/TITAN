import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRemediationStats,
  evaluateSleeveGuard,
  exportRoadmapMarkdown,
  filterRemediationTasks,
  nextRemediationStatus,
} from './guardEngine';
import { INITIAL_REMEDIATION_TASKS } from '../data/remediationData';
import type { SleeveGuardInput } from '../types/trading';

const NOMINAL_INPUT: SleeveGuardInput = {
  sleeveId: 'sleeve-a',
  marketOpen: true,
  isHoliday: false,
  peadEventsPresent: true,
  cryptoBarTimeframeMinutes: 240,
  cryptoExpectedTimeframeMinutes: 240,
  cryptoFeedHealthy: true,
  optionsChainLive: true,
  optionsIvAvailable: true,
  indiaAllocatedCapitalInr: 100000,
  indiaComputedEquityInr: 101673,
  indiaMaxDriftPct: 15,
};

test('Sleeve A trips fail-closed on US market holiday or missing PEAD events', () => {
  const holidayReport = evaluateSleeveGuard(
    { ...NOMINAL_INPUT, sleeveId: 'sleeve-a', isHoliday: true, marketOpen: false },
    true,
    false
  );
  assert.equal(holidayReport.status, 'TRIPPED');
  assert.equal(holidayReport.canExecute, false);

  const missingPead = evaluateSleeveGuard(
    { ...NOMINAL_INPUT, sleeveId: 'sleeve-a', peadEventsPresent: false },
    true,
    false
  );
  assert.equal(missingPead.status, 'TRIPPED');
  assert.equal(missingPead.canExecute, false);
});

test('Sleeve B trips fail-closed on 1h vs 4h bar mismatch or unhealthy feed', () => {
  const mismatch = evaluateSleeveGuard(
    { ...NOMINAL_INPUT, sleeveId: 'sleeve-b', cryptoBarTimeframeMinutes: 60 },
    true,
    false
  );
  assert.equal(mismatch.status, 'TRIPPED');
  assert.equal(mismatch.canExecute, false);

  const outage = evaluateSleeveGuard(
    { ...NOMINAL_INPUT, sleeveId: 'sleeve-b', cryptoFeedHealthy: false },
    true,
    false
  );
  assert.equal(outage.status, 'TRIPPED');
  assert.equal(outage.canExecute, false);
});

test('Sleeve C trips fail-closed when live options chain or IV is unavailable', () => {
  const noChain = evaluateSleeveGuard(
    { ...NOMINAL_INPUT, sleeveId: 'sleeve-c', optionsChainLive: false },
    true,
    false
  );
  assert.equal(noChain.status, 'TRIPPED');
  assert.equal(noChain.canExecute, false);
});

test('Sleeve D trips fail-closed when INR ledger drifts beyond allocation cap', () => {
  const nominal = evaluateSleeveGuard(
    { ...NOMINAL_INPUT, sleeveId: 'sleeve-d', indiaComputedEquityInr: 101673 },
    true,
    false
  );
  assert.equal(nominal.status, 'NOMINAL');
  assert.equal(nominal.canExecute, true);

  const drift = evaluateSleeveGuard(
    { ...NOMINAL_INPUT, sleeveId: 'sleeve-d', indiaComputedEquityInr: 500000 },
    true,
    false
  );
  assert.equal(drift.status, 'TRIPPED');
  assert.equal(drift.canExecute, false);
});

test('Global Kill Switch overrides all sleeves to TRIPPED', () => {
  const report = evaluateSleeveGuard(NOMINAL_INPUT, true, true);
  assert.equal(report.status, 'TRIPPED');
  assert.equal(report.canExecute, false);
});

test('Remediation roadmap filtering, status cycling, stats, and Markdown export work cleanly', () => {
  const p0Tasks = filterRemediationTasks(
    INITIAL_REMEDIATION_TASKS,
    'P0',
    'ALL',
    'ALL',
    ''
  );
  assert.equal(p0Tasks.length, 4);

  const stats = computeRemediationStats(INITIAL_REMEDIATION_TASKS);
  assert.equal(stats.total, 14);
  assert.ok(stats.completionPct >= 0 && stats.completionPct <= 100);

  assert.equal(nextRemediationStatus('pending'), 'in_progress');
  assert.equal(nextRemediationStatus('in_progress'), 'verified');
  assert.equal(nextRemediationStatus('verified'), 'pending');

  const md = exportRoadmapMarkdown(INITIAL_REMEDIATION_TASKS);
  assert.ok(md.includes('# Project-TITAN Remediation Checklist'));
  assert.ok(md.includes('REM-001'));
  assert.ok(md.includes('REM-014'));
});
