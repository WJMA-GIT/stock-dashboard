import assert from 'node:assert/strict';
import test from 'node:test';
import { sortRows } from '../src/utils/tableSort.ts';

test('表头排序支持数字、文本、升降序并将空值放末尾', () => {
  const rows = [
    { name: '股票10', value: null },
    { name: '股票2', value: 2 },
    { name: '股票1', value: 1 },
  ];

  assert.deepEqual(sortRows(rows, (row) => row.value, 'desc').map((row) => row.value), [2, 1, null]);
  assert.deepEqual(sortRows(rows, (row) => row.name, 'asc').map((row) => row.name), ['股票1', '股票2', '股票10']);
  assert.equal(rows[0].name, '股票10');
});
