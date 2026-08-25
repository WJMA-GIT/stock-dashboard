import assert from 'node:assert/strict';
import test from 'node:test';
import type { FundFlowRankItem } from 'stock-sdk';
import { findMainFundFlow, getMainFundFlowLabel } from '../src/pages/StockDetail/mainFundFlow.ts';
import { formatAmount } from '../src/utils/format.ts';

test('主力资金方向与负数金额单位显示正确', () => {
  assert.equal(getMainFundFlowLabel(7241.32), '主力净流入');
  assert.equal(getMainFundFlowLabel(-20140.54), '主力净流出');
  assert.equal(formatAmount(-20140.54), '-2.01亿');
  assert.equal(formatAmount(-7241.32), '-7241.32万');
});

test('个股页可从榜单资金流数据中匹配带市场前缀的股票代码', () => {
  const row = { code: '600519', mainNetInflow: -126653104 } as FundFlowRankItem;
  assert.equal(findMainFundFlow([row], 'sh600519'), row);
  assert.equal(findMainFundFlow([row], 'sz000001'), null);
});
