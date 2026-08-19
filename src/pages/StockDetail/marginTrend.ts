import type { MarginTargetItem } from 'stock-sdk';

export function summarizeMarginTrend(rows: MarginTargetItem[], currentPrice: number) {
  const financeNet = rows.reduce(
    (sum, item) => sum + (item.finBuyAmount ?? 0) - (item.finRepayAmount ?? 0),
    0
  );
  const shortNetValue = rows.reduce(
    (sum, item) => sum + ((item.loanSellVolume ?? 0) - (item.loanRepayVolume ?? 0)) * currentPrice,
    0
  );
  const netPressure = financeNet - shortNetValue;

  return {
    financeNet,
    shortNetValue,
    netPressure,
    label: netPressure >= 0 ? '买方市场' : '卖方市场',
  } as const;
}
