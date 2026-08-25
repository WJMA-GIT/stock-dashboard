export function getMainFundFlowLabel(value: number | null | undefined) {
  return value != null && value < 0 ? '主力净流出' : '主力净流入';
}
