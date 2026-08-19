import type { ZTPoolItem } from 'stock-sdk';

export function groupLimitUpRows(rows: ZTPoolItem[]) {
  const groups = new Map<number, ZTPoolItem[]>();
  const industries = new Map<string, number>();

  rows.forEach((item) => {
    const boards = Math.max(item.continuousBoardCount ?? 1, 1);
    groups.set(boards, [...(groups.get(boards) ?? []), item]);
    if (item.industry) industries.set(item.industry, (industries.get(item.industry) ?? 0) + 1);
  });

  return {
    stairs: [...groups.entries()].filter(([boards]) => boards > 1).sort(([a], [b]) => b - a),
    firstBoards: groups.get(1) ?? [],
    industries: [...industries.entries()].sort(([, a], [, b]) => b - a),
  };
}
