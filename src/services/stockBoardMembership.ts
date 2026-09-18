export interface StockBoardRef {
  code: string;
  name: string;
  type: 'industry' | 'concept';
}

interface WatchlistQuote {
  code: string;
  name: string;
  changePercent: number | null;
}

interface WatchlistMembership {
  stockCode: string;
  boards: StockBoardRef[];
}

interface RawBoardRow {
  SECUCODE?: string;
  NEW_BOARD_CODE?: string;
  BOARD_NAME?: string;
  BOARD_RANK?: number | string;
  IS_PRECISE?: number | string | null;
}

export function parseStockBoardMembership(rows: RawBoardRow[]) {
  const toRef = (row: RawBoardRow, type: StockBoardRef['type']): StockBoardRef => ({
    code: row.NEW_BOARD_CODE ?? '',
    name: row.BOARD_NAME ?? '',
    type,
  });
  const industryRow = rows.find((row) => Number(row.BOARD_RANK) === 1);
  const concepts = rows
    .filter((row) => String(row.IS_PRECISE) === '1')
    .map((row) => toRef(row, 'concept'))
    .filter((row) => row.code && row.name);
  const boards = rows
    .map((row) => toRef(row, Number(row.BOARD_RANK) <= 3 ? 'industry' : 'concept'))
    .filter((row) => row.code && row.name);

  return {
    industry: industryRow?.NEW_BOARD_CODE && industryRow.BOARD_NAME
      ? toRef(industryRow, 'industry')
      : null,
    concepts,
    boards,
  };
}

export function parseStocksBoardMembership(rows: RawBoardRow[]) {
  const grouped = new Map<string, RawBoardRow[]>();
  rows.forEach((row) => {
    const stockCode = row.SECUCODE?.replace(/\D/g, '').slice(-6) ?? '';
    if (!stockCode) return;
    const stockRows = grouped.get(stockCode);
    if (stockRows) stockRows.push(row);
    else grouped.set(stockCode, [row]);
  });
  return [...grouped]
    .map(([stockCode, stockRows]) => ({ stockCode, ...parseStockBoardMembership(stockRows) }));
}

export function groupWatchlistQuotesByBoard(
  quotes: WatchlistQuote[],
  memberships: WatchlistMembership[]
) {
  const quotesByCode = new Map(quotes.map((quote) => [quote.code.replace(/\D/g, '').slice(-6), quote]));
  const grouped: Record<string, WatchlistQuote[]> = {};

  memberships.forEach(({ stockCode, boards }) => {
    const quote = quotesByCode.get(stockCode.replace(/\D/g, '').slice(-6));
    if (!quote) return;
    boards.forEach((board) => {
      (grouped[board.code] ??= []).push(quote);
    });
  });

  return grouped;
}
