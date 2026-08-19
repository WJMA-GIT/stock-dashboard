export type ChangeDirection = 'up' | 'down';

export const CHANGE_GROUPS = {
  up: [
    { key: 'rocket_launch', label: '火箭发射' },
    { key: 'quick_rebound', label: '快速反弹' },
    { key: 'large_buy', label: '大笔买入' },
    { key: 'big_buy_order', label: '大单扫货' },
    { key: 'limit_up_seal', label: '封涨停板' },
    { key: 'limit_down_open', label: '打开跌停板' },
    { key: 'auction_up', label: '竞价上涨' },
    { key: 'high_open_5d', label: '高开5日线' },
    { key: 'gap_up', label: '向上缺口' },
    { key: 'high_60d', label: '60日新高' },
    { key: 'surge_60d', label: '60日大幅上涨' },
  ],
  down: [
    { key: 'accelerate_down', label: '加速下跌' },
    { key: 'high_dive', label: '高台跳水' },
    { key: 'large_sell', label: '大笔卖出' },
    { key: 'big_sell_order', label: '大单卖出' },
    { key: 'limit_down_seal', label: '封跌停板' },
    { key: 'limit_up_open', label: '打开涨停板' },
    { key: 'auction_down', label: '竞价下跌' },
    { key: 'low_open_5d', label: '低开5日线' },
    { key: 'gap_down', label: '向下缺口' },
    { key: 'low_60d', label: '60日新低' },
    { key: 'drop_60d', label: '60日大幅下跌' },
  ],
} as const;

export type StockChangeKey = (typeof CHANGE_GROUPS)[ChangeDirection][number]['key'];

export function filterChangeRows<T extends { code: string; name: string; info: string }>(
  rows: T[],
  keyword: string
) {
  const query = keyword.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((item) =>
    `${item.name} ${item.code} ${item.info}`.toLowerCase().includes(query)
  );
}

function compactValue(value: number) {
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return value.toFixed(0);
}

export function formatChangeInfo(item: { changeType: string; info: string }) {
  const values = item.info.split(',').map(Number);
  if (values.length < 3 || values.some(Number.isNaN)) return item.info || '--';
  const isSeal = item.changeType === 'limit_up_seal' || item.changeType === 'limit_down_seal';
  const isOrder = ['large_buy', 'big_buy_order', 'large_sell', 'big_sell_order'].includes(item.changeType);
  const price = isSeal ? values[0] : values[1];
  const change = values[isSeal ? 3 : 2];
  const extra = isSeal
    ? ` · 封单 ${compactValue(values[1])}股`
    : isOrder && values[3] !== undefined
      ? ` · 金额 ${compactValue(values[3])}元`
      : '';
  return `现价 ${price.toFixed(2)} · 涨跌 ${change >= 0 ? '+' : ''}${(change * 100).toFixed(2)}%${extra}`;
}
