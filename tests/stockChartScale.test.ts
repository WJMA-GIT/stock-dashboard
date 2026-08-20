import assert from 'node:assert/strict';
import test from 'node:test';
import { getSyncedPriceAxis } from '../src/pages/StockDetail/stockChartScale.ts';

test('价格轴和涨跌幅轴按昨收同步并为横盘保留范围', () => {
  const axis = getSyncedPriceAxis([10, 10], 10);
  assert.ok(Math.abs(axis.priceMin - 9.95) < 1e-10);
  assert.ok(Math.abs(axis.priceMax - 10.05) < 1e-10);
  assert.ok(Math.abs(axis.percentMin + 0.5) < 1e-10);
  assert.ok(Math.abs(axis.percentMax - 0.5) < 1e-10);

  const moved = getSyncedPriceAxis([9, 11], 10);
  assert.ok(Math.abs((moved.priceMax / 10 - 1) * 100 - moved.percentMax) < 1e-10);
  assert.ok(Math.abs((moved.priceMin / 10 - 1) * 100 - moved.percentMin) < 1e-10);
});
