export interface ProxyCredentials { uid: string; ukey: string; vkey: string }
export interface WhiteListEntry { ip: string; memo: string }
export interface ProxyEndpoint { ip: string; port: number; location?: string }

export const PROXY_MANAGEMENT_URLS = /^https?:\/\/(?:www|op|api)\.xiequ\.cn(?:[:/]|$)/i;
const MANAGED_MEMO = 'stock-dashboard 自动同步';

export function isIPv4(value: string): boolean {
  return /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value) &&
    value.split('.').every((part) => Number(part) <= 255);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function request(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error();
    return await response.text();
  } catch {
    // 不透传 fetch 错误，避免带认证参数的 URL 进入页面或日志。
    throw new Error('携趣请求失败或超时，请检查网络后重试');
  }
}

function decode(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error('携趣返回的数据格式无效'); }
}

function successfulData(value: unknown): unknown {
  if (!record(value) || value.code !== 0 || value.success === false || value.success === 'false') {
    throw new Error('携趣接口返回失败，请检查认证信息、白名单或账户状态');
  }
  return value.data;
}

function whitelistUrl(credentials: ProxyCredentials, act: string, ip?: string): string {
  if (!credentials.uid.trim() || !credentials.ukey.trim()) throw new Error('请填写用户 UID 和白名单 UKey');
  const url = new URL('https://op.xiequ.cn/IpWhiteList.aspx');
  url.search = new URLSearchParams({ uid: credentials.uid.trim(), ukey: credentials.ukey.trim(), act }).toString();
  if (ip !== undefined) url.searchParams.set('ip', ip);
  if (act === 'add') url.searchParams.set('meno', MANAGED_MEMO);
  return url.href;
}

export async function detectPublicIp(): Promise<string> {
  const results = await Promise.all(['123', '567'].map((yyy) => request(`https://www.xiequ.cn/OnlyIp.aspx?yyy=${yyy}`)));
  const ips = results.map((value) => value.trim());
  if (!ips.every(isIPv4) || ips[0] !== ips[1]) throw new Error('两次公网 IP 检测无效或不一致，请稳定网络后重试');
  return ips[0];
}

export function parseWhitelist(text: string): WhiteListEntry[] {
  const trimmed = text.trim();
  let value: unknown = trimmed;
  if (/^[{[]/.test(trimmed)) {
    const response = decode(trimmed);
    // 白名单 getjson 实测仅含 data/IP/MEMO，不能套用代理提取接口的 code 契约。
    value = record(response) && !('code' in response) && Array.isArray(response.data) &&
      response.success !== false && response.success !== 'false' ? response.data : successfulData(response);
  }
  if (typeof value === 'string') {
    if (!value.trim()) return [];
    value = value.trim().split(/[,;\s]+/);
  }
  if (!Array.isArray(value)) throw new Error('白名单数据格式无效');
  return value.map((entry: unknown) => {
    const ip = typeof entry === 'string' ? entry : record(entry) ? entry.ip ?? entry.IP ?? entry.Ip : null;
    const memo = record(entry) ? entry.MEMO ?? entry.memo ?? entry.meno ?? entry.Memo ?? entry.Meno ?? '' : '';
    if (typeof ip !== 'string' || !isIPv4(ip) || typeof memo !== 'string') throw new Error('白名单含无效 IP 或备注');
    return { ip, memo };
  });
}

export async function getWhitelist(credentials: ProxyCredentials): Promise<WhiteListEntry[]> {
  return parseWhitelist(await request(whitelistUrl(credentials, 'getjson')));
}

async function mutateWhitelist(credentials: ProxyCredentials, act: 'add' | 'del', ip: string): Promise<void> {
  if (!isIPv4(ip)) throw new Error('只能操作单个有效 IPv4 地址');
  const text = (await request(whitelistUrl(credentials, act, ip))).trim();
  if (/^[{[]/.test(text)) successfulData(decode(text));
  else if (/^(?:err|error|fail)/i.test(text)) throw new Error('白名单操作失败，请检查账户状态');
}

export async function removeWhitelistIp(credentials: ProxyCredentials, ip: string): Promise<void> {
  await mutateWhitelist(credentials, 'del', ip);
  if ((await getWhitelist(credentials)).some((entry) => entry.ip === ip)) throw new Error('未确认白名单 IP 已删除，请重试');
}

export async function syncWhitelist(credentials: ProxyCredentials, previousManagedIp: string): Promise<{
  ip: string; entries: WhiteListEntry[]; removedOld: boolean; managedIp: string;
}> {
  if (previousManagedIp && !isIPv4(previousManagedIp)) throw new Error('之前跟踪的 IP 无效，未修改白名单');
  whitelistUrl(credentials, 'getjson');
  const ip = await detectPublicIp();
  let entries = await getWhitelist(credentials);
  let addedCurrent = false;
  if (!entries.some((entry) => entry.ip === ip)) {
    await mutateWhitelist(credentials, 'add', ip);
    entries = await getWhitelist(credentials);
    if (!entries.some((entry) => entry.ip === ip)) throw new Error('未确认当前 IP 已加入白名单，已保留旧 IP');
    addedCurrent = true;
  }
  const removedOld = !!previousManagedIp && previousManagedIp !== ip && entries.some((entry) => entry.ip === previousManagedIp);
  if (removedOld) {
    try {
      await removeWhitelistIp(credentials, previousManagedIp);
      entries = entries.filter((entry) => entry.ip !== previousManagedIp);
    } catch {
      throw new Error('当前 IP 已确认加入，但旧 IP 清理失败；保留原跟踪记录后重试');
    }
  }
  const managedIp = addedCurrent || ip === previousManagedIp || entries.some((entry) => entry.ip === ip && entry.memo === MANAGED_MEMO) ? ip : '';
  return { ip, entries, removedOld, managedIp };
}

export function parseProxyEndpoints(text: string): ProxyEndpoint[] {
  const trimmed = text.trim();
  let value: unknown = trimmed;
  if (/^[{[]/.test(trimmed)) value = successfulData(decode(trimmed));
  if (typeof value === 'string') value = value.trim().split(/[\r\n,;\s]+/).filter(Boolean);
  if (!Array.isArray(value) || value.length === 0) throw new Error('未获得有效代理地址');
  return value.map((entry: unknown) => {
    const parts = typeof entry === 'string' ? /^(\d+\.\d+\.\d+\.\d+):(\d+)$/.exec(entry) : null;
    const ip = parts ? parts[1] : record(entry) ? entry.IP ?? entry.ip : null;
    const rawPort = parts ? parts[2] : record(entry) ? entry.Port ?? entry.port : null;
    const port = typeof rawPort === 'number' || typeof rawPort === 'string' ? Number(rawPort) : NaN;
    const location = record(entry) ? entry.IpAddress ?? entry.location : undefined;
    if (typeof ip !== 'string' || !isIPv4(ip) || !Number.isInteger(port) || port < 1 || port > 65535 ||
      (location !== undefined && typeof location !== 'string')) throw new Error('代理地址或端口无效');
    return { ip, port, ...(location ? { location } : {}) };
  });
}

export function getProxyExtractionUrl(credentials: ProxyCredentials, protocol: 'http:' | 'https:' = 'http:'): string {
  if (!credentials.uid.trim() || !credentials.vkey.trim()) throw new Error('请填写用户 UID 和提取 VKey');
  if (protocol !== 'http:' && protocol !== 'https:') throw new Error('提取协议无效');
  const url = new URL(`${protocol}//api.xiequ.cn/VAD/GetIp.aspx`);
  url.search = new URLSearchParams({
    act: 'get', uid: credentials.uid.trim(), vkey: credentials.vkey.trim(), num: '5', time: '30',
    plat: '1', re: '0', type: '0', so: '1', ow: '1', spl: '1', addr: '', db: '1',
  }).toString();
  return url.href;
}

export async function extractProxyEndpoints(credentials: ProxyCredentials): Promise<ProxyEndpoint[]> {
  return parseProxyEndpoints(await request(getProxyExtractionUrl(credentials, 'https:')));
}
