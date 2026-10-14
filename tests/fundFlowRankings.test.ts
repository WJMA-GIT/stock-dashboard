import assert from 'node:assert/strict';
import test from 'node:test';

const response = (amount = 123456789) => ({
  rc: 0,
  data: { total: 1, diff: [{ f12: 'BK0438', f14: '食品饮料', f62: amount, f184: '3.5', f124: 1791932400 }] },
});
const load = (name: string) => import(new URL(`../src/services/fundFlowRankings.ts?${name}`, import.meta.url).href);

function jsonp(input: string | URL | Request, body: unknown) {
  const url = new URL(String(input));
  return new Response(`${url.searchParams.get('cb')}(${JSON.stringify(body)});`);
}

test('排名直接按资金流方向取50条，缓存隔离、强制刷新和并发去重', async (t) => {
  const calls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.searchParams.get('pn') === '2') return jsonp(input, { rc: 0, data: { total: 1, diff: null } });
    return jsonp(input, response(url.searchParams.get('po') === '0' ? -123456789 : 123456789));
  });
  const service = await load('directions');
  const [first, concurrent] = await Promise.all([
    service.getFundFlowRanking('industry'), service.getFundFlowRanking('industry'),
  ]);
  assert.deepEqual(concurrent, first);
  assert.equal(calls.length, 1);
  assert.equal(first.rows[0].mainNetInflow, 123456789, '金额保持元，不能误换算为万元');
  assert.equal(first.rows[0].mainNetInflowPercent, 3.5);
  assert.equal(first.dataTime, 1791932400000);
  assert.equal(first.source, 'eastmoney');
  assert.equal(first.total, 1);
  await service.getFundFlowRanking('industry');
  assert.equal(calls.length, 1);
  const outflow = await service.getFundFlowRanking('industry', 1, 'outflow');
  assert.equal(outflow.rows[0].mainNetInflow, -123456789);
  await service.getFundFlowRanking('industry', 2);
  await service.getFundFlowRanking('industry', 1, 'inflow', true);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].searchParams.get('pz'), '50');
  assert.equal(calls[0].searchParams.get('fid'), 'f62');
  assert.equal(calls[0].searchParams.get('fs'), 'm:90+t:2');
  assert.equal(calls[0].searchParams.get('po'), '1');
  assert.equal(calls[1].searchParams.get('po'), '0');
  assert.equal(calls[2].searchParams.get('pn'), '2');
  assert.ok(calls.every((url) => url.searchParams.has('cb')));
  await assert.rejects(service.getFundFlowRanking('industry', 0), /参数/);
});

test('空响应或无效金额触发备用源，正常末页为空并保留total', async (t) => {
  const calls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.host === 'push2.eastmoney.com') return jsonp(input, { rc: 0, data: null });
    return jsonp(input, response());
  });
  const service = await load('fallback');
  const result = await service.getFundFlowRanking('concept');
  assert.equal(result.source, 'eastmoney-delay');
  assert.equal(result.stale, false);
  assert.deepEqual(calls.map((url) => url.host), ['push2.eastmoney.com', 'push2delay.eastmoney.com']);
  assert.equal(calls[1].searchParams.get('fs'), 'm:90+t:3');

  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => jsonp(input, { rc: 0, data: { total: 50, diff: null } }));
  const lastPage = await service.getFundFlowRanking('concept', 2);
  assert.equal(lastPage.total, 50);
  assert.deepEqual(lastPage.rows, []);
  await assert.rejects(service.getFundFlowRanking('stock'), /不完整/);

  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const payload = response();
    return jsonp(input, { ...payload, data: { total: 51, diff: [{ ...payload.data.diff[0], f62: '-' }] } });
  });
  await assert.rejects(service.getFundFlowRanking('stock', 2), /有效金额/);

  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => jsonp(input, {
    rc: 0, data: { total: 51, diff: response().data.diff },
  }));
  await assert.rejects(service.getFundFlowRanking('stock'), /不完整/, '非末页短响应不能标为成功');
  assert.equal((await service.getFundFlowRanking('stock', 2)).rows.length, 1, '末页不足50条正常');
  await assert.rejects(service.getFundFlowRanking('stock', 3), /不完整/, '越界页不能包含数据');
});

test('刷新失败保留成功快照与原时间，刷新页面可恢复快照，恢复网络后更新', async (t) => {
  const saved = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  let offline = false;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (offline) throw new Error('network unavailable');
    return jsonp(input, response());
  });
  const service = await load('snapshot');
  const first = await service.getFundFlowRanking('industry');
  now += 31000;
  offline = true;
  const stale = await service.getFundFlowRanking('industry');
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.rows, first.rows);
  assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.equal(stale.dataTime, first.dataTime);
  await assert.rejects(service.getFundFlowRanking('concept'), /network unavailable/, '没有快照的分类不能伪装有数据');
  assert.deepEqual(service.readFundFlowRanking('industry')?.rows, first.rows);

  const reloaded = await load('reloaded');
  assert.deepEqual(reloaded.readFundFlowRanking('industry'), stale);
  assert.equal(reloaded.readFundFlowRanking('industry', 2), null);
  assert.equal(reloaded.readFundFlowRanking('industry', 1, 'outflow'), null);
  offline = false;
  const refreshed = await reloaded.getFundFlowRanking('industry', 1, 'inflow', true);
  assert.equal(refreshed.stale, false);
  assert.equal(refreshed.fetchedAt, now);

  saved.set('stock-dashboard:fund-flow:v1:concept:inflow:1', '{broken');
  assert.equal(reloaded.readFundFlowRanking('concept'), null);
  saved.set('stock-dashboard:fund-flow:v1:stock:inflow:1', JSON.stringify({ ...first, rows: [{ code: 'fake' }] }));
  assert.equal(reloaded.readFundFlowRanking('stock'), null);
});

test('本地存储被禁用不影响取数，首次网络失败不写入空缓存', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const service = await load('blocked-storage');
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => jsonp(input, { rc: 0, data: { total: 0, diff: [] } }));
  await assert.rejects(service.getFundFlowRanking('industry'), /有效数据/);
  assert.equal(service.readFundFlowRanking('industry'), null);
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => jsonp(input, response()));
  assert.equal((await service.getFundFlowRanking('industry')).rows.length, 1);
});
