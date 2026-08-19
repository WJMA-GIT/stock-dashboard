export interface MinuteAmountRow {
  time: string;
  amount: number | null;
}

export function getComparableTradingTime(hour: number, minute: number): string | null {
  if (hour < 9 || (hour === 9 && minute < 30)) return null;
  if (hour < 11 || (hour === 11 && minute <= 30)) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  if (hour < 13) return '11:30';
  if (hour < 15) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return '15:00';
}

export function sumMinuteAmount(rows: MinuteAmountRow[], date: string, time: string): number {
  return rows.reduce((sum, row) => {
    const [rowDate, rowTime] = row.time.split(' ');
    return rowDate === date && rowTime && rowTime <= time ? sum + (row.amount ?? 0) : sum;
  }, 0);
}
