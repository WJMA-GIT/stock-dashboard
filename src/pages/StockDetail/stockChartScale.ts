export function getSyncedPriceAxis(prices: number[], referencePrice?: number) {
  const validPrices = prices.filter((price) => Number.isFinite(price) && price > 0);
  const basePrice = referencePrice && referencePrice > 0 ? referencePrice : validPrices[0] ?? 1;
  const deviation = validPrices.reduce(
    (max, price) => Math.max(max, Math.abs(price - basePrice)),
    0
  );
  const priceRange = Math.max(deviation * 1.1, basePrice * 0.005);
  const percentRange = priceRange / basePrice * 100;

  return {
    priceMin: basePrice - priceRange,
    priceMax: basePrice + priceRange,
    percentMin: -percentRange,
    percentMax: percentRange,
  };
}
