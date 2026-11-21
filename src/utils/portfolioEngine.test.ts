import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSparklineSeries,
  computeHoldingPnl,
  computePortfolioMetrics,
  filterHoldings,
  formatSignedCurrency,
  sortHoldings,
  validateBracketInput,
  validateOrderInput,
} from './portfolioEngine';
import {
  INITIAL_HOLDINGS,
  INITIAL_PORTFOLIO_SNAPSHOT,
  INITIAL_RISK_SETTINGS,
} from '../data/seedData';

test('computeHoldingPnl accurately computes SHORT and LONG P&L', () => {
  const amat = computeHoldingPnl(INITIAL_HOLDINGS[0]); // SHORT 62 @ 332.17, mark 309.90
  assert.equal(amat.signedQty, -62);
  assert.equal(amat.unrealizedPnl, 1380.74);
  assert.equal(amat.pnlPercent, 6.7);

  const spy = computeHoldingPnl(INITIAL_HOLDINGS[7]); // LONG 7 @ 712.70, mark 673.10
  assert.equal(spy.signedQty, 7);
  assert.equal(spy.unrealizedPnl, -277.2);
  assert.equal(spy.pnlPercent, -5.56);
});

test('computePortfolioMetrics reconciles equity, today P&L, and PDT cushion', () => {
  const metrics = computePortfolioMetrics(
    INITIAL_HOLDINGS,
    INITIAL_PORTFOLIO_SNAPSHOT,
    INITIAL_RISK_SETTINGS
  );

  assert.equal(metrics.totalEquity, 102297.83);
  assert.equal(metrics.todayPnl, 1047.9);
  assert.equal(metrics.todayPnlPct, 1.03);
  assert.equal(metrics.pdtStatus, 'Safe');
  assert.equal(metrics.pdtCushion, 77297.83);
  assert.equal(metrics.pacingPct, 100);
});

test('computePortfolioMetrics flags PDT Breach when equity drops below floor', () => {
  const metrics = computePortfolioMetrics(
    [],
    { ...INITIAL_PORTFOLIO_SNAPSHOT, baseEquity: 22000, realizedPnlToday: 0 },
    INITIAL_RISK_SETTINGS
  );
  assert.equal(metrics.pdtStatus, 'Breach');
  assert.equal(metrics.pdtCushion, -3000);
});

test('sortHoldings and filterHoldings work across ticker, P&L, and side', () => {
  const enriched = INITIAL_HOLDINGS.map(computeHoldingPnl);

  const shorts = filterHoldings(enriched, 'SHORT', '');
  assert.equal(shorts.length, 3);
  assert.deepEqual(
    shorts.map((h) => h.symbol),
    ['AMAT', 'QCOM', 'BAC']
  );

  const searched = filterHoldings(enriched, 'ALL', 'goo');
  assert.equal(searched.length, 1);
  assert.equal(searched[0].symbol, 'GOOGL');

  const byTickerAsc = sortHoldings(enriched, 'ticker', 'asc');
  assert.equal(byTickerAsc[0].symbol, 'AMAT');
  assert.equal(byTickerAsc[byTickerAsc.length - 1].symbol, 'TLT');

  const byPnlDesc = sortHoldings(enriched, 'pnlDollar', 'desc');
  assert.equal(byPnlDesc[0].symbol, 'AMAT');
  assert.equal(byPnlDesc[byPnlDesc.length - 1].symbol, 'SPY');
});

test('validateOrderInput rejects invalid ticker, qty, price, and notional breaches', () => {
  const emptyResult = validateOrderInput(
    { symbol: '', side: 'BUY', qty: '', limitPrice: '' },
    50000
  );
  assert.equal(emptyResult.valid, false);
  assert.ok(emptyResult.errors.symbol);
  assert.ok(emptyResult.errors.qty);
  assert.ok(emptyResult.errors.limitPrice);

  const overLimit = validateOrderInput(
    { symbol: 'NVDA', side: 'BUY', qty: '500', limitPrice: '150' },
    50000
  );
  assert.equal(overLimit.valid, false);
  assert.ok(overLimit.errors.notional);

  const validOrder = validateOrderInput(
    { symbol: ' nvda ', side: 'BUY', qty: '10', limitPrice: '135.5' },
    50000
  );
  assert.equal(validOrder.valid, true);
  assert.deepEqual(validOrder.parsed, {
    symbol: 'NVDA',
    side: 'BUY',
    qty: 10,
    limitPrice: 135.5,
  });
});

test('validateBracketInput enforces directional stop-loss and take-profit bounds', () => {
  const badLongSl = validateBracketInput('200', '220', 'LONG', 180);
  assert.equal(badLongSl.valid, false);

  const goodLong = validateBracketInput('170', '210', 'LONG', 180);
  assert.equal(goodLong.valid, true);
  assert.equal(goodLong.stopLoss, 170);
  assert.equal(goodLong.takeProfit, 210);

  const badShortTp = validateBracketInput('340', '330', 'SHORT', 310);
  assert.equal(badShortTp.valid, false);
});

test('formatSignedCurrency formats positive, negative, and zero cleanly', () => {
  assert.equal(formatSignedCurrency(1047.9), '+$1,047.90');
  assert.equal(formatSignedCurrency(-197.1), '-$197.10');
  assert.equal(formatSignedCurrency(0), '$0.00');
});

test('buildSparklineSeries maps intradayEquityCurve with market timestamps and open delta', () => {
  assert.deepEqual(buildSparklineSeries([]), []);

  const series = buildSparklineSeries([101155, 101280, 101100]);
  assert.equal(series.length, 3);
  assert.deepEqual(series[0], {
    index: 0,
    timeLabel: '09:30 ET',
    equity: 101155,
    deltaFromOpen: 0,
  });
  assert.deepEqual(series[1], {
    index: 1,
    timeLabel: '09:40 ET',
    equity: 101280,
    deltaFromOpen: 125,
  });
  assert.deepEqual(series[2], {
    index: 2,
    timeLabel: '09:50 ET',
    equity: 101100,
    deltaFromOpen: -55,
  });
});
