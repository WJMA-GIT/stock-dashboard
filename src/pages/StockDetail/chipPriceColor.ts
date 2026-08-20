export function getChipPriceColor(
  price: number,
  currentPrice: number,
  colors: { rise: string; fall: string; flat: string }
) {
  if (currentPrice <= 0 || price === currentPrice) return colors.flat;
  return price < currentPrice ? colors.rise : colors.fall;
}
