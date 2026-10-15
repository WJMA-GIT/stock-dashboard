import { useCallback, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { Button, Card } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import {
  detectPublicIp, getWhitelist,
  parseProxyEndpoints, removeWhitelistIp, syncWhitelist,
  type ProxyEndpoint, type WhiteListEntry,
} from '@/services/proxyManagement';
import styles from './Settings.module.css';

export function ProxyManagement() {
  const { settings, updateSettings } = useAppSettings();
  const config = settings.proxyManagement;
  const [draft, setDraft] = useState({ uid: config.uid, ukey: config.ukey, vkey: config.vkey });
  const [currentIp, setCurrentIp] = useState('');
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [entries, setEntries] = useState<WhiteListEntry[]>([]);
  const [proxies, setProxies] = useState<ProxyEndpoint[]>([]);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = draft.uid !== config.uid || draft.ukey !== config.ukey || draft.vkey !== config.vkey;
  const hasWhiteCredentials = /^\d+$/.test(config.uid) && !!config.ukey.trim() && !dirty;

  const run = useCallback(async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError('');
    setMessage('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试'); }
    finally { busyRef.current = false; setBusy(''); }
  }, []);

  const synchronize = useCallback(async () => {
    const result = await syncWhitelist(config, config.managedIps[config.uid] ?? '');
    setCurrentIp(result.ip);
    setLastCheck(Date.now());
    setEntries(result.entries);
    const managedIps = { ...config.managedIps };
    if (result.managedIp) managedIps[config.uid] = result.managedIp;
    else delete managedIps[config.uid];
    updateSettings({ proxyManagement: { ...config, managedIps } });
    setMessage(result.removedOld ? '新出口 IP 已加入白名单，已清理本程序维护的旧 IP。' : '当前出口 IP 已确认在白名单中。');
  }, [config, updateSettings]);

  const autoSynchronize = useCallback(async () => {
    await run('自动同步', synchronize);
  }, [run, synchronize]);
  // shortcut: 自动同步仅在设置页挂载时运行；需全站持续维护时移至应用级组件。
  usePolling(autoSynchronize, {
    enabled: config.autoSync && hasWhiteCredentials,
    interval: 60000,
    pauseOnHidden: true,
  });

  const save = () => {
    const next = { uid: draft.uid.trim(), ukey: draft.ukey.trim(), vkey: draft.vkey.trim() };
    if (next.uid && !/^\d+$/.test(next.uid)) { setError('uid 必须为数字'); return; }
    setDraft(next);
    updateSettings({ proxyManagement: { ...config, ...next } });
    setCurrentIp('');
    setLastCheck(null);
    setEntries([]);
    setProxies([]);
    setError('');
    setMessage('代理账户配置已保存在当前浏览器。');
  };

  const remove = (ip: string) => run('删除白名单', async () => {
    await removeWhitelistIp(config, ip);
    setEntries(await getWhitelist(config));
    if (config.managedIps[config.uid] === ip) {
      const managedIps = { ...config.managedIps };
      delete managedIps[config.uid];
      updateSettings({ proxyManagement: { ...config, managedIps } });
    }
    setMessage(`已删除白名单 IP：${ip}`);
  });

  return (
    <Card>
      <div className={styles.section}>
        <div className={styles.sectionHeader}><Globe size={18} className={styles.sectionIcon} /><h3>代理与白名单管理</h3></div>
        <p className={styles.settingDesc}>这里只管理携趣白名单和提取地址；请在系统或浏览器中手动应用代理，行情请求不会由本页自动切换。</p>
        <p className={styles.settingDesc}>请将 www.xiequ.cn、op.xiequ.cn、api.xiequ.cn 配置为直连，避免把代理出口误当作白名单 IP。</p>
        <div className={styles.sectionContent}>
          {([['uid', '账户 uid'], ['ukey', '白名单 ukey'], ['vkey', '提取 vkey']] as const).map(([key, label]) => (
            <label key={key} className={styles.settingItem}>
              <span className={styles.settingLabel}>{label}</span>
              <input className={styles.textInput} type={key === 'uid' ? 'text' : 'password'} inputMode={key === 'uid' ? 'numeric' : undefined}
                autoComplete="off" spellCheck={false} value={draft[key]} disabled={!!busy}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          ))}
          <div className={styles.proxyActions}>
            <Button size="sm" disabled={!!busy || !dirty} onClick={save}>保存账户配置</Button>
            <span className={styles.settingDesc}>密钥仅保存在当前浏览器，不写入项目代码。修改后请先保存。</span>
          </div>
          <label className={styles.proxyToggle}>
            <input type="checkbox" checked={config.autoSync} disabled={!!busy || (!config.autoSync && !hasWhiteCredentials)}
              onChange={(event) => updateSettings({ proxyManagement: { ...config, autoSync: event.target.checked } })} />
            停留在设置页时，每分钟自动检测并同步白名单
          </label>
          <p className={styles.settingDesc}>仅清理本程序为同一账户维护的旧 IP。先添加并验证新 IP；检测结果不一致或添加失败时，不删除旧记录。</p>
          <div className={styles.proxyActions}>
            <Button size="sm" disabled={!!busy} onClick={() => void run('检测出口', async () => {
              setCurrentIp(await detectPublicIp()); setLastCheck(Date.now());
              setMessage('两次出口检测一致。请确认携趣域名使用直连。');
            })}>检测当前出口 IP</Button>
            <Button size="sm" disabled={!!busy || !hasWhiteCredentials} onClick={() => void run('读取白名单', async () => {
              setEntries(await getWhitelist(config)); setMessage('白名单已读取。');
            })}>读取白名单</Button>
            <Button size="sm" disabled={!!busy || !hasWhiteCredentials} onClick={() => void run('同步白名单', synchronize)}>同步当前 IP 到白名单</Button>
            <a href="https://www.xiequ.cn/AutoCheckIp.html" target="_blank" rel="noopener noreferrer">打开供应商检测页</a>
          </div>
          <p className={styles.settingDesc}>检测出口：{currentIp || '尚未检测'}{lastCheck ? ` · ${new Date(lastCheck).toLocaleString('zh-CN', { hour12: false })}` : ''}</p>
          <div className={styles.proxyList}>
            {entries.length ? entries.map((entry) => (
              <div key={entry.ip} className={styles.proxyEntry}>
                <span>{entry.ip}{entry.memo ? ` · ${entry.memo}` : ''}{config.managedIps[config.uid] === entry.ip ? ' · 本程序维护' : ''}</span>
                <Button size="sm" disabled={!!busy || !hasWhiteCredentials} onClick={() => void remove(entry.ip)}>删除 {entry.ip}</Button>
              </div>
            )) : <span className={styles.settingDesc}>尚未读取白名单或白名单为空</span>}
          </div>
          <p className={styles.settingDesc}>代理提取仅使用 HTTP 接口。HTTPS 网页可能被浏览器阻止读取该接口；普通网页无法直接把 IP:端口设置为请求代理。</p>
          <label className={styles.proxyImport}>
            <span className={styles.settingLabel}>粘贴代理接口返回的文本或 JSON</span>
            <textarea className={styles.proxyTextarea} rows={4} value={importText} disabled={!!busy}
              placeholder={'203.0.113.10:8888'} onChange={(event) => setImportText(event.target.value)} />
          </label>
          <div className={styles.proxyActions}>
            <Button size="sm" disabled={!!busy || !importText.trim()} onClick={() => void run('解析结果', async () => {
              const result = parseProxyEndpoints(importText); setProxies(result);
              setMessage(`已解析 ${result.length} 个代理地址。`);
            })}>解析代理地址</Button>
            <Button size="sm" disabled={!!busy || !proxies.length} onClick={() => void run('复制地址', async () => {
              await navigator.clipboard.writeText(proxies.map((proxy) => `${proxy.ip}:${proxy.port}`).join('\n'));
              setMessage('代理地址已复制，请在系统或浏览器中应用。');
            })}>复制代理列表</Button>
          </div>
          {proxies.length > 0 && <textarea className={styles.proxyTextarea} aria-label="已解析的代理地址" readOnly rows={Math.min(proxies.length + 1, 8)}
            value={proxies.map((proxy) => `${proxy.ip}:${proxy.port}${proxy.location ? ` · ${proxy.location}` : ''}`).join('\n')} />}
          <div role="status" aria-live="polite" className={styles.settingDesc}>{busy ? `${busy}中…` : message}</div>
          {error && <p role="alert" className={styles.proxyError}>{error}</p>}
        </div>
      </div>
    </Card>
  );
}
