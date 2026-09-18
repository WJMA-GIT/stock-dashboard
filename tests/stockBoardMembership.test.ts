import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupWatchlistQuotesByBoard,
  parseStockBoardMembership,
  parseStocksBoardMembership,
} from '../src/services/stockBoardMembership.ts';

test('个股板块元数据区分行业和精确概念', () => {
  const result = parseStockBoardMembership([
    { NEW_BOARD_CODE: 'BK0438', BOARD_NAME: '食品饮料', BOARD_RANK: 1, IS_PRECISE: '0' },
    { NEW_BOARD_CODE: 'BK0896', BOARD_NAME: '白酒', BOARD_RANK: 23, IS_PRECISE: '1' },
    { NEW_BOARD_CODE: 'BK0707', BOARD_NAME: '沪股通', BOARD_RANK: 15, IS_PRECISE: '0' },
  ]);
  assert.deepEqual(result.industry, { code: 'BK0438', name: '食品饮料', type: 'industry' });
  assert.deepEqual(result.concepts, [{ code: 'BK0896', name: '白酒', type: 'concept' }]);
  assert.deepEqual(result.boards.map(({ code }) => code), ['BK0438', 'BK0896', 'BK0707']);
});

test('批量板块元数据按股票拆分并保留多级行业与全部标签', () => {
  const [result] = parseStocksBoardMembership([
    { SECUCODE: '301583.SZ', NEW_BOARD_CODE: 'BK1201', BOARD_NAME: '电子', BOARD_RANK: 1 },
    { SECUCODE: '301583.SZ', NEW_BOARD_CODE: 'BK1036', BOARD_NAME: '半导体', BOARD_RANK: 2 },
    { SECUCODE: '301583.SZ', NEW_BOARD_CODE: 'BK1326', BOARD_NAME: '半导体设备', BOARD_RANK: 3 },
    { SECUCODE: '301583.SZ', NEW_BOARD_CODE: 'BK0917', BOARD_NAME: '半导体概念', BOARD_RANK: 11, IS_PRECISE: '1' },
  ]);

  assert.equal(result.stockCode, '301583');
  assert.deepEqual(result.boards.map(({ code }) => code), ['BK1201', 'BK1036', 'BK1326', 'BK0917']);
  assert.deepEqual(result.concepts.map(({ code }) => code), ['BK0917']);
});

test('自选股按行业和概念归入对应板块', () => {
  const quote = { code: 'sh600519', name: '贵州茅台', changePercent: 1.23 };
  const result = groupWatchlistQuotesByBoard([quote], [{
    stockCode: '600519',
    boards: [
      { code: 'BK0438', name: '食品饮料', type: 'industry' },
      { code: 'BK0896', name: '白酒', type: 'concept' },
    ],
  }]);

  assert.deepEqual(result, { BK0438: [quote], BK0896: [quote] });
});
