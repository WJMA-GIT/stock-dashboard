import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarketIntradayAnnotations,
  type IndustryIntradayCandidate,
} from '../src/pages/Dashboard/marketIntradayAnnotations.ts';

function points(start: number, end: number, offset = 0) {
  return Array.from({ length: 15 }, (_, index) => ({
    time: `09:${String(30 + offset + index).padStart(2, '0')}`,
    price: start + ((end - start) * index) / 14,
  }));
}

function candidate(
  code: string,
  name: string,
  start: number,
  end: number,
  offset = 0
): IndustryIntradayCandidate {
  return { code, name, points: points(start, end, offset) };
}

test('上涨窗口选择同期涨幅最大的行业', () => {
  const result = buildMarketIntradayAnnotations(points(100, 100.2), [
    candidate('BK1', '行业甲', 100, 101),
    candidate('BK2', '行业乙', 100, 102),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].code, 'BK2');
  assert.equal(result[0].type, 'rise');
});

test('下跌窗口选择同期跌幅最深的行业', () => {
  const result = buildMarketIntradayAnnotations(points(100, 99.8), [
    candidate('BK1', '行业甲', 100, 99),
    candidate('BK2', '行业乙', 100, 97),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].code, 'BK2');
  assert.equal(result[0].type, 'fall');
});

test('过滤弱指数波动和行业错向', () => {
  assert.deepEqual(
    buildMarketIntradayAnnotations(points(100, 100.07), [
      candidate('BK1', '行业甲', 100, 102),
    ]),
    []
  );
  assert.deepEqual(
    buildMarketIntradayAnnotations(points(100, 100.2), [
      candidate('BK1', '行业错向', 100, 99),
    ]),
    []
  );
});
