import assert from 'node:assert/strict';
import test from 'node:test';
import { CHANGE_GROUPS, filterChangeRows, formatChangeInfo } from '../src/pages/MarketChanges/marketChangeConfig.ts';

test('异动方向配置与搜索过滤保持一致', () => {
  assert.equal(CHANGE_GROUPS.up[0].key, 'rocket_launch');
  assert.equal(CHANGE_GROUPS.down[0].key, 'accelerate_down');
  assert.equal(CHANGE_GROUPS.up.length, 11);
  assert.equal(CHANGE_GROUPS.down.length, 11);
  const rows = [
    { code: '600000', name: '浦发银行', info: '大笔买入 1000 万' },
    { code: '000001', name: '平安银行', info: '快速反弹' },
  ];
  assert.deepEqual(filterChangeRows(rows, '600000'), [rows[0]]);
  assert.deepEqual(filterChangeRows(rows, '反弹'), [rows[1]]);
  assert.equal(filterChangeRows(rows, '  '), rows);
});

test('异动原始信息格式化为可读行情', () => {
  assert.equal(
    formatChangeInfo({ changeType: 'large_buy', info: '108800,23.31000,0.034667,2536128.00' }),
    '现价 23.31 · 涨跌 +3.47% · 金额 253.61万元'
  );
  assert.equal(
    formatChangeInfo({ changeType: 'limit_up_seal', info: '62.33,366960,62.33,0.100071' }),
    '现价 62.33 · 涨跌 +10.01% · 封单 36.70万股'
  );
});
