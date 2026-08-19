/**
 * Stock SDK 服务层
 * 封装 SDK 调用，提供缓存与错误处理
 *
 * 单位契约：经本层 A 股出口的金额字段统一为——市值:亿元、成交额/资金流:万元。
 * 东财板块接口原样透传 f20/f6（单位:元），在本层归一；腾讯 FullQuote.amount(万)、
 * totalMarketCap(亿)、fundFlow(万) 原生即符合契约，直接透传。全球市场保留源币种。
 */

import { StockSDK } from 'stock-sdk';
import { calcChipDistribution } from 'stock-sdk/indicators';
import type { CacheItem } from '@/types';
import type { DividendDetail, SearchResult as SDKSearchResult } from 'stock-sdk';
import { normalizeStockCode } from '@/utils/format';
import { getComparableTradingTime, sumMinuteAmount } from './marketAmountComparison';
import { parseStockBoardMembership, type StockBoardRef } from './stockBoardMembership';

export type SearchEntityType = 'stock' | 'industry' | 'concept' | 'unsupported';

export interface AppSearchResult extends SDKSearchResult {
  entityType: SearchEntityType;
  isSupported: boolean;
  route: string | null;
  typeLabel: string;
}

const SEARCH_CATEGORY_LABELS: Record<string, string> = {
  stock: '股票',
  index: '指数',
  fund: '基金',
  bond: '债券',
  futures: '期货',
  option: '期权',
  other: '其他',
};

export function getSearchTypeLabel(item: Pick<SDKSearchResult, 'type' | 'category'>): string {
  return SEARCH_CATEGORY_LABELS[item.category ?? ''] ?? item.type;
}

/**
 * 统一的搜索实体路由解析：搜索结果与历史记录共用，避免两处映射漂移。
 * '行业板块'/'概念板块' 分支仅为兼容旧版本存下的搜索历史（SDK v2 搜索不再返回板块实体）。
 */
export function resolveSearchRoute(item: {
  code: string;
  market?: string;
  type?: string;
}): { entityType: SearchEntityType; route: string | null } {
  if (item.type === '行业板块') {
    return { entityType: 'industry', route: `/boards/industry/${item.code}` };
  }
  if (item.type === '概念板块') {
    return { entityType: 'concept', route: `/boards/concept/${item.code}` };
  }

  const normalizedCode = normalizeStockCode(item.code);
  if (
    item.market &&
    ['sh', 'sz', 'bj'].includes(item.market.toLowerCase()) &&
    /^(sh|sz|bj)\d{6}$/i.test(normalizedCode)
  ) {
    return { entityType: 'stock', route: `/s/${normalizedCode}` };
  }

  return { entityType: 'unsupported', route: null };
}

// SDK 单例
export const sdk = new StockSDK({
  timeout: 30000,
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  rateLimit: {
    requestsPerSecond: 4,
    maxBurst: 8,
  },
  circuitBreaker: {
    failureThreshold: 8,
    resetTimeout: 30000,
    halfOpenRequests: 1,
  },
});

// 内存缓存
const cache = new Map<string, CacheItem<unknown>>();

// 默认 TTL 配置（毫秒）
// 优化：增加缓存时间以减少 API 请求频率
const DEFAULT_TTL = {
  boardList: 60000, // 板块列表 60s（从 30s 增加）
  constituents: 180000, // 成分股 3min（从 2min 增加）
  historyKline: 600000, // 历史 K 线 10min
  indicatorKline: 600000, // 指标 K 线 10min
  quotes: 5000, // 实时行情 5s（从 3s 增加）
  fundFlow: 30000, // 资金流 30s（从 10s 增加）
  timeline: 5000, // 分时 5s（从 3s 增加）
  dividends: 21600000, // 分红数据 6h
  capitalHistory: 30000, // 资金流历史 30s
  northbound: 30000, // 北向资金 30s
  stockChanges: 15000, // 异动池 15s
  boardChanges: 30000, // 板块异动 30s
  dragonTiger: 3600000, // 龙虎榜 1h
  blockTrade: 3600000, // 大宗交易 1h
  margin: 21600000, // 融资融券 6h
  marketSnapshot: 60000, // 全市场快照 60s（约 10+ 请求/次，Dashboard/Scanner/analysis 共享）
  globalMarket: 30000, // 海外行情 30s
};

function normalizeSearchResult(item: SDKSearchResult): AppSearchResult {
  const typeLabel = getSearchTypeLabel(item);
  // 详情页只接入了 A 股股票/指数；基金、债券等 category 一律标记不支持
  const categorySupported =
    item.category === undefined || ['stock', 'index'].includes(item.category);
  const { entityType, route } = categorySupported
    ? resolveSearchRoute(item)
    : { entityType: 'unsupported' as const, route: null };

  if (entityType === 'stock' && route) {
    return {
      ...item,
      code: normalizeStockCode(item.code),
      entityType,
      isSupported: true,
      route,
      typeLabel,
    };
  }

  return {
    ...item,
    entityType: 'unsupported',
    isSupported: false,
    route: null,
    typeLabel,
  };
}

/**
 * 生成缓存键
 */
function getCacheKey(method: string, ...args: unknown[]): string {
  return `${method}:${JSON.stringify(args)}`;
}

/**
 * 从缓存获取数据
 */
function getFromCache<T>(key: string): T | null {
  const item = cache.get(key) as CacheItem<T> | undefined;
  if (!item) return null;

  const now = Date.now();
  if (now - item.timestamp > item.ttl) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

/**
 * 设置缓存
 */
function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

// 在途请求去重：缓存只在 resolve 后写入，并发调用（如 Dashboard 与 Scanner 同时拉快照）会各发一份
const inFlight = new Map<string, Promise<unknown>>();

/**
 * 带缓存的 SDK 调用包装器
 */
async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = getFromCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      setCache(key, data, ttl);
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

// ========== 实时行情 API ==========

/**
 * 获取完整行情（A股/指数）
 */
export async function getFullQuotes(codes: string[], useCache = true) {
  const key = getCacheKey('getFullQuotes', codes);
  if (useCache) {
    return withCache(key, DEFAULT_TTL.quotes, () => sdk.quotes.cn(codes));
  }
  return sdk.quotes.cn(codes);
}

/**
 * 批量获取行情
 */
export async function getAllQuotesByCodes(
  codes: string[],
  options?: {
    batchSize?: number;
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  }
) {
  return sdk.batch.byCodes(codes, options);
}

/**
 * 获取全部 A 股行情（60s 快照缓存；缓存命中时 onProgress 不会触发）
 */
export async function getAllAShareQuotes(options?: {
  batchSize?: number;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}) {
  const key = getCacheKey('getAllAShareQuotes', options?.batchSize, options?.concurrency);
  return withCache(key, DEFAULT_TTL.marketSnapshot, () => sdk.batch.cn(options));
}

/** 获取指定美股/指数/ETF 行情（金额保留美元口径） */
export async function getUSQuotes(codes: string[]) {
  const key = getCacheKey('getUSQuotes', codes);
  return withCache(key, DEFAULT_TTL.globalMarket, () => sdk.quotes.us(codes));
}

/** 获取全球期货实时行情 */
export async function getGlobalFuturesSpot() {
  const key = getCacheKey('getGlobalFuturesSpot');
  return withCache(key, DEFAULT_TTL.globalMarket, () =>
    sdk.futures.globalSpot({ pageSize: 1000 })
  );
}

/** 获取美股当前交易阶段 */
export function getUSMarketStatus() {
  return sdk.calendar.marketStatus('US');
}

/**
 * 沪深两市当前与上一交易日同刻成交额对比。
 * 指数分钟成交额为逐分钟值，汇总后换算为万元，与 Dashboard 金额单位一致。
 */
export async function getMarketAmountComparison(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const isTradingToday = await sdk.calendar.isTradingDay(today);
  const currentDate = isTradingToday ? today : await sdk.calendar.prevTradingDay(today);
  const previousDate = await sdk.calendar.prevTradingDay(currentDate);
  const comparisonTime = isTradingToday
    ? getComparableTradingTime(Number(parts.hour), Number(parts.minute))
    : '15:00';

  if (!comparisonTime) {
    return { currentAmount: null, previousAmount: null, difference: null, comparisonTime };
  }

  const key = getCacheKey('getMarketAmountComparison', currentDate, previousDate, comparisonTime);
  return withCache(key, DEFAULT_TTL.fundFlow, async () => {
    const options = {
      period: '1' as const,
      startDate: previousDate.replaceAll('-', ''),
      endDate: currentDate.replaceAll('-', ''),
    };
    const [shRows, szRows] = await Promise.all([
      sdk.kline.cnMinute('sh000001', options),
      sdk.kline.cnMinute('sz399001', options),
    ]);
    const currentAmount =
      (sumMinuteAmount(shRows, currentDate, comparisonTime) +
        sumMinuteAmount(szRows, currentDate, comparisonTime)) /
      1e4;
    const previousAmount =
      (sumMinuteAmount(shRows, previousDate, comparisonTime) +
        sumMinuteAmount(szRows, previousDate, comparisonTime)) /
      1e4;

    return {
      currentAmount,
      previousAmount,
      difference: currentAmount - previousAmount,
      comparisonTime,
    };
  });
}

// ========== K 线数据 API ==========

/**
 * 获取历史 K 线
 */
export async function getHistoryKline(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getHistoryKline', symbol, options);
  return withCache(key, DEFAULT_TTL.historyKline, () =>
    sdk.kline.cn(symbol, options)
  );
}

/**
 * 获取带指标的 K 线
 */
export async function getKlineWithIndicators(
  symbol: string,
  options?: {
    market?: 'A' | 'HK' | 'US';
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
    indicators?: {
      ma?: { periods?: number[] } | boolean;
      macd?: { short?: number; long?: number; signal?: number } | boolean;
      boll?: { period?: number; stdDev?: number } | boolean;
      kdj?: { period?: number; kPeriod?: number; dPeriod?: number } | boolean;
      rsi?: { periods?: number[] } | boolean;
      wr?: { periods?: number[] } | boolean;
      bias?: { periods?: number[] } | boolean;
      cci?: { period?: number } | boolean;
      atr?: { period?: number } | boolean;
    };
  }
) {
  const key = getCacheKey('getKlineWithIndicators', symbol, options);
  return withCache(key, DEFAULT_TTL.indicatorKline, () =>
    sdk.kline.withIndicators(symbol, options)
  );
}

/**
 * 获取分钟 K 线
 */
export async function getMinuteKline(
  symbol: string,
  options?: {
    period?: '1' | '5' | '15' | '30' | '60';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  return sdk.kline.cnMinute(symbol, options);
}

/**
 * 获取当日分时
 */
export async function getTodayTimeline(code: string) {
  return sdk.quotes.timeline(code);
}

// ========== 板块 API ==========

/** 获取个股所属行业与精确概念（SDK 暂无该元数据端点） */
export async function getStockBoardMembership(symbol: string) {
  const normalized = normalizeStockCode(symbol);
  const code = normalized.replace(/\D/g, '').slice(-6);
  const market = normalized.startsWith('sh') ? 'SH' : normalized.startsWith('bj') ? 'BJ' : 'SZ';
  const key = getCacheKey('getStockBoardMembership', code, market);
  return withCache(key, DEFAULT_TTL.boardList, async () => {
    const params = new URLSearchParams({
      reportName: 'RPT_F10_CORETHEME_BOARDTYPE',
      columns: 'ALL',
      filter: `(SECUCODE="${code}.${market}")`,
      pageNumber: '1',
      pageSize: '200',
    });
    const response = await fetch(`https://datacenter-web.eastmoney.com/api/data/v1/get?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Board metadata request failed: ${response.status}`);
    const payload = await response.json() as { result?: { data?: Parameters<typeof parseStockBoardMembership>[0] } };
    return parseStockBoardMembership(payload.result?.data ?? []);
  });
}

export async function getBoardOptions(): Promise<StockBoardRef[]> {
  const [industries, concepts] = await Promise.all([getIndustryList(), getConceptList()]);
  return [
    ...industries.map((item) => ({ code: item.code, name: item.name, type: 'industry' as const })),
    ...concepts.map((item) => ({ code: item.code, name: item.name, type: 'concept' as const })),
  ];
}

export async function getBoardMinuteTrend(board: StockBoardRef, period: '1' | '5' | '15' | '30' | '60') {
  return board.type === 'industry'
    ? getIndustryMinuteKline(board.code, { period })
    : getConceptMinuteKline(board.code, { period });
}

// 东财板块口径归一：f20(元)→亿、f6(元)→万，对齐本层单位契约
function normalizeBoardUnits<T extends { totalMarketCap: number | null }>(board: T): T {
  return {
    ...board,
    totalMarketCap:
      board.totalMarketCap === null ? null : board.totalMarketCap / 1e8,
  };
}

function normalizeConstituentUnits<T extends { amount: number | null }>(row: T): T {
  return {
    ...row,
    amount: row.amount === null ? null : row.amount / 1e4,
  };
}

/**
 * 获取行业板块列表
 */
export async function getIndustryList() {
  const key = getCacheKey('getIndustryList');
  return withCache(key, DEFAULT_TTL.boardList, async () =>
    (await sdk.board.industry.list()).map(normalizeBoardUnits)
  );
}

/**
 * 获取概念板块列表
 */
export async function getConceptList() {
  const key = getCacheKey('getConceptList');
  return withCache(key, DEFAULT_TTL.boardList, async () =>
    (await sdk.board.concept.list()).map(normalizeBoardUnits)
  );
}

/**
 * 获取行业成分股
 */
export async function getIndustryConstituents(symbol: string) {
  const key = getCacheKey('getIndustryConstituents', symbol);
  return withCache(key, DEFAULT_TTL.constituents, async () =>
    (await sdk.board.industry.constituents(symbol)).map(normalizeConstituentUnits)
  );
}

/**
 * 获取概念成分股
 */
export async function getConceptConstituents(symbol: string) {
  const key = getCacheKey('getConceptConstituents', symbol);
  return withCache(key, DEFAULT_TTL.constituents, async () =>
    (await sdk.board.concept.constituents(symbol)).map(normalizeConstituentUnits)
  );
}

/**
 * 获取行业 K 线
 */
export async function getIndustryKline(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getIndustryKline', symbol, options);
  return withCache(key, DEFAULT_TTL.historyKline, () =>
    sdk.board.industry.kline(symbol, options)
  );
}

/**
 * 获取概念 K 线
 */
export async function getConceptKline(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
    adjust?: '' | 'qfq' | 'hfq';
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getConceptKline', symbol, options);
  return withCache(key, DEFAULT_TTL.historyKline, () =>
    sdk.board.concept.kline(symbol, options)
  );
}

/**
 * 获取行业分钟 K 线
 */
export async function getIndustryMinuteKline(
  symbol: string,
  options?: { period?: '1' | '5' | '15' | '30' | '60' }
) {
  return sdk.board.industry.minuteKline(symbol, options);
}

/**
 * 获取概念分钟 K 线
 */
export async function getConceptMinuteKline(
  symbol: string,
  options?: { period?: '1' | '5' | '15' | '30' | '60' }
) {
  return sdk.board.concept.minuteKline(symbol, options);
}

/**
 * 获取行业 Spot 指标
 */
export async function getIndustrySpot(symbol: string) {
  return sdk.board.industry.spot(symbol);
}

/**
 * 获取概念 Spot 指标
 */
export async function getConceptSpot(symbol: string) {
  return sdk.board.concept.spot(symbol);
}

// ========== 资金与大单 API ==========

/**
 * 获取资金流向
 */
export async function getFundFlow(codes: string[]) {
  const key = getCacheKey('getFundFlow', codes);
  return withCache(key, DEFAULT_TTL.fundFlow, () => sdk.quotes.fundFlow(codes));
}

/**
 * 获取盘口大单
 */
export async function getPanelLargeOrder(codes: string[]) {
  const key = getCacheKey('getPanelLargeOrder', codes);
  return withCache(key, DEFAULT_TTL.fundFlow, () =>
    sdk.quotes.largeOrder(codes)
  );
}

/**
 * 获取个股历史资金流
 */
export async function getIndividualFundFlow(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
  }
) {
  const key = getCacheKey('getIndividualFundFlow', symbol, options);
  return withCache(key, DEFAULT_TTL.capitalHistory, () =>
    sdk.fundFlow.individual(symbol, options)
  );
}

/**
 * 获取大盘资金流
 */
export async function getMarketFundFlow() {
  const key = getCacheKey('getMarketFundFlow');
  return withCache(key, DEFAULT_TTL.capitalHistory, () => sdk.fundFlow.market());
}

/**
 * 获取个股资金流排行
 */
export async function getFundFlowRank(options?: {
  indicator?: 'today' | '3day' | '5day' | '10day';
}) {
  const key = getCacheKey('getFundFlowRank', options);
  return withCache(key, DEFAULT_TTL.fundFlow, () => sdk.fundFlow.rank(options));
}

/**
 * 获取板块资金流排行
 */
export async function getSectorFundFlowRank(options?: {
  indicator?: 'today' | '3day' | '5day' | '10day';
  sectorType?: 'industry' | 'concept' | 'region';
}) {
  const key = getCacheKey('getSectorFundFlowRank', options);
  return withCache(key, DEFAULT_TTL.fundFlow, () =>
    sdk.fundFlow.sectorRank(options)
  );
}

/**
 * 获取单个板块历史资金流
 */
export async function getSectorFundFlowHistory(
  symbol: string,
  options?: {
    period?: 'daily' | 'weekly' | 'monthly';
  }
) {
  const key = getCacheKey('getSectorFundFlowHistory', symbol, options);
  return withCache(key, DEFAULT_TTL.capitalHistory, () =>
    sdk.fundFlow.sectorHistory(symbol, options)
  );
}

/**
 * 获取北向/南向资金汇总
 */
export async function getNorthboundFlowSummary() {
  const key = getCacheKey('getNorthboundFlowSummary');
  return withCache(key, DEFAULT_TTL.northbound, () => sdk.northbound.summary());
}

/**
 * 获取北向/南向资金历史
 */
export async function getNorthboundHistory(
  direction: 'north' | 'south' = 'north',
  options?: {
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getNorthboundHistory', direction, options);
  return withCache(key, DEFAULT_TTL.northbound, () =>
    sdk.northbound.history(direction, options)
  );
}

/**
 * 获取个股北向持仓历史
 */
export async function getNorthboundIndividual(
  symbol: string,
  options?: {
    startDate?: string;
    endDate?: string;
  }
) {
  const key = getCacheKey('getNorthboundIndividual', symbol, options);
  return withCache(key, DEFAULT_TTL.northbound, () =>
    sdk.northbound.individual(symbol, options)
  );
}

/**
 * 获取涨停股池
 */
export async function getZTPool(
  type: 'zt' | 'yesterday' | 'strong' | 'sub_new' | 'broken' | 'dt' = 'zt',
  date?: string
) {
  const key = getCacheKey('getZTPool', type, date);
  return withCache(key, DEFAULT_TTL.stockChanges, () => sdk.marketEvent.ztPool(type, date));
}

/**
 * 获取盘口异动
 */
export async function getStockChanges(
  type:
    | 'rocket_launch'
    | 'quick_rebound'
    | 'large_buy'
    | 'limit_up_seal'
    | 'limit_down_open'
    | 'big_buy_order'
    | 'auction_up'
    | 'high_open_5d'
    | 'gap_up'
    | 'high_60d'
    | 'surge_60d'
    | 'accelerate_down'
    | 'high_dive'
    | 'large_sell'
    | 'limit_down_seal'
    | 'limit_up_open'
    | 'big_sell_order'
    | 'auction_down'
    | 'low_open_5d'
    | 'gap_down'
    | 'low_60d'
    | 'drop_60d' = 'large_buy'
) {
  const key = getCacheKey('getStockChanges', type);
  return withCache(key, DEFAULT_TTL.stockChanges, () => sdk.marketEvent.stockChanges(type));
}

/**
 * 获取板块异动
 */
export async function getBoardChanges() {
  const key = getCacheKey('getBoardChanges');
  return withCache(key, DEFAULT_TTL.boardChanges, () => sdk.marketEvent.boardChanges());
}

/**
 * 获取龙虎榜详情
 */
export async function getDragonTigerDetail(options: {
  startDate: string;
  endDate: string;
}) {
  const key = getCacheKey('getDragonTigerDetail', options);
  return withCache(key, DEFAULT_TTL.dragonTiger, () => sdk.dragonTiger.detail(options));
}

/** 获取最近交易日筹码分布，最后一日附带筹码峰直方图 */
export async function getChipDistribution(symbol: string) {
  const key = getCacheKey('getChipDistribution', symbol);
  return withCache(key, DEFAULT_TTL.historyKline, async () =>
    calcChipDistribution(
      await sdk.kline.cn(symbol, { period: 'daily', adjust: 'qfq' }),
      { range: 120, tail: 7, includeHistogram: 'last' }
    )
  );
}

/** 获取单只股票指定日期的龙虎榜席位明细 */
export async function getDragonTigerSeatDetail(symbol: string, date: string) {
  const key = getCacheKey('getDragonTigerSeatDetail', { symbol, date });
  return withCache(key, DEFAULT_TTL.dragonTiger, () =>
    sdk.dragonTiger.seatDetail(symbol, date)
  );
}

/** 获取龙虎榜个股统计 */
export async function getDragonTigerStockStats(
  period: '1month' | '3month' | '6month' | '1year' = '1month'
) {
  const key = getCacheKey('getDragonTigerStockStats', period);
  return withCache(key, DEFAULT_TTL.dragonTiger, () => sdk.dragonTiger.stockStats(period));
}

/** 获取龙虎榜机构买卖明细 */
export async function getDragonTigerInstitution(options: {
  startDate: string;
  endDate: string;
}) {
  const key = getCacheKey('getDragonTigerInstitution', options);
  return withCache(key, DEFAULT_TTL.dragonTiger, () =>
    sdk.dragonTiger.institution(options)
  );
}

/**
 * 获取大宗交易明细
 */
export async function getBlockTradeDetail(options?: {
  startDate?: string;
  endDate?: string;
}) {
  const key = getCacheKey('getBlockTradeDetail', options);
  return withCache(key, DEFAULT_TTL.blockTrade, () => sdk.blockTrade.detail(options));
}

/**
 * 获取融资融券账户统计
 */
export async function getMarginAccountInfo() {
  const key = getCacheKey('getMarginAccountInfo');
  return withCache(key, DEFAULT_TTL.margin, () => sdk.margin.accountInfo());
}

/** 获取个股最近 N 个交易日的融资融券数据 */
export async function getMarginTargetHistory(symbol: string, days = 7) {
  const code = normalizeStockCode(symbol).replace(/\D/g, '').slice(-6);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const calendar = await getTradingCalendar();
  const dates = calendar.filter((date) => date <= today).slice(-days);
  const lists = await Promise.all(
    dates.map((date) => {
      const compactDate = date.replaceAll('-', '');
      const key = getCacheKey('getMarginTargetList', compactDate);
      return withCache(key, DEFAULT_TTL.margin, () => sdk.margin.targetList(compactDate));
    })
  );

  return lists
    .flatMap((items) => items.filter((item) => item.code.replace(/\D/g, '').slice(-6) === code))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ========== 搜索 API ==========

/**
 * 搜索股票/板块
 * @param keyword - 搜索关键词
 * @returns 搜索结果列表
 */
export async function search(keyword: string) {
  const results = await sdk.search(keyword);
  return results.map(normalizeSearchResult);
}

// ========== 其他 API ==========

/**
 * 获取分红派息详情
 */
export async function getDividendDetail(symbol: string): Promise<DividendDetail[]> {
  const key = getCacheKey('getDividendDetail', symbol);
  return withCache(key, DEFAULT_TTL.dividends, () => sdk.reference.dividendDetail(symbol));
}

/**
 * 获取交易日历
 */
export async function getTradingCalendar() {
  const key = getCacheKey('getTradingCalendar');
  return withCache(key, 3600000, () => sdk.reference.tradingCalendar()); // 1 小时缓存
}
