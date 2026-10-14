import { jsonpRequest } from 'stock-sdk';

export type FundFlowRankingType = 'industry' | 'concept' | 'stock';
type Direction = 'inflow' | 'outflow';

export interface FundFlowRankingRow {
  code: string;
  name: string;
  mainNetInflow: number;
  mainNetInflowPercent: number | null;
}

export interface FundFlowRankingSnapshot {
  rows: FundFlowRankingRow[];
  total: number;
  fetchedAt: number;
  dataTime: number | null;
  source: 'eastmoney' | 'eastmoney-delay';
  stale: boolean;
}

export const FUND_FLOW_PAGE_SIZE = 50;
const TTL = 30000;
const cache = new Map<string, FundFlowRankingSnapshot>();
const pending = new Map<string, Promise<FundFlowRankingSnapshot>>();
const MARKETS = {
  industry: 'm:90+t:2',
  concept: 'm:90+t:3',
  stock: 'm:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:7+f:!2,m:1+t:3+f:!2',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRow(value: unknown): value is FundFlowRankingRow {
  return isRecord(value) && typeof value.code === 'string' && /^(?:\d{6}|BK\d+)$/.test(value.code) &&
    typeof value.name === 'string' && value.name.trim().length > 0 &&
    typeof value.mainNetInflow === 'number' && Number.isFinite(value.mainNetInflow) &&
    (value.mainNetInflowPercent === null || (typeof value.mainNetInflowPercent === 'number' && Number.isFinite(value.mainNetInflowPercent)));
}

function isSnapshot(value: unknown): value is FundFlowRankingSnapshot {
  return isRecord(value) && Array.isArray(value.rows) && value.rows.every(isRow) &&
    typeof value.total === 'number' && Number.isInteger(value.total) && value.total > 0 &&
    typeof value.fetchedAt === 'number' && value.fetchedAt > 0 && value.fetchedAt <= Date.now() &&
    (value.dataTime === null || (typeof value.dataTime === 'number' && value.dataTime > 0 && value.dataTime <= Date.now() + 60000)) &&
    (value.source === 'eastmoney' || value.source === 'eastmoney-delay') && typeof value.stale === 'boolean';
}

function cacheKey(type: FundFlowRankingType, page: number, direction: Direction) {
  return `stock-dashboard:fund-flow:v1:${type}:${direction}:${page}`;
}

/** 上次成功的数据立即可读；过期后仍可展示，但必须显示时间与历史快照标记。 */
export function readFundFlowRanking(type: FundFlowRankingType, page = 1, direction: Direction = 'inflow') {
  const key = cacheKey(type, page, direction);
  let snapshot = cache.get(key);
  if (!snapshot) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (isSnapshot(saved)) {
        snapshot = saved;
        cache.set(key, saved);
      }
    } catch { /* 禁用存储或旧缓存损坏不阻止网络取数。 */ }
  }
  return snapshot ? { ...snapshot, stale: snapshot.stale || Date.now() - snapshot.fetchedAt >= TTL } : null;
}

function parseResponse(response: unknown, page: number): Pick<FundFlowRankingSnapshot, 'rows' | 'total' | 'dataTime'> {
  if (!isRecord(response) || response.rc !== 0 || !isRecord(response.data)) throw new Error('资金流接口返回异常');
  const { diff, total } = response.data;
  if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0) throw new Error('资金流接口暂未提供有效数据');
  const expected = Math.max(0, Math.min(FUND_FLOW_PAGE_SIZE, total - (page - 1) * FUND_FLOW_PAGE_SIZE));
  // 东财在末页可能以 null 表示 diff；只有超过 total 才能确认这是正常空页。
  const rawRows = diff == null && expected === 0 ? [] : diff;
  if (!Array.isArray(rawRows) || rawRows.length !== expected) {
    throw new Error('资金流接口数据不完整');
  }
  const rows: FundFlowRankingRow[] = [];
  const times: number[] = [];
  for (const raw of rawRows) {
    if (!isRecord(raw)) throw new Error('资金流数据格式异常');
    const row = {
      code: String(raw.f12 ?? ''),
      name: String(raw.f14 ?? ''),
      mainNetInflow: numberOrNull(raw.f62),
      mainNetInflowPercent: numberOrNull(raw.f184),
    };
    if (!isRow(row)) throw new Error('资金流数据缺少有效金额');
    rows.push(row);
    const time = numberOrNull(raw.f124);
    if (time !== null && time > 0 && time * 1000 <= Date.now() + 60000) times.push(time * 1000);
  }
  return { rows, total, dataTime: times.length ? Math.max(...times) : null };
}

/** 使用 SDK 的 JSONP 传输避免浏览器 CORS，独立取前列，避免其他东财接口的熔断连带阻断。 */
export async function getFundFlowRanking(
  type: FundFlowRankingType,
  page = 1,
  direction: Direction = 'inflow',
  force = false
): Promise<FundFlowRankingSnapshot> {
  if (!Object.hasOwn(MARKETS, type) || !Number.isInteger(page) || page < 1 || !['inflow', 'outflow'].includes(direction)) {
    throw new Error('资金流分页参数无效');
  }
  const key = cacheKey(type, page, direction);
  const previous = readFundFlowRanking(type, page, direction);
  if (!force && previous && !previous.stale) return previous;
  const active = pending.get(key);
  if (active) return active;

  const request = (async () => {
    try {
      const params = new URLSearchParams({
        pn: String(page), pz: String(FUND_FLOW_PAGE_SIZE), po: direction === 'inflow' ? '1' : '0',
        np: '1', fltt: '2', invt: '2', fid: 'f62', fs: MARKETS[type],
        fields: 'f12,f14,f62,f184,f124', ut: 'b2884a393a59ad64002292a3e90d46a5',
        _: String(Date.now()),
      });
      let failure: unknown;
      for (const host of ['push2.eastmoney.com', 'push2delay.eastmoney.com']) {
        try {
          const response = await jsonpRequest(`https://${host}/api/qt/clist/get?${params}`, { callbackParam: 'cb', timeout: 4000 });
          const data = parseResponse(response, page);
          const snapshot: FundFlowRankingSnapshot = {
            ...data, fetchedAt: Date.now(), stale: false,
            source: host === 'push2delay.eastmoney.com' ? 'eastmoney-delay' : 'eastmoney',
          };
          cache.set(key, snapshot);
          try { localStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* 存储不可用时仍保留内存快照。 */ }
          return snapshot;
        } catch (error) { failure = error; }
      }
      throw failure;
    } catch (error) {
      if (previous) return { ...previous, stale: true };
      throw error;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, request);
  return request;
}
