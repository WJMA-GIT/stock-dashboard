export type FuturesCategory = 'all' | 'index' | 'energy' | 'metals' | 'agriculture';

const CATEGORY_PATTERNS: Record<Exclude<FuturesCategory, 'all'>, RegExp> = {
  index: /指数|标普|纳指|道指|恒生/,
  energy: /原油|天然气|汽油|燃油|布伦特/,
  metals: /黄金|白银|铜|铝|锌|铅|镍|锡|铂|钯/,
  agriculture: /玉米|大豆|豆粕|豆油|小麦|棉|糖|咖啡|可可|燕麦|稻米/,
};

export function filterFutures<T extends { code: string; name: string; price: number | null }>(
  rows: T[],
  category: FuturesCategory
) {
  return rows.filter((item) =>
    item.price !== null && /00Y$/i.test(item.code) &&
    (category === 'all' || CATEGORY_PATTERNS[category].test(item.name))
  );
}
