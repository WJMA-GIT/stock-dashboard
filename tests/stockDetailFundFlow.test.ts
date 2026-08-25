import assert from 'node:assert/strict';
import test from 'node:test';
import { getMainFundFlowLabel } from '../src/pages/StockDetail/fundFlowDirection.ts';
import { formatAmount } from '../src/utils/format.ts';

test('主力资金方向与负数金额单位显示正确', () => {
  assert.equal(getMainFundFlowLabel(7241.32), '主力净流入');
  assert.equal(getMainFundFlowLabel(-20140.54), '主力净流出');
  assert.equal(formatAmount(-20140.54), '-2.01亿');
  assert.equal(formatAmount(-7241.32), '-7241.32万');
});
