import type { FundFlowRankItem } from 'stock-sdk';

export function getMainFundFlowLabel(value: number | null | undefined) {
  return value != null && value < 0 ? '主力净流出' : '主力净流入';
}

export function findMainFundFlow(rows: FundFlowRankItem[], code: string) {
  const symbol = code.match(/\d{6}/)?.[0];
  return rows.find((item) => item.code === symbol) ?? null;
}
