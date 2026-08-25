/**
 * 总览页面
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Card, Tabs, Loading, Empty, Button } from '@/components/common';
import { LazyEChart } from '@/components/charts/LazyEChart';
import { getChartColors } from '@/components/charts/chartTheme';
import { usePolling, useTheme } from '@/hooks';
import { useBoardData, useAppSettings } from '@/contexts';
import {
  getAllAShareQuotes,
  getFullQuotes,
  getFundFlowRank,
  getIndustryMinuteKline,
  getMarketAmountComparison,
  getMarketFundFlow,
  getNorthboundFlowSummary,
  getTodayTimeline,
  getUSQuotes,
} from '@/services/sdk';
import { getAllWatchlistCodes } from '@/services/storage';
import { isLimitDown, isLimitUp } from '@/services/analysis';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  formatYuanAmount,
  getChangeColorClass,
} from '@/utils/format';
import type { FullQuote } from 'stock-sdk';
import {
  rankMarketFundFlows,
  type FundFlowRankingKey,
} from './marketFundFlowRanking';
import {
  buildMarketIntradayAnnotations,
  type MarketIntradayAnnotation,
} from './marketIntradayAnnotations';
import styles from './Dashboard.module.css';

// 主要指数
const MAIN_INDICES = [
  'sh000001', // 上证指数
  'sz399001', // 深证成指
  'sz399006', // 创业板指
  'sh000688', // 科创50
  'sz399300', // 沪深300
  'sh000016', // 上证50
];

const US_INDICES = ['DJI', 'INX', 'IXIC'];

// 榜单类型
const RANKING_TABS = [
  { key: 'rise', label: '涨幅榜' },
  { key: 'fall', label: '跌幅榜' },
  { key: 'amount', label: '成交额' },
  { key: 'netInflow', label: '净流入' },
  { key: 'netOutflow', label: '净流出' },
  { key: 'largeNetInflow', label: '大单净流入' },
  { key: 'turnover', label: '换手率' },
];

const FUND_FLOW_RANKING_KEYS: FundFlowRankingKey[] = [
  'netInflow',
  'netOutflow',
  'largeNetInflow',
];

interface MarketSummary {
  riseCount: number;
  fallCount: number;
  flatCount: number;
  limitUpCount: number;
  limitDownCount: number;
  totalAmount: number;
}

type MarketFundFlowRows = Awaited<ReturnType<typeof getMarketFundFlow>>;
type NorthboundSummaryRows = Awaited<ReturnType<typeof getNorthboundFlowSummary>>;
type MarketAmountComparison = Awaited<ReturnType<typeof getMarketAmountComparison>>;
type USQuotes = Awaited<ReturnType<typeof getUSQuotes>>;
type FundFlowRankRows = Awaited<ReturnType<typeof getFundFlowRank>>;
type MarketTimeline = Awaited<ReturnType<typeof getTodayTimeline>>;

export function Dashboard() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { settings, getRefreshInterval } = useAppSettings();
  const chartColors = useMemo(
    () => getChartColors(theme, settings.colorMode),
    [settings.colorMode, theme]
  );

  // 使用共享的板块数据（优化：避免重复请求）
  const { industryList, conceptList, loading: boardLoading } = useBoardData();

  // 本地数据状态
  const [indices, setIndices] = useState<FullQuote[]>([]);
  const [usIndices, setUSIndices] = useState<USQuotes>([]);
  const [usIndicesError, setUSIndicesError] = useState(false);
  const [watchlistQuotes, setWatchlistQuotes] = useState<FullQuote[]>([]);
  const [marketQuotes, setMarketQuotes] = useState<FullQuote[]>([]);
  const [amountComparison, setAmountComparison] = useState<MarketAmountComparison | null>(null);
  const [marketFundFlowHistory, setMarketFundFlowHistory] =
    useState<MarketFundFlowRows>([]);
  const [fundFlowRanks, setFundFlowRanks] = useState<FundFlowRankRows>([]);
  const [fundFlowRanksLoading, setFundFlowRanksLoading] = useState(true);
  const [northboundSummary, setNorthboundSummary] =
    useState<NorthboundSummaryRows>([]);
  const [rankingTab, setRankingTab] = useState('rise');
  const [boardTab, setBoardTab] = useState<'industry' | 'concept'>('industry');
  const [initialLoading, setInitialLoading] = useState(true);
  const [marketTimeline, setMarketTimeline] = useState<MarketTimeline | null>(null);
  const [marketAnnotations, setMarketAnnotations] = useState<MarketIntradayAnnotation[]>([]);
  const [marketIntradayLoading, setMarketIntradayLoading] = useState(true);
  const [marketIntradayError, setMarketIntradayError] = useState(false);

  // 获取自选代码
  const watchlistCodes = getAllWatchlistCodes();
  const listRefreshInterval = getRefreshInterval('list');
  const breadthRefreshInterval = Math.max(listRefreshInterval * 4, 60000);

  // 只加载指数和自选数据（板块数据由全局 Context 提供）
  // 自选代码在闭包内即时读取：依赖 length 的 memo 化会让轮询一直拉旧代码列表
  const fetchQuoteData = useCallback(async () => {
    try {
      const codes = getAllWatchlistCodes();
      const [indicesData, watchlistData] = await Promise.all([
        getFullQuotes(MAIN_INDICES),
        codes.length > 0
          ? getFullQuotes(codes.slice(0, 50))
          : Promise.resolve<FullQuote[]>([]),
      ]);
      setIndices(indicesData);
      setWatchlistQuotes(watchlistData);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const fetchMarketOverview = useCallback(async () => {
    const [quotesResult, comparisonResult] = await Promise.allSettled([
      getAllAShareQuotes({ batchSize: 500, concurrency: 4 }),
      getMarketAmountComparison(),
    ]);
    if (quotesResult.status === 'fulfilled') setMarketQuotes(quotesResult.value);
    else console.error('Dashboard market overview error:', quotesResult.reason);
    if (comparisonResult.status === 'fulfilled') setAmountComparison(comparisonResult.value);
    else console.error('Dashboard amount comparison error:', comparisonResult.reason);
  }, []);

  const fetchUSIndices = useCallback(async () => {
    try {
      setUSIndices(await getUSQuotes(US_INDICES));
      setUSIndicesError(false);
    } catch (error) {
      console.error('Dashboard US indices error:', error);
      setUSIndicesError(true);
    }
  }, []);

  const fetchMarketInsights = useCallback(async () => {
    const [marketResult, northboundResult, rankResult] = await Promise.allSettled([
      getMarketFundFlow(),
      getNorthboundFlowSummary(),
      getFundFlowRank({ indicator: 'today' }),
    ]);

    if (marketResult.status === 'fulfilled') setMarketFundFlowHistory(marketResult.value);
    else console.error('Dashboard market fund flow error:', marketResult.reason);
    if (northboundResult.status === 'fulfilled') setNorthboundSummary(northboundResult.value);
    else console.error('Dashboard northbound error:', northboundResult.reason);
    if (rankResult.status === 'fulfilled') setFundFlowRanks(rankResult.value);
    else console.error('Dashboard fund flow rank error:', rankResult.reason);
    setFundFlowRanksLoading(false);
  }, []);

  const fetchMarketIntraday = useCallback(async () => {
    if (industryList.length === 0) return;

    try {
      const timeline = await getTodayTimeline('sh000001');
      const sortedBoards = [...industryList]
        .filter((board) => board.changePercent !== null)
        .sort((left, right) => (right.changePercent ?? 0) - (left.changePercent ?? 0));
      const candidateBoards = [...sortedBoards.slice(0, 8), ...sortedBoards.slice(-8)]
        .filter(
          (board, index, boards) => boards.findIndex((item) => item.code === board.code) === index
        );
      const results = await Promise.allSettled(
        candidateBoards.map(async (board) => ({
          code: board.code,
          name: board.name,
          points: (await getIndustryMinuteKline(board.code, { period: '1' })).map((point) => ({
            time: point.time.slice(-5),
            price: point.close ?? ('price' in point ? point.price : null),
          })),
        }))
      );
      const candidates = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );

      setMarketTimeline(timeline);
      setMarketAnnotations(
        buildMarketIntradayAnnotations(
          timeline.data.map((point) => ({ time: point.time, price: point.price })),
          candidates
        )
      );
      setMarketIntradayError(false);
    } catch (error) {
      console.error('Dashboard market intraday error:', error);
      setMarketIntradayError(true);
    } finally {
      setMarketIntradayLoading(false);
    }
  }, [industryList]);

  // 初始加载
  useEffect(() => {
    fetchQuoteData();
    fetchUSIndices();
    fetchMarketOverview();
    fetchMarketInsights();
  }, [fetchMarketInsights, fetchMarketOverview, fetchQuoteData, fetchUSIndices]);

  useEffect(() => {
    fetchMarketIntraday();
  }, [fetchMarketIntraday]);

  // 轮询指数和自选数据（优化：只轮询需要实时更新的数据）
  usePolling(fetchQuoteData, {
    interval: listRefreshInterval,
    enabled: !initialLoading,
    immediate: false,
  });

  usePolling(fetchMarketOverview, {
    interval: breadthRefreshInterval,
    enabled: !initialLoading,
    immediate: false,
  });

  usePolling(fetchUSIndices, {
    interval: Math.max(listRefreshInterval, 30000),
    enabled: !initialLoading,
    immediate: false,
  });

  usePolling(fetchMarketInsights, {
    interval: breadthRefreshInterval,
    enabled: !initialLoading,
    immediate: false,
  });

  usePolling(fetchMarketIntraday, {
    interval: breadthRefreshInterval,
    enabled: industryList.length > 0,
    immediate: false,
  });

  // 跳转详情
  const handleStockClick = (code: string) => {
    navigate(`/s/${code}`);
  };

  // 跳转板块
  const handleBoardClick = (code: string, type: 'industry' | 'concept') => {
    navigate(`/boards/${type}/${code}`);
  };

  const currentBoards = boardTab === 'industry' ? industryList : conceptList;
  const strongestBoard = currentBoards[0];
  const latestMarketFundFlow = marketFundFlowHistory.at(-1) ?? null;
  const northboundSnapshot =
    northboundSummary.find(
      (item) => item.direction.includes('北向') || item.boardName.includes('北向')
    ) ??
    northboundSummary.find((item) => item.direction.includes('沪深港通')) ??
    northboundSummary[0] ??
    null;

  const marketSummary = useMemo<MarketSummary>(() => {
    return marketQuotes.reduce(
      (summary, quote) => {
        if (quote.changePercent > 0) summary.riseCount += 1;
        else if (quote.changePercent < 0) summary.fallCount += 1;
        else summary.flatCount += 1;

        if (isLimitUp(quote)) summary.limitUpCount += 1;
        if (isLimitDown(quote)) summary.limitDownCount += 1;
        summary.totalAmount += quote.amount ?? 0;
        return summary;
      },
      {
        riseCount: 0,
        fallCount: 0,
        flatCount: 0,
        limitUpCount: 0,
        limitDownCount: 0,
        totalAmount: 0,
      }
    );
  }, [marketQuotes]);

  const rankingItems = useMemo(() => {
    const sorted = [...marketQuotes];
    switch (rankingTab) {
      case 'fall':
        sorted.sort((a, b) => a.changePercent - b.changePercent);
        break;
      case 'amount':
        sorted.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
        break;
      case 'turnover':
        sorted.sort((a, b) => (b.turnoverRate ?? 0) - (a.turnoverRate ?? 0));
        break;
      case 'rise':
      default:
        sorted.sort((a, b) => b.changePercent - a.changePercent);
        break;
    }

    return sorted.slice(0, 10);
  }, [marketQuotes, rankingTab]);

  const fundFlowRankingKey = FUND_FLOW_RANKING_KEYS.find((key) => key === rankingTab);
  const fundFlowRankingItems = useMemo(
    () => fundFlowRankingKey ? rankMarketFundFlows(fundFlowRanks, fundFlowRankingKey) : [],
    [fundFlowRankingKey, fundFlowRanks]
  );
  const displayedRankingItems = useMemo(() => {
    if (fundFlowRankingKey) {
      const field = fundFlowRankingKey === 'largeNetInflow' ? 'largeNetInflow' : 'mainNetInflow';
      return fundFlowRankingItems.map((item) => ({
        ...item,
        metricValue: item[field],
        metricLabel: formatYuanAmount(item[field]),
      }));
    }

    return rankingItems.map((item) => ({
      ...item,
      metricValue: item.changePercent,
      metricLabel: rankingTab === 'amount'
        ? formatAmount(item.amount)
        : rankingTab === 'turnover'
          ? `${item.turnoverRate?.toFixed(2) ?? '--'}%`
          : formatPercent(item.changePercent),
    }));
  }, [fundFlowRankingItems, fundFlowRankingKey, rankingItems, rankingTab]);

  const marketIntradayOption = useMemo(() => {
    if (!marketTimeline) return {};

    const annotationsByTime = new Map(marketAnnotations.map((item) => [item.time, item]));
    const annotationSeries = (type: MarketIntradayAnnotation['type']) => ({
      name: type === 'rise' ? '上涨异动' : '下跌异动',
      type: 'scatter',
      symbolSize: 14,
      data: marketAnnotations
        .filter((item) => item.type === type)
        .map((item) => ({ value: [item.time, item.price], ...item })),
      itemStyle: {
        color: type === 'rise' ? chartColors.rise : chartColors.fall,
        borderColor: chartColors.bgElevated,
        borderWidth: 2,
      },
      label: {
        show: true,
        position: type === 'rise' ? 'top' : 'bottom',
        color: chartColors.textPrimary,
        backgroundColor: chartColors.bgElevated,
        borderRadius: 3,
        padding: [3, 5],
        formatter: (params: { data: MarketIntradayAnnotation }) => params.data.name,
      },
      z: 5,
    });

    return {
      animation: false,
      grid: { left: 62, right: 28, top: 38, bottom: 38 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: Array<{ axisValue?: string }>) => {
          const time = String(params[0]?.axisValue ?? '');
          const point = marketTimeline.data.find((item) => item.time === time);
          const annotation = annotationsByTime.get(time);
          const detail = annotation
            ? `<br/><span style="color:${annotation.type === 'rise' ? chartColors.rise : chartColors.fall}">行业异动：${annotation.name} ${formatPercent(annotation.industryChangePercent)}</span>`
            : '';
          return `<strong>${time}</strong><br/>上证指数：${formatPrice(point?.price)}<br/>成交额：${formatYuanAmount(point?.amount)}${detail}`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: marketTimeline.data.map((point) => point.time),
        axisLine: { lineStyle: { color: chartColors.borderPrimary } },
        axisLabel: { color: chartColors.textTertiary },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: chartColors.textTertiary },
        splitLine: { lineStyle: { color: chartColors.borderSecondary } },
      },
      series: [
        {
          name: '上证指数',
          type: 'line',
          data: marketTimeline.data.map((point) => point.price),
          showSymbol: false,
          smooth: 0.15,
          lineStyle: { color: chartColors.accent, width: 1.5 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${chartColors.accent}40` },
                { offset: 1, color: `${chartColors.accent}05` },
              ],
            },
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: chartColors.textTertiary, type: 'dashed' },
            label: { formatter: '昨收 {c}', color: chartColors.textTertiary },
            data: [{ yAxis: marketTimeline.preClose }],
          },
        },
        annotationSeries('rise'),
        annotationSeries('fall'),
      ],
    };
  }, [chartColors, marketAnnotations, marketTimeline]);

  // 只在初始加载时显示 loading，之后即使数据获取失败也显示页面
  if (initialLoading && boardLoading) {
    return <Loading fullScreen text="加载中..." />;
  }

  return (
    <div className={styles.dashboard}>
      <section className={styles.marketSection}>
        <h2 className={styles.sectionTitle}>美股指数</h2>
        {usIndices.length > 0 ? (
          <div className={styles.indices}>
            {usIndices.map((item, index) => (
              <motion.div
                key={item.code}
                className={`${styles.indexCard} ${styles.usIndexCard}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className={styles.indexName}>{item.name}</div>
                <div className={`${styles.indexPrice} ${getChangeColorClass(item.changePercent)}`}>
                  {formatPrice(item.price)}
                </div>
                <div className={styles.indexChange}>
                  <span className={getChangeColorClass(item.changePercent)}>{formatPercent(item.changePercent)}</span>
                  <span className={`${styles.indexChangeVal} ${getChangeColorClass(item.change)}`}>
                    {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}
                  </span>
                </div>
                <div className={styles.indexAmount}>美股实时指数</div>
              </motion.div>
            ))}
          </div>
        ) : usIndicesError ? (
          <Card><Empty title="美股指数暂不可用" description="不影响 A 股数据，系统会自动重试" /></Card>
        ) : (
          <Loading size="sm" text="加载美股指数..." />
        )}
      </section>

      {/* 指数卡片 */}
      <section className={styles.marketSection}>
        <h2 className={styles.sectionTitle}>A 股指数</h2>
        <div className={styles.indices}>{indices.map((item, index) => (
          <motion.div
            key={item.code}
            className={styles.indexCard}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => handleStockClick(item.code)}
          >
            <div className={styles.indexName}>{item.name}</div>
            <div className={`${styles.indexPrice} ${getChangeColorClass(item.changePercent)}`}>
              {formatPrice(item.price)}
            </div>
            <div className={styles.indexChange}>
              <span className={getChangeColorClass(item.changePercent)}>
                {formatPercent(item.changePercent)}
              </span>
              <span className={`${styles.indexChangeVal} ${getChangeColorClass(item.change)}`}>
                {item.change !== null && item.change > 0 ? '+' : ''}
                {item.change?.toFixed(2) ?? '--'}
              </span>
            </div>
            <div className={styles.indexAmount}>
              成交 {formatAmount(item.amount)}
            </div>
          </motion.div>
        ))}</div>
      </section>

      <Card
        title="大盘分时 · 行业异动"
        extra={
          <div className={styles.intradayLegend}>
            <span className="text-rise">● 上涨区间强势行业</span>
            <span className="text-fall">● 下跌区间弱势行业</span>
          </div>
        }
      >
        {marketIntradayLoading && !marketTimeline ? (
          <Loading size="md" text="加载大盘分时..." />
        ) : marketIntradayError && !marketTimeline ? (
          <Empty title="大盘分时暂不可用" description="系统会自动重试" />
        ) : marketTimeline?.data.length ? (
          <>
            <div className={styles.marketIntradayChart}>
              <LazyEChart option={marketIntradayOption} notMerge />
            </div>
            <p className={styles.intradayNote}>
              按 15 分钟识别显著涨跌区间，并标注同期涨幅最强或跌幅最深的行业；该标记反映行业强弱，不代表分钟主力资金流。
            </p>
          </>
        ) : (
          <Empty title="暂无当日分时数据" description="交易时段内将自动更新" />
        )}
      </Card>

      <section className={styles.statsGrid}>
        <Card title="市场涨跌">
          <div className={styles.statCard}>
            <div className={styles.statValueRow}>
              <span className="text-rise">{marketSummary.riseCount}</span>
              <span className={styles.statDivider}>/</span>
              <span className="text-fall">{marketSummary.fallCount}</span>
            </div>
            <div className={styles.statMeta}>
              <span>上涨 / 下跌</span>
              <span>{marketSummary.flatCount} 平</span>
            </div>
          </div>
        </Card>

        <Card title="涨跌停">
          <div className={styles.statCard}>
            <div className={styles.statValueRow}>
              <span className="text-rise">{marketSummary.limitUpCount}</span>
              <span className={styles.statDivider}>/</span>
              <span className="text-fall">{marketSummary.limitDownCount}</span>
            </div>
            <div className={styles.statMeta}>
              <span>涨停 / 跌停</span>
            </div>
          </div>
        </Card>

        <Card title="全市场成交额">
          <div className={styles.statCard}>
            <div className={styles.statValueLarge}>
              {formatAmount(marketSummary.totalAmount)}
            </div>
            <div className={styles.statMeta}>
              <span>较昨日 {amountComparison?.comparisonTime ?? '同刻'}（沪深）</span>
              <span className={getChangeColorClass(amountComparison?.difference)}>
                {amountComparison?.difference == null
                  ? '--'
                  : `${amountComparison.difference > 0 ? '+' : ''}${formatAmount(amountComparison.difference)}`}
              </span>
            </div>
          </div>
        </Card>

        <Card title="北向资金">
          <div className={styles.statCard}>
            <div
              className={`${styles.statValueLarge} ${getChangeColorClass(
                northboundSnapshot?.netInflow ?? northboundSnapshot?.netBuyAmount
              )}`}
            >
              {formatYuanAmount(
                northboundSnapshot?.netInflow ?? northboundSnapshot?.netBuyAmount
              )}
            </div>
            <div className={styles.statMeta}>
              <span>
                上涨 {northboundSnapshot?.upCount ?? '--'} / 下跌{' '}
                {northboundSnapshot?.downCount ?? '--'}
              </span>
              <span>{northboundSnapshot?.boardName ?? '北向汇总'}</span>
            </div>
          </div>
        </Card>

        <Card title="大盘主力">
          <div className={styles.statCard}>
            <div
              className={`${styles.statValueLarge} ${getChangeColorClass(
                latestMarketFundFlow?.mainNetInflow
              )}`}
            >
              {formatYuanAmount(latestMarketFundFlow?.mainNetInflow)}
            </div>
            <div className={styles.statMeta}>
              <span>
                占比 {formatPercent(latestMarketFundFlow?.mainNetInflowPercent)}
              </span>
              <span>{latestMarketFundFlow?.date ?? '当日快照'}</span>
            </div>
          </div>
        </Card>

        <Card title="最强板块">
          <div className={styles.statCard}>
            <div className={styles.statValueLarge}>{strongestBoard?.name ?? '--'}</div>
            <div className={styles.statMeta}>
              <span className={getChangeColorClass(strongestBoard?.changePercent)}>
                {formatPercent(strongestBoard?.changePercent)}
              </span>
              <span>{boardTab === 'industry' ? '行业强度' : '概念强度'}</span>
            </div>
          </div>
        </Card>
      </section>

      <div className={styles.mainGrid}>
        {/* 左侧：自选 + 榜单 */}
        <div className={styles.leftCol}>
          {/* 自选快照 */}
          <Card
            title="自选股"
            extra={
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={14} />}
                onClick={() => navigate('/watchlist')}
              >
                管理
              </Button>
            }
          >
            {watchlistCodes.length === 0 ? (
              <Empty
                title="暂无自选股"
                description="搜索添加股票到自选"
                action={
                  <Button size="sm" onClick={() => navigate('/watchlist')}>
                    添加自选
                  </Button>
                }
              />
            ) : (
              <div className={styles.watchlist}>
                {watchlistQuotes.slice(0, 10).map((item) => (
                  <div
                    key={item.code}
                    className={styles.watchlistItem}
                    onClick={() => handleStockClick(item.code)}
                  >
                    <div className={styles.stockInfo}>
                      <span className={styles.stockName}>{item.name}</span>
                      <span className={styles.stockCode}>{item.code}</span>
                    </div>
                    <div className={styles.stockPrice}>
                      <span className={getChangeColorClass(item.changePercent)}>
                        {formatPrice(item.price)}
                      </span>
                    </div>
                    <div className={`${styles.stockChange} ${getChangeColorClass(item.changePercent)}`}>
                      {formatPercent(item.changePercent)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 榜单 */}
          <Card
            title="市场榜单"
            extra={
              <Tabs
                items={RANKING_TABS}
                activeKey={rankingTab}
                onChange={setRankingTab}
                size="sm"
              />
            }
          >
            {displayedRankingItems.length === 0 ? (
              fundFlowRankingKey && !fundFlowRanksLoading
                ? <Empty title="暂无资金流数据" description="系统会自动重试" />
                : <Loading size="md" />
            ) : (
              <div className={styles.rankingList}>
                {displayedRankingItems.map((item, index) => (
                  <div
                    key={item.code}
                    className={styles.rankingItem}
                    onClick={() => handleStockClick(item.code)}
                  >
                    <span className={styles.rankNum}>{index + 1}</span>
                    <div className={styles.stockInfo}>
                      <span className={styles.stockName}>{item.name}</span>
                      <span className={styles.stockCode}>{item.code}</span>
                    </div>
                    <div className={styles.stockPrice}>
                      <span>{formatPrice(item.price)}</span>
                    </div>
                    <div className={`${styles.stockChange} ${getChangeColorClass(item.metricValue)}`}>
                      {item.metricLabel}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* 右侧：热点板块 */}
        <div className={styles.rightCol}>
          <Card
            title="热点板块"
            extra={
              <Tabs
                items={[
                  { key: 'industry', label: '行业' },
                  { key: 'concept', label: '概念' },
                ]}
                activeKey={boardTab}
                onChange={(key) => setBoardTab(key as 'industry' | 'concept')}
                size="sm"
              />
            }
          >
            <div className={styles.boardList}>
              {currentBoards.slice(0, 15).map((item, index) => (
                <motion.div
                  key={item.code}
                  className={styles.boardItem}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => handleBoardClick(item.code, boardTab)}
                >
                  <div className={styles.boardLeft}>
                    <span className={styles.boardRank}>{item.rank}</span>
                    <div className={styles.boardInfo}>
                      <span className={styles.boardName}>{item.name}</span>
                      <span className={styles.boardLeader}>
                        领涨：{item.leadingStock}
                        <span className={getChangeColorClass(item.leadingStockChangePercent)}>
                          {' '}{formatPercent(item.leadingStockChangePercent)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className={styles.boardRight}>
                    <div className={`${styles.boardChange} ${getChangeColorClass(item.changePercent)}`}>
                      {formatPercent(item.changePercent)}
                    </div>
                    <div className={styles.boardStats}>
                      <span className="text-rise">{item.riseCount}↑</span>
                      <span className="text-fall">{item.fallCount}↓</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
