import assert from 'node:assert/strict';
import test from 'node:test';
import { splitFundFlowRanks } from '../src/pages/Rankings/fundFlowRanking.ts';

test('splits the largest inflows and outflows without mutating the source', () => {
  const rows = [
    { code: 'flat', mainNetInflow: 0 },
    { code: 'out-1', mainNetInflow: -20 },
    { code: 'in-2', mainNetInflow: 10 },
    { code: 'missing', mainNetInflow: null },
    { code: 'in-1', mainNetInflow: 30 },
    { code: 'out-2', mainNetInflow: -50 },
  ];
  const originalOrder = rows.map((row) => row.code);

  const result = splitFundFlowRanks(rows, 2);

  assert.deepEqual(result.inflows.map((row) => row.code), ['in-1', 'in-2']);
  assert.deepEqual(result.outflows.map((row) => row.code), ['out-2', 'out-1']);
  assert.deepEqual(rows.map((row) => row.code), originalOrder);
});

test('defaults to the top 50 rows on each side', () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({
    code: String(index),
    mainNetInflow: index < 60 ? index + 1 : 59 - index,
  }));
  const result = splitFundFlowRanks(rows);

  assert.equal(result.inflows.length, 50);
  assert.equal(result.outflows.length, 50);
});
