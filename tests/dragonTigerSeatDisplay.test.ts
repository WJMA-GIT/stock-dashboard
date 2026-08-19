import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSeats } from '../src/pages/DragonTiger/seatDisplay.ts';

test('龙虎榜席位按买卖方向和成交额各取前四名', () => {
  const seats = [
    ...[1, 5, 3, 2, 4].map((amount) => ({ branchName: `买${amount}`, buyAmount: amount, sellAmount: 0, netAmount: amount, side: 'buy' as const })),
    ...[6, 2, 4, 8, 1].map((amount) => ({ branchName: `卖${amount}`, buyAmount: 0, sellAmount: amount, netAmount: -amount, side: 'sell' as const })),
  ];

  const result = splitSeats(seats);
  assert.deepEqual(result.buyers.map((item) => item.name), ['买5', '买4', '买3', '买2']);
  assert.deepEqual(result.sellers.map((item) => item.name), ['卖8', '卖6', '卖4', '卖2']);
});
