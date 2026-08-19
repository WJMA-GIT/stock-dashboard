export type USRankingKey = 'rise' | 'fall' | 'amount';

export function rankUSQuotes<T extends { changePercent: number; amount: number }>(quotes: T[], key: USRankingKey, limit = 10) {
  return [...quotes]
    .sort((a, b) => key === 'fall' ? a.changePercent - b.changePercent : key === 'amount' ? b.amount - a.amount : b.changePercent - a.changePercent)
    .slice(0, limit);
}
