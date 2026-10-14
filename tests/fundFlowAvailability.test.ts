import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('历史资金流立即显示，一列有数据即可展示，板块加载不会遮住资金流', async (t) => {
  const now = Date.now();
  const snapshot = {
    rows: [{ code: 'BK0438', name: '食品饮料', mainNetInflow: 123456789, mainNetInflowPercent: 3.5 }],
    total: 1, fetchedAt: now - 60000, dataTime: now - 3600000, source: 'eastmoney-delay', stale: false,
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => key === 'stock-dashboard:fund-flow:v1:industry:inflow:1' ? JSON.stringify(snapshot) : null },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, ws: false },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  });
  t.after(() => server.close());
  const { AppSettingsContext } = await server.ssrLoadModule('/src/contexts/appSettingsContext.ts');
  const { BoardDataContext } = await server.ssrLoadModule('/src/contexts/boardDataValueContext.ts');
  const { FundFlowPagination } = await server.ssrLoadModule('/src/pages/Rankings/FundFlowPagination.tsx');
  const { FundFlowLeaders } = await server.ssrLoadModule('/src/pages/Rankings/FundFlowLeaders.tsx');
  const { Rankings } = await server.ssrLoadModule('/src/pages/Rankings/Rankings.tsx');
  const render = (child: ReturnType<typeof createElement>) => renderToStaticMarkup(
    createElement(MemoryRouter, null,
      createElement(AppSettingsContext.Provider, { value: { getRefreshInterval: () => 15000 } },
        createElement(BoardDataContext.Provider, { value: { industryList: [], conceptList: [], loading: true } }, child)
      )
    )
  );

  const paged = render(createElement(FundFlowPagination));
  assert.match(paged, /食品饮料/);
  assert.match(paged, /历史快照/);
  assert.match(paged, /东财延迟源/);
  assert.match(paged, /获取于/);
  assert.match(paged, /行情时间/);

  const leaders = render(createElement(FundFlowLeaders, { watchlistByBoard: {} }));
  assert.match(leaders, /食品饮料/);
  assert.match(leaders, /概念板块资金流/);
  assert.match(leaders, /个股主力资金流/);
  assert.match(leaders, /加载资金流/);

  const page = render(createElement(Rankings));
  assert.match(page, /加载板块榜单/);
  assert.match(page, /食品饮料/);
  assert.doesNotMatch(page, /加载榜单数据/);
});
