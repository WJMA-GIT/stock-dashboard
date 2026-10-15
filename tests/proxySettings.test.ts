import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('代理配置兼容旧设置，按账户校验跟踪IP，设置页不会自动操作账户', async (t) => {
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
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('渲染设置页不应发起账户请求'); });
  const server = await createServer({
    configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, ws: false },
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  });
  t.after(() => server.close());
  const { getSettings, saveSettings } = await server.ssrLoadModule('/src/services/storage.ts');
  const { AppSettingsContext } = await server.ssrLoadModule('/src/contexts/appSettingsContext.ts');
  const { Settings } = await server.ssrLoadModule('/src/pages/Settings/Settings.tsx');

  saved.set('app.settings', JSON.stringify({ colorMode: 'green-rise', refreshInterval: { list: 30000 } }));
  const legacy = getSettings();
  assert.equal(legacy.colorMode, 'green-rise');
  assert.equal(legacy.refreshInterval.list, 30000);
  assert.deepEqual(legacy.proxyManagement, { uid: '', ukey: '', vkey: '', autoSync: false, managedIps: {} });

  const configured = { ...legacy, proxyManagement: {
    uid: '12345', ukey: 'test-white-key', vkey: 'test-extract-key', autoSync: false,
    managedIps: { '12345': '203.0.113.1', '67890': '198.51.100.1' },
  } };
  saveSettings(configured);
  assert.deepEqual(getSettings().proxyManagement, configured.proxyManagement);
  assert.equal(getSettings().refreshInterval.list, 30000);

  saved.set('app.settings', JSON.stringify({ proxyManagement: {
    uid: null, ukey: 123, vkey: {}, autoSync: 'true',
    managedIps: { '12345': '203.0.113.1', '67890': '999.0.0.1', 'all': '198.51.100.1' },
  } }));
  assert.deepEqual(getSettings().proxyManagement, {
    uid: '', ukey: '', vkey: '', autoSync: false, managedIps: { '12345': '203.0.113.1' },
  });

  const html = renderToStaticMarkup(createElement(AppSettingsContext.Provider, {
    value: { settings: legacy, updateSettings: () => {}, getRefreshInterval: () => 15000 },
  }, createElement(Settings)));
  assert.match(html, /代理与白名单管理/);
  assert.match(html, /同步并打开提取页/);
  assert.match(html, /手动应用代理/);
  assert.match(html, /仅清理本程序/);
  assert.equal((html.match(/type="password"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /test-white-key|test-extract-key/);
  assert.equal(requests, 0);
});
