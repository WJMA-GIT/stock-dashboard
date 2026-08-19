import test from 'node:test';
import assert from 'node:assert/strict';
import { getComparableTradingTime, sumMinuteAmount } from '../src/services/marketAmountComparison.ts';

test('maps clock time to comparable A-share trading time', () => {
  assert.equal(getComparableTradingTime(9, 20), null);
  assert.equal(getComparableTradingTime(10, 15), '10:15');
  assert.equal(getComparableTradingTime(12, 0), '11:30');
  assert.equal(getComparableTradingTime(15, 30), '15:00');
});

test('sums only the requested date up to the comparison time', () => {
  const rows = [
    { time: '2026-08-18 09:30', amount: 100 },
    { time: '2026-08-18 09:31', amount: 200 },
    { time: '2026-08-18 09:32', amount: null },
    { time: '2026-08-19 09:30', amount: 999 },
  ];
  assert.equal(sumMinuteAmount(rows, '2026-08-18', '09:31'), 300);
});
