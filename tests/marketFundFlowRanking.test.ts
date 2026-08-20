import assert from 'node:assert/strict';
import test from 'node:test';
import { rankMarketFundFlows } from '../src/pages/Dashboard/marketFundFlowRanking.ts';

test('市场资金流榜支持净流入、净流出和大单净流入排序且不修改原数组', () => {
  const rows = [
    { code: 'a', mainNetInflow: 20, largeNetInflow: -5 },
    { code: 'b', mainNetInflow: -30, largeNetInflow: 40 },
    { code: 'c', mainNetInflow: 10, largeNetInflow: 15 },
  ];
  const originalOrder = rows.map((row) => row.code);

  assert.deepEqual(rankMarketFundFlows(rows, 'netInflow').map((row) => row.code), ['a', 'c', 'b']);
  assert.deepEqual(rankMarketFundFlows(rows, 'netOutflow').map((row) => row.code), ['b', 'c', 'a']);
  assert.deepEqual(rankMarketFundFlows(rows, 'largeNetInflow').map((row) => row.code), ['b', 'c', 'a']);
  assert.deepEqual(rows.map((row) => row.code), originalOrder);
});
