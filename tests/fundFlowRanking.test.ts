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
