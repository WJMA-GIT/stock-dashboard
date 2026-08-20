import type { FundFlowRankItem } from 'stock-sdk';

export type FundFlowRankingKey = 'netInflow' | 'netOutflow' | 'largeNetInflow';

export function rankMarketFundFlows<
  T extends Pick<FundFlowRankItem, 'mainNetInflow' | 'largeNetInflow'>,
>(
  items: T[],
  key: FundFlowRankingKey,
  limit = 10
) {
  const field = key === 'largeNetInflow' ? 'largeNetInflow' : 'mainNetInflow';
  const direction = key === 'netOutflow' ? 1 : -1;

  return [...items]
    .filter((item) => item[field] !== null)
    .sort((a, b) => ((a[field] ?? 0) - (b[field] ?? 0)) * direction)
    .slice(0, limit);
}
