import assert from 'node:assert/strict';
import test from 'node:test';
import { rankUSQuotes } from '../src/pages/Markets/usMarketRanking.ts';

const quotes = [
  { code: 'A', changePercent: 2, amount: 10 },
  { code: 'B', changePercent: -3, amount: 30 },
  { code: 'C', changePercent: 1, amount: 20 },
];

test('美股榜单按涨跌幅和成交额排序且不改动原数组', () => {
  assert.deepEqual(rankUSQuotes(quotes, 'rise').map((item) => item.code), ['A', 'C', 'B']);
  assert.deepEqual(rankUSQuotes(quotes, 'fall').map((item) => item.code), ['B', 'C', 'A']);
  assert.deepEqual(rankUSQuotes(quotes, 'amount', 2).map((item) => item.code), ['B', 'C']);
  assert.equal(quotes[0].code, 'A');
});
