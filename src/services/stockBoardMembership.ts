export interface StockBoardRef {
  code: string;
  name: string;
  type: 'industry' | 'concept';
}

interface RawBoardRow {
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
    .filter((row) => String(row.IS_PRECISE) === '1' && Number(row.BOARD_RANK) >= 20)
    .map((row) => toRef(row, 'concept'))
    .filter((row) => row.code && row.name);

  return {
    industry: industryRow?.NEW_BOARD_CODE && industryRow.BOARD_NAME
      ? toRef(industryRow, 'industry')
      : null,
    concepts,
  };
}
