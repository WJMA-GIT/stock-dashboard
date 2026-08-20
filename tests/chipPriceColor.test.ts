import assert from 'node:assert/strict';
import test from 'node:test';
import { getChipPriceColor } from '../src/pages/StockDetail/chipPriceColor.ts';

const colors = { rise: 'rise', fall: 'fall', flat: 'flat' };

test('筹码价格按现价上下分色', () => {
  assert.equal(getChipPriceColor(9, 10, colors), 'fall');
  assert.equal(getChipPriceColor(11, 10, colors), 'rise');
  assert.equal(getChipPriceColor(10, 10, colors), 'flat');
  assert.equal(getChipPriceColor(10, 0, colors), 'flat');
});
