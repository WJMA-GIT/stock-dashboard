import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectPublicIp, extractProxyEndpoints, getProxyExtractionUrl, getWhitelist, isIPv4,
  parseProxyEndpoints, parseWhitelist, removeWhitelistIp, syncWhitelist,
  PROXY_MANAGEMENT_URLS,
} from '../src/services/proxyManagement.ts';

const credentials = { uid: '12345', ukey: 'test-white-key', vkey: 'test-extract-key' };
const currentIp = '203.0.113.7';
const oldIp = '203.0.113.6';
const unrelatedIp = '198.51.100.9';
const json = (data: unknown) => new Response(JSON.stringify({ code: 0, data }));

test('携趣认证URL被排除遥测，其他域名不受影响', () => {
  for (const host of ['www.xiequ.cn', 'op.xiequ.cn', 'api.xiequ.cn']) {
    for (const protocol of ['https:', 'http:']) assert.equal(PROXY_MANAGEMENT_URLS.test(`${protocol}//${host}/example?ukey=test`), true);
  }
  assert.equal(PROXY_MANAGEMENT_URLS.test('https://op.xiequ.cn.example.com/?ukey=test'), false);
  assert.equal(PROXY_MANAGEMENT_URLS.test('https://push2.eastmoney.com/api/qt/clist/get'), false);
});

test('IPv4、白名单和代理文本/JSON严格解析，业务错误不能伪装成功', () => {
  assert.equal(isIPv4(currentIp), true);
  for (const ip of ['256.1.1.1', '1.2.3', '01.2.3.4', 'all', '1.2.3.4\n']) assert.equal(isIPv4(ip), false);
  assert.deepEqual(parseWhitelist(`${currentIp},${oldIp}`), [{ ip: currentIp, memo: '' }, { ip: oldIp, memo: '' }]);
  assert.deepEqual(parseWhitelist(JSON.stringify({ code: 0, data: [{ IP: currentIp, meno: '看板' }] })), [{ ip: currentIp, memo: '看板' }]);
  assert.deepEqual(parseWhitelist(''), []);
  assert.deepEqual(parseWhitelist('{"code":0,"data":[]}'), []);
  assert.throws(() => parseWhitelist('ERR'), /无效/);
  assert.throws(() => parseWhitelist('{"code":-1,"data":[]}'), /失败/);
  assert.deepEqual(parseWhitelist('{"data":[]}'), []);
  assert.deepEqual(parseWhitelist(JSON.stringify({ data: [{ IP: currentIp, MEMO: '实际白名单格式' }] })), [{ ip: currentIp, memo: '实际白名单格式' }]);
  assert.throws(() => parseWhitelist('{"success":false,"data":[]}'), /失败/);
  assert.throws(() => parseWhitelist('{"data":"bad"}'), /失败/);
  assert.deepEqual(parseProxyEndpoints(`${currentIp}:8080\r\n${oldIp}:65535`), [{ ip: currentIp, port: 8080 }, { ip: oldIp, port: 65535 }]);
  assert.deepEqual(parseProxyEndpoints(JSON.stringify({ code: 0, success: 'true', data: [{ IP: currentIp, Port: 8888, IpAddress: '测试地区' }] })), [{ ip: currentIp, port: 8888, location: '测试地区' }]);
  assert.throws(() => parseProxyEndpoints('{"code":-1,"success":"true","msg":"请先添加白名单","data":""}'), /失败/);
  for (const text of ['', `${currentIp}:0`, `${currentIp}:65536`, '256.1.1.1:80', 'ERR']) assert.throws(() => parseProxyEndpoints(text));
});

test('公网IP必须从两个固定检测点返回合法且一致的结果', async (t) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    urls.push(new URL(url));
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.ok(options.signal);
    return new Response(` ${currentIp}\r\n`);
  });
  assert.equal(await detectPublicIp(), currentIp);
  assert.deepEqual(urls.map((url) => url.href).sort(), ['https://www.xiequ.cn/OnlyIp.aspx?yyy=123', 'https://www.xiequ.cn/OnlyIp.aspx?yyy=567']);
  t.mock.method(globalThis, 'fetch', async (url: string) => new Response(url.includes('123') ? currentIp : oldIp));
  await assert.rejects(detectPublicIp(), /不一致/);
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>error</html>'));
  await assert.rejects(detectPublicIp(), /无效/);
});

test('先验证新增成功再仅删除跟踪旧IP，不改动其他条目', async (t) => {
  const entries = [{ ip: oldIp, memo: '旧看板' }, { ip: unrelatedIp, memo: '其他应用' }];
  const actions: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/OnlyIp.aspx') return new Response(currentIp);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.searchParams.get('ukey'), credentials.ukey);
    assert.equal(url.searchParams.has('vkey'), false);
    const act = url.searchParams.get('act')!;
    actions.push(act);
    if (act === 'getjson') return json(entries);
    if (act === 'add') {
      assert.match(url.searchParams.get('meno')!, /stock-dashboard/);
      entries.push({ ip: url.searchParams.get('ip')!, memo: '' });
    } else {
      assert.equal(url.searchParams.get('ip'), oldIp);
      entries.splice(entries.findIndex((entry) => entry.ip === oldIp), 1);
    }
    return new Response('');
  });
  const result = await syncWhitelist(credentials, oldIp);
  assert.deepEqual(actions, ['getjson', 'add', 'getjson', 'del', 'getjson']);
  assert.equal(result.ip, currentIp);
  assert.equal(result.managedIp, currentIp);
  assert.equal(result.removedOld, true);
  assert.deepEqual(result.entries.map((entry) => entry.ip), [unrelatedIp, currentIp]);
});

test('新增失败或未确认新增时绝不删除旧IP', async (t) => {
  const actions: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/OnlyIp.aspx') return new Response(currentIp);
    const act = url.searchParams.get('act')!;
    actions.push(act);
    return act === 'getjson' ? json([oldIp]) : new Response('');
  });
  await assert.rejects(syncWhitelist(credentials, oldIp), /保留旧 IP/);
  assert.deepEqual(actions, ['getjson', 'add', 'getjson']);
});

test('清理失败保留调用者跟踪信息，可重试；禁止all与非法IP删除', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    calls++;
    const url = new URL(input);
    if (url.pathname === '/OnlyIp.aspx') return new Response(currentIp);
    if (url.searchParams.get('act') === 'del') throw new Error(`network ${credentials.ukey}`);
    return json([currentIp, oldIp]);
  });
  await assert.rejects(syncWhitelist(credentials, oldIp), /保留原跟踪记录/);
  const count = calls;
  await assert.rejects(removeWhitelistIp(credentials, 'all'), /单个/);
  await assert.rejects(syncWhitelist(credentials, 'all'), /未修改/);
  assert.equal(calls, count);
});

test('当前IP已存在时不重复新增，无跟踪记录不删除任何IP', async (t) => {
  const actions: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/OnlyIp.aspx') return new Response(currentIp);
    actions.push(url.searchParams.get('act')!);
    return json([currentIp, unrelatedIp]);
  });
  assert.equal((await syncWhitelist(credentials, '')).removedOld, false);
  assert.deepEqual(actions, ['getjson']);
});

test('现有当前IP属于用户或其他应用时不接管所有权', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/OnlyIp.aspx') return new Response(currentIp);
    assert.equal(url.searchParams.get('act'), 'getjson');
    return json([{ ip: currentIp, memo: '用户手动添加' }]);
  });
  const existing = await syncWhitelist(credentials, '');
  assert.equal(existing.ip, currentIp);
  assert.equal(existing.managedIp, '');
  assert.equal(existing.removedOld, false);
  assert.equal((await syncWhitelist(credentials, currentIp)).managedIp, currentIp, '已跟踪的当前IP保留所有权');
});

test('新增后旧IP删除失败可通过项目备注重新识别当前IP并安全重试', async (t) => {
  const entries = [{ ip: oldIp, memo: 'stock-dashboard 自动同步' }, { ip: unrelatedIp, memo: '其他应用' }];
  let deleteFails = true;
  let additions = 0;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    if (url.pathname === '/OnlyIp.aspx') return new Response(currentIp);
    const act = url.searchParams.get('act');
    if (act === 'getjson') return json(entries.map((entry) => ({ IP: entry.ip, meno: entry.memo })));
    if (act === 'add') {
      additions++;
      entries.push({ ip: currentIp, memo: url.searchParams.get('meno')! });
    } else {
      assert.equal(url.searchParams.get('ip'), oldIp);
      if (deleteFails) throw new Error('offline');
      entries.splice(entries.findIndex((entry) => entry.ip === oldIp), 1);
    }
    return new Response('');
  });
  await assert.rejects(syncWhitelist(credentials, oldIp), /保留原跟踪记录/);
  deleteFails = false;
  const retry = await syncWhitelist(credentials, oldIp);
  assert.equal(additions, 1);
  assert.equal(retry.managedIp, currentIp);
  assert.equal(retry.removedOld, true);
  assert.deepEqual(retry.entries.map((entry) => entry.ip), [unrelatedIp, currentIp]);
});

test('拒绝未确认的删除结果，网络异常与业务错误不回显密钥', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json([currentIp]));
  await assert.rejects(removeWhitelistIp(credentials, currentIp), /未确认/);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error(`https://fake/?ukey=${credentials.ukey}&vkey=${credentials.vkey}`); });
  await assert.rejects(getWhitelist(credentials), (error: Error) => !error.message.includes(credentials.ukey) && !error.message.includes(credentials.vkey));
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: -1, msg: credentials.ukey })));
  await assert.rejects(getWhitelist(credentials), (error: Error) => !error.message.includes(credentials.ukey));
});

test('提取URL保留指定参数，HTTPS失败不自动降级HTTP', async (t) => {
  const url = new URL(getProxyExtractionUrl({ ...credentials, ukey: '' }));
  assert.equal(url.href.startsWith('http://api.xiequ.cn/VAD/GetIp.aspx?'), true);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    act: 'get', uid: credentials.uid, vkey: credentials.vkey, num: '5', time: '30', plat: '1', re: '0',
    type: '0', so: '1', ow: '1', spl: '1', addr: '', db: '1',
  });
  const calls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => { calls.push(new URL(input)); throw new Error('TLS failure'); });
  await assert.rejects(extractProxyEndpoints(credentials), /请求失败/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].protocol, 'https:');
  t.mock.method(globalThis, 'fetch', async () => new Response(`${currentIp}:8080`));
  assert.deepEqual(await extractProxyEndpoints(credentials), [{ ip: currentIp, port: 8080 }]);
  assert.throws(() => getProxyExtractionUrl({ ...credentials, vkey: '' }), /VKey/);
  t.mock.method(globalThis, 'fetch', async () => json([]));
  assert.deepEqual(await getWhitelist({ ...credentials, vkey: '' }), []);
});
