import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQualificationSummary,
  INITIAL_QUALIFICATION_ENTRIES,
  validateQualificationInput,
} from './qualificationEngine';

test('validateQualificationInput accepts valid session payload and enforces blueprint bounds', () => {
  const ok = validateQualificationInput({
    date: '2026-11-22',
    dayNumber: '4',
    equityUsd: '103100.45',
    dailyPnlUsd: '802.62',
    netSharpe: '1.92',
    maxDrawdownPct: '1.4',
    slippageCostUsd: '19.50',
    guardTripsCount: '0',
    allGuardsNominal: true,
    notes: 'Clean paper session',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.parsed?.entryId, '2026-11-22');
  assert.equal(ok.parsed?.equityUsd, 103100.45);

  const bad = validateQualificationInput({
    date: '11/22/2026',
    dayNumber: '0',
    equityUsd: '-50',
    dailyPnlUsd: 'NaN',
    netSharpe: '99',
    maxDrawdownPct: '150',
    slippageCostUsd: '-5',
    guardTripsCount: '-1',
    allGuardsNominal: false,
    notes: 'x'.repeat(501),
  });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.date);
  assert.ok(bad.errors.dayNumber);
  assert.ok(bad.errors.equityUsd);
  assert.ok(bad.errors.netSharpe);
  assert.ok(bad.errors.maxDrawdownPct);
  assert.ok(bad.errors.notes);
});

test('computeQualificationSummary evaluates 60-day live-capital readiness gates accurately', () => {
  const summary = computeQualificationSummary(INITIAL_QUALIFICATION_ENTRIES, 60);
  assert.equal(summary.totalLoggedDays, 3);
  assert.equal(summary.nominalDays, 3);
  assert.equal(summary.progressPct, 5);
  assert.equal(summary.daysGatePassed, false);
  assert.equal(summary.sharpeGatePassed, true);
  assert.equal(summary.drawdownGatePassed, true);
  assert.equal(summary.qualifiedForLive, false);

  const qualified = computeQualificationSummary(INITIAL_QUALIFICATION_ENTRIES, 3);
  assert.equal(qualified.daysGatePassed, true);
  assert.equal(qualified.qualifiedForLive, true);
});
