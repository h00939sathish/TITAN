import test from 'node:test';
import assert from 'node:assert/strict';
import type { OhlcBar } from '../types/trading';
import {
  computeEma,
  computeMedianBarSpacingMinutes,
  evaluateCryptoEmaSignal,
  evaluateIndiaSleeveSignal,
  evaluateOptionsGateSignal,
  evaluateUsEquitySignal,
  isNseMarketOpen,
} from './strategyEngine';

function buildBars(count: number, spacingMinutes: number, startPrice: number, step: number): OhlcBar[] {
  const baseMs = Date.parse('2026-11-01T00:00:00Z');
  const bars: OhlcBar[] = [];
  for (let i = 0; i < count; i++) {
    const close = Math.max(1, startPrice + i * step);
    bars.push({
      timestamp: new Date(baseMs + i * spacingMinutes * 60000).toISOString(),
      open: close - step * 0.3,
      high: close + Math.abs(step) * 0.5 + 2,
      low: Math.max(0.5, close - Math.abs(step) * 0.5 - 2),
      close,
      volume: 1200 + i * 5,
    });
  }
  return bars;
}

test('computeEma tracks rising series with fast EMA above slow EMA', () => {
  const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 2);
  const ema12 = computeEma(prices, 12);
  const ema48 = computeEma(prices, 48);
  assert.equal(ema12.length, 60);
  assert.ok(ema12[59] > ema48[59]);
});

test('computeMedianBarSpacingMinutes detects 240m vs 60m bar contracts', () => {
  const bars4h = buildBars(60, 240, 60000, 100);
  const bars1h = buildBars(60, 60, 60000, 100);
  assert.equal(computeMedianBarSpacingMinutes(bars4h.map((b) => b.timestamp)), 240);
  assert.equal(computeMedianBarSpacingMinutes(bars1h.map((b) => b.timestamp)), 60);
});

test('evaluateCryptoEmaSignal blocks hourly bars fail-closed (REM-002)', () => {
  const hourlyBars = buildBars(65, 60, 80000, 150);
  const res = evaluateCryptoEmaSignal({
    symbol: 'BTC/USD',
    bars: hourlyBars,
    currentQty: 0,
    equityUsd: 100000,
    allocationPct: 5,
    maxTradeNotionalUsd: 10000,
    dataSource: 'Alpaca Crypto 4h',
  });
  assert.equal(res.action, 'BLOCKED');
  assert.equal(res.guardPassed, false);
  assert.match(res.reason, /REM-002/);
});

test('evaluateCryptoEmaSignal blocks insufficient bar history (< 55 bars)', () => {
  const shortBars = buildBars(40, 240, 80000, 150);
  const res = evaluateCryptoEmaSignal({
    symbol: 'ETH/USD',
    bars: shortBars,
    currentQty: 0,
    equityUsd: 100000,
    allocationPct: 5,
    maxTradeNotionalUsd: 10000,
    dataSource: 'Alpaca Crypto 4h',
  });
  assert.equal(res.action, 'BLOCKED');
  assert.equal(res.guardPassed, false);
});

test('evaluateCryptoEmaSignal emits BUY on rising 4h trend and respects maxTradeNotionalUsd', () => {
  const bars = buildBars(70, 240, 70000, 250);
  const res = evaluateCryptoEmaSignal({
    symbol: 'BTC/USD',
    bars,
    currentQty: 0,
    equityUsd: 100000,
    allocationPct: 8,
    maxTradeNotionalUsd: 2500,
    dataSource: 'Alpaca Crypto 4h',
  });
  assert.equal(res.action, 'BUY');
  assert.equal(res.guardPassed, true);
  assert.ok(res.targetNotionalUsd <= 2500);
  assert.ok(res.orderQty > 0);
});

test('evaluateCryptoEmaSignal emits SELL when EMA12 <= EMA48 and position is held', () => {
  const bars = buildBars(70, 240, 95000, -200);
  const res = evaluateCryptoEmaSignal({
    symbol: 'BTC/USD',
    bars,
    currentQty: 0.05,
    equityUsd: 100000,
    allocationPct: 5,
    maxTradeNotionalUsd: 10000,
    dataSource: 'Alpaca Crypto 4h',
  });
  assert.equal(res.action, 'SELL');
  assert.equal(res.guardPassed, true);
  assert.equal(res.orderQty, 0.05);
});

test('evaluateUsEquitySignal blocks fail-closed when US market is closed (REM-001)', () => {
  const bars = buildBars(35, 1440, 140, 1.5);
  const res = evaluateUsEquitySignal({
    symbol: 'NVDA',
    bars,
    currentQty: 0,
    equityUsd: 100000,
    allocationPct: 5,
    maxTradeNotionalUsd: 5000,
    marketOpen: false,
    isHoliday: false,
    dataSource: 'Polygon Daily',
  });
  assert.equal(res.action, 'BLOCKED');
  assert.equal(res.guardPassed, false);
  assert.match(res.reason, /REM-001/);
});

test('evaluateUsEquitySignal emits BUY on rising daily breakout when market is open', () => {
  const bars = buildBars(35, 1440, 100, 2);
  const res = evaluateUsEquitySignal({
    symbol: 'NVDA',
    bars,
    currentQty: 0,
    equityUsd: 100000,
    allocationPct: 5,
    maxTradeNotionalUsd: 5000,
    marketOpen: true,
    isHoliday: false,
    dataSource: 'Polygon Daily',
  });
  assert.equal(res.action, 'BUY');
  assert.equal(res.guardPassed, true);
  assert.ok(res.orderQty >= 1);
});

test('evaluateOptionsGateSignal blocks when live chain quotes or IV are missing (REM-006)', () => {
  const res = evaluateOptionsGateSignal({
    symbol: 'SPY',
    spotPrice: 585,
    liveContractsCount: 0,
    impliedVolPct: null,
    marketOpen: true,
    dataSource: 'Alpaca Options',
  });
  assert.equal(res.action, 'BLOCKED');
  assert.equal(res.guardPassed, false);
  assert.match(res.reason, /REM-006/);
});

test('evaluateIndiaSleeveSignal gates outside NSE IST session and verifies NSE hours helper', () => {
  // Saturday in IST -> closed
  assert.equal(isNseMarketOpen(new Date('2026-11-21T06:00:00Z')), false);
  // Monday 11:00 IST (05:30 UTC) -> open
  assert.equal(isNseMarketOpen(new Date('2026-11-23T05:30:00Z')), true);

  const res = evaluateIndiaSleeveSignal({
    dhanConfigured: true,
    dhanReachable: true,
    availableBalanceInr: 100000,
    capitalCapInr: 100000,
    maxDriftPct: 15,
    nseOpen: false,
  });
  assert.equal(res.action, 'BLOCKED');
  assert.equal(res.guardPassed, false);
});
