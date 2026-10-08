import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('筹码分布使用 SDK 专用接口，保留参数、缓存并传播上游错误', async (t) => {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  });
  t.after(() => server.close());
  const { sdk, getChipDistribution } = await server.ssrLoadModule('/src/services/sdk.ts');
  const originalChips = sdk.chips.cn;
  const originalKline = sdk.kline.cn;
  t.after(() => {
    sdk.chips.cn = originalChips;
    sdk.kline.cn = originalKline;
  });

  sdk.kline.cn = () => assert.fail('筹码计算不能走可能缺少换手率的普通 K 线备用源');
  const rows = [{ date: '2026-09-30', avgCost: 10, histogram: { prices: [10], ratios: [1] } }];
  let calls = 0;
  sdk.chips.cn = async (symbol: string, options: unknown) => {
    calls += 1;
    assert.equal(symbol, 'sh600519');
    assert.deepEqual(options, { adjust: 'qfq', range: 120, days: 7, includeHistogram: 'last' });
    return rows;
  };
  assert.equal(await getChipDistribution('sh600519'), rows);
  assert.equal(await getChipDistribution('sh600519'), rows);
  assert.equal(calls, 1);

  const upstreamError = new Error('UPSTREAM_EMPTY');
  sdk.chips.cn = async () => { throw upstreamError; };
  await assert.rejects(getChipDistribution('sz000001'), (error) => error === upstreamError);
  sdk.chips.cn = async () => rows;
  assert.equal(await getChipDistribution('sz000001'), rows);
});
