export type SortDirection = 'asc' | 'desc';

export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => string | number | null | undefined,
  direction: SortDirection
) {
  return [...rows].sort((left, right) => {
    const a = getValue(left);
    const b = getValue(right);
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    const result = typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'zh-CN', { numeric: true });
    return direction === 'asc' ? result : -result;
  });
}
