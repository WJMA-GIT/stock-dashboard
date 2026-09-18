import assert from 'node:assert/strict';
import test from 'node:test';
import { groupWatchlistQuotesByBoard, parseStockBoardMembership } from '../src/services/stockBoardMembership.ts';

test('个股板块元数据区分行业和精确概念', () => {
  const result = parseStockBoardMembership([
    { NEW_BOARD_CODE: 'BK0438', BOARD_NAME: '食品饮料', BOARD_RANK: 1, IS_PRECISE: '0' },
    { NEW_BOARD_CODE: 'BK0896', BOARD_NAME: '白酒', BOARD_RANK: 23, IS_PRECISE: '1' },
    { NEW_BOARD_CODE: 'BK0707', BOARD_NAME: '沪股通', BOARD_RANK: 15, IS_PRECISE: '0' },
  ]);
  assert.deepEqual(result.industry, { code: 'BK0438', name: '食品饮料', type: 'industry' });
  assert.deepEqual(result.concepts, [{ code: 'BK0896', name: '白酒', type: 'concept' }]);
});

test('自选股按行业和概念归入对应板块', () => {
  const quote = { code: 'sh600519', name: '贵州茅台', changePercent: 1.23 };
  const result = groupWatchlistQuotesByBoard([quote], [{
    stockCode: '600519',
    industry: { code: 'BK0438', name: '食品饮料', type: 'industry' },
    concepts: [{ code: 'BK0896', name: '白酒', type: 'concept' }],
  }]);

  assert.deepEqual(result, { BK0438: [quote], BK0896: [quote] });
});
