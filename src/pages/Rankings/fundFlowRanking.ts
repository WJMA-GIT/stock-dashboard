export function splitFundFlowRanks<T extends { mainNetInflow: number | null }>(
  items: T[],
  limit = 10
) {
  const ranked = items
    .filter((item): item is T & { mainNetInflow: number } => item.mainNetInflow !== null)
    .sort((a, b) => b.mainNetInflow - a.mainNetInflow);

  return {
    inflows: ranked.filter((item) => item.mainNetInflow > 0).slice(0, limit),
    outflows: ranked.filter((item) => item.mainNetInflow < 0).slice(-limit).reverse(),
  };
}
