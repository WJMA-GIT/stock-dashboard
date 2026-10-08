import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('资金流与盘口异动分页参数透传，分页缓存与全量缓存隔离', async (t) => {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, ws: false },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  });
  t.after(() => server.close());
  const { sdk, getFundFlowRank, getSectorFundFlowRank, getStockChanges } =
    await server.ssrLoadModule('/src/services/sdk.ts');

  for (const [namespace, method, fetchPage] of [
    [sdk.fundFlow, 'rank', (options?: object) => getFundFlowRank({ indicator: 'today', ...options })],
    [sdk.fundFlow, 'sectorRank', (options?: object) => getSectorFundFlowRank({ indicator: 'today', sectorType: 'concept', ...options })],
    [sdk.marketEvent, 'stockChanges', (options?: object) => getStockChanges('large_buy', options)],
  ] as const) {
    const original = namespace[method];
    t.after(() => { namespace[method] = original; });
    const requests: object[] = [];
    namespace[method] = async (...args: unknown[]) => {
      if (method === 'stockChanges') assert.equal(args[0], 'large_buy');
      const options = args[method === 'stockChanges' ? 1 : 0] as { page?: number; pageSize?: number } | undefined;
      requests.push(options ?? {});
      return [{ page: options?.page ?? 'all', pageSize: options?.pageSize }];
    };

    const firstPage = await fetchPage({ page: 1, pageSize: 50 });
    assert.equal(await fetchPage({ page: 1, pageSize: 50 }), firstPage);
    assert.deepEqual(await fetchPage({ page: 2, pageSize: 50 }), [{ page: 2, pageSize: 50 }]);
    assert.deepEqual(await fetchPage({ page: 1, pageSize: 100 }), [{ page: 1, pageSize: 100 }]);
    assert.deepEqual(await fetchPage(), [{ page: 'all', pageSize: undefined }]);
    assert.equal(requests.length, 4);
    const filters = method === 'rank' ? { indicator: 'today' }
      : method === 'sectorRank' ? { indicator: 'today', sectorType: 'concept' } : {};
    assert.deepEqual(requests, [
      { ...filters, page: 1, pageSize: 50 },
      { ...filters, page: 2, pageSize: 50 },
      { ...filters, page: 1, pageSize: 100 },
      filters,
    ]);

    const upstreamError = new Error('分页请求失败');
    namespace[method] = async () => { throw upstreamError; };
    await assert.rejects(fetchPage({ page: 3, pageSize: 50 }), (error) => error === upstreamError);
    namespace[method] = async () => [{ page: 3, pageSize: 50 }];
    assert.deepEqual(await fetchPage({ page: 3, pageSize: 50 }), [{ page: 3, pageSize: 50 }]);
    namespace[method] = original;
    await assert.rejects(fetchPage({ page: 0, pageSize: 50 }), /page/);
    await assert.rejects(fetchPage({ page: 1, pageSize: 0 }), /pageSize/);
    await assert.rejects(fetchPage({ page: 1, pageSize: method === 'stockChanges' ? 5001 : 101 }), /pageSize/);
  }
});
