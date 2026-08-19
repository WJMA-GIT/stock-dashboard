import assert from 'node:assert/strict';
import test from 'node:test';
import { filterFutures } from '../src/pages/Futures/futuresFilter.ts';

test('期货筛选只保留连续合约并按品种分类', () => {
  const rows = [
    { code: 'CL00Y', name: 'WTI原油', price: 65 },
    { code: 'GC00Y', name: '纽约黄金', price: 3400 },
    { code: 'CL2609', name: 'WTI原油', price: 64 },
    { code: 'NG00Y', name: '天然气', price: null },
  ];
  assert.deepEqual(filterFutures(rows, 'energy'), [rows[0]]);
  assert.deepEqual(filterFutures(rows, 'metals'), [rows[1]]);
});
