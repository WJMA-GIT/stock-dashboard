import test from 'node:test';
import assert from 'node:assert/strict';
import type { ZTPoolItem } from 'stock-sdk';
import { groupLimitUpRows } from '../src/pages/LimitUpLadder/ladderGrouping.ts';

const item = (name: string, boards: number, industry: string) => ({
  name,
  code: name,
  continuousBoardCount: boards,
  industry,
}) as ZTPoolItem;

test('groups ladder levels high to low and keeps first boards separate', () => {
  const result = groupLimitUpRows([
    item('A', 1, '科技'),
    item('B', 3, '农业'),
    item('C', 2, '农业'),
  ]);
  assert.deepEqual(result.stairs.map(([boards]) => boards), [3, 2]);
  assert.deepEqual(result.firstBoards.map(({ name }) => name), ['A']);
  assert.deepEqual(result.industries[0], ['农业', 2]);
});
