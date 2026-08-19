import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarginTargetItem } from 'stock-sdk';
import { summarizeMarginTrend } from '../src/pages/StockDetail/marginTrend.ts';

const base = {
  code: '600519', name: '贵州茅台', date: '2026-08-19', finBalance: 0, loanBalance: 0,
} satisfies Partial<MarginTargetItem>;

test('融资融券净压力可区分买方与卖方市场', () => {
  const buyer = summarizeMarginTrend([{ ...base, finBuyAmount: 1200, finRepayAmount: 200, loanSellVolume: 10, loanRepayVolume: 0 } as MarginTargetItem], 10);
  const seller = summarizeMarginTrend([{ ...base, finBuyAmount: 100, finRepayAmount: 200, loanSellVolume: 20, loanRepayVolume: 0 } as MarginTargetItem], 10);
  assert.equal(buyer.label, '买方市场');
  assert.equal(buyer.netPressure, 900);
  assert.equal(seller.label, '卖方市场');
  assert.equal(seller.netPressure, -300);
});
