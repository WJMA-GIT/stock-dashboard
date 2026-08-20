/**
 * 个股详情页
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, StarOff, Bell, Trash2, Search } from 'lucide-react';
import {
  addIndicators,
  calcDMI,
  calcKC,
  calcOBV,
  calcROC,
  calcSAR,
} from 'stock-sdk/indicators';
import type {
  FundFlow,
  FullQuote,
  HistoryKline,
  PanelLargeOrder,
  TodayTimelineResponse,
} from 'stock-sdk';
import { LazyEChart } from '@/components/charts/LazyEChart';
import { getChartColors, type ChartColors } from '@/components/charts/chartTheme';
import { Button, Card, Empty, Loading, Tabs, useToast } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling, useTheme } from '@/hooks';
import {
  getBoardMinuteTrend,
  getBoardOptions,
  getChipDistribution,
  getFullQuotes,
  getFundFlow,
  getHistoryKline,
  getIndividualFundFlow,
  getMinuteKline,
  getMarginTargetHistory,
  getNorthboundIndividual,
  getPanelLargeOrder,
  getStockBoardMembership,
  getTodayTimeline,
} from '@/services/sdk';
import { summarizeMarginTrend } from './marginTrend';
import {
  addAlertRule,
  addToWatchlist,
  deleteAlertRule,
  getAlertsByCode,
  isInWatchlist,
  removeFromWatchlist,
} from '@/services/storage';
import type { AlertType } from '@/types';
import type { IndicatorConfig } from '@/types';
import { getSyncedPriceAxis } from './stockChartScale';
import {
  formatAmount,
  formatChange,
  formatCompactNumber,
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatRatio,
  formatTurnover,
  formatVolume,
  formatVolumeRatio,
  formatYuanAmount,
  getChangeColorClass,
  normalizeStockCode,
} from '@/utils/format';
import styles from './StockDetail.module.css';

type IndividualFundFlowRows = Awaited<ReturnType<typeof getIndividualFundFlow>>;
type NorthboundIndividualRows = Awaited<ReturnType<typeof getNorthboundIndividual>>;
type ChipRows = Awaited<ReturnType<typeof getChipDistribution>>;
type MarginRows = Awaited<ReturnType<typeof getMarginTargetHistory>>;
type BoardMembership = Awaited<ReturnType<typeof getStockBoardMembership>>;
type BoardRef = NonNullable<BoardMembership['industry']>;
type BoardTrend = Awaited<ReturnType<typeof getBoardMinuteTrend>>;

const KLINE_PERIODS = [
  { key: 'daily', label: '日K' },
  { key: 'weekly', label: '周K' },
  { key: 'monthly', label: '月K' },
];

const MINUTE_PERIODS = [
  { key: '1', label: '分时' },
  { key: '5', label: '5分' },
  { key: '15', label: '15分' },
  { key: '30', label: '30分' },
  { key: '60', label: '60分' },
];

const OVERLAY_OPTIONS = [
  { key: 'ma', label: 'MA' },
  { key: 'boll', label: 'BOLL' },
  { key: 'sar', label: 'SAR' },
  { key: 'kc', label: 'KC' },
] as const;

const OSCILLATOR_OPTIONS = [
  { key: 'macd', label: 'MACD' },
  { key: 'kdj', label: 'KDJ' },
  { key: 'rsi', label: 'RSI' },
  { key: 'obv', label: 'OBV' },
  { key: 'roc', label: 'ROC' },
  { key: 'dmi', label: 'DMI-ADX' },
] as const;

const ALERT_TYPE_OPTIONS: Array<{ key: AlertType; label: string }> = [
  { key: 'price_gte', label: '价格 >= ' },
  { key: 'price_lte', label: '价格 <= ' },
  { key: 'change_percent_gte', label: '涨幅 >= ' },
  { key: 'change_percent_lte', label: '涨幅 <= ' },
  { key: 'amount_gte', label: '成交额 >= ' },
];

type OverlayIndicatorKey = (typeof OVERLAY_OPTIONS)[number]['key'];
type OscillatorIndicatorKey = (typeof OSCILLATOR_OPTIONS)[number]['key'];

interface MinuteKlineItem {
  time: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  changePercent?: number | null;
}

interface KlineDataItem extends HistoryKline {
  ma?: Record<string, number>;
  macd?: { dif?: number; dea?: number; macd?: number };
  boll?: { upper?: number; mid?: number; lower?: number };
  kdj?: { k?: number; d?: number; j?: number };
  rsi?: Record<string, number>;
  obv?: { obv: number | null; obvMa: number | null };
  roc?: { roc: number | null; signal: number | null };
  dmi?: { pdi: number | null; mdi: number | null; adx: number | null };
  sar?: { sar: number | null; trend: 1 | -1 | null };
  kc?: { upper: number | null; mid: number | null; lower: number | null };
}

function formatMaybeDate(value: string | null | undefined) {
  return value || '--';
}

function buildTimelineOption(args: {
  minutePeriod: string;
  timeline: TodayTimelineResponse | null;
  minuteKline: MinuteKlineItem[];
  prevClose: number | undefined;
  colors: ChartColors;
  boardTrend: BoardTrend;
  boardName: string;
}) {
  const { minutePeriod, timeline, minuteKline, prevClose, colors, boardTrend, boardName } = args;

  if (minutePeriod === '1') {
    if (!timeline?.data?.length) {
      return {};
    }

    const times = timeline.data.map((item) => item.time);
    const prices = timeline.data.map((item) => item.price);
    const avgPrices = timeline.data.map((item) => item.avgPrice);
    const basePrice = timeline.preClose || prevClose || prices[0];
    const axis = getSyncedPriceAxis([...prices, ...avgPrices], basePrice);
    const changePercents = prices.map((price) => basePrice ? (price - basePrice) / basePrice * 100 : 0);
    const boardChanges = boardChangeSeries(boardTrend, times);

    return {
      animation: false,
      grid: { left: 60, right: 58, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: colors.borderPrimary } },
        axisLabel: { color: colors.textTertiary, fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          min: axis.priceMin,
          max: axis.priceMax,
          splitNumber: 4,
          axisLine: { show: false },
          axisLabel: {
            color: colors.textTertiary,
            fontSize: 10,
            formatter: (value: number) => value.toFixed(2),
          },
          splitLine: { lineStyle: { color: colors.borderSecondary, type: 'dashed' } },
        },
        {
          type: 'value',
          min: axis.percentMin,
          max: axis.percentMax,
          splitNumber: 4,
          axisLabel: {
            color: colors.textTertiary,
            fontSize: 10,
            formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '价格',
          type: 'line',
          data: prices,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#58a6ff' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(88, 166, 255, 0.28)' },
                { offset: 1, color: 'rgba(88, 166, 255, 0)' },
              ],
            },
          },
        },
        {
          name: '均价',
          type: 'line',
          data: avgPrices,
          symbol: 'none',
          lineStyle: { width: 1, color: '#3b82f6', type: 'dashed' },
        },
        ...(boardChanges.some((value) => value !== null) ? [{
          name: boardName,
          type: 'line',
          yAxisIndex: 1,
          data: boardChanges,
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
        }] : []),
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.bgElevated,
        borderColor: colors.borderPrimary,
        textStyle: { color: colors.textPrimary, fontSize: 12 },
        formatter: (params: Array<{ axisValue: string }>) => {
          const index = times.indexOf(params[0]?.axisValue ?? '');
          return [
            params[0]?.axisValue ?? '',
            `价格 ${formatPrice(prices[index])}`,
            `均价 ${formatPrice(avgPrices[index])}`,
            `涨跌幅 ${formatPercent(changePercents[index])}`,
            ...(boardChanges[index] === null || boardChanges[index] === undefined
              ? []
              : [`${boardName} ${formatPercent(boardChanges[index])}`]),
          ].join('<br/>');
        },
      },
    };
  }

  if (!minuteKline.length) {
    return {};
  }

  const times = minuteKline.map((item) => item.time);
  const ohlc = minuteKline.map((item) => [item.open, item.close, item.low, item.high]);
  const boardChanges = boardChangeSeries(boardTrend, times);
  const axis = getSyncedPriceAxis(
    minuteKline.flatMap((item) => [item.open, item.close, item.low, item.high]),
    prevClose ?? minuteKline[0]?.open
  );

  return {
    animation: false,
    grid: { left: 60, right: 58, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: colors.borderPrimary } },
      axisLabel: { color: colors.textTertiary, fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        min: axis.priceMin,
        max: axis.priceMax,
        splitNumber: 4,
        axisLine: { show: false },
        axisLabel: {
          color: colors.textTertiary,
          fontSize: 10,
          formatter: (value: number) => value.toFixed(2),
        },
        splitLine: { lineStyle: { color: colors.borderSecondary, type: 'dashed' } },
      },
      {
        type: 'value',
        min: axis.percentMin,
        max: axis.percentMax,
        splitNumber: 4,
        axisLabel: {
          color: colors.textTertiary,
          fontSize: 10,
          formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: `${minutePeriod}分K`,
        type: 'candlestick',
        data: ohlc,
        itemStyle: {
          color: colors.rise,
          color0: colors.fall,
          borderColor: colors.rise,
          borderColor0: colors.fall,
        },
      },
      ...(boardChanges.some((value) => value !== null) ? [{
        name: boardName,
        type: 'line',
        yAxisIndex: 1,
        data: boardChanges,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
      }] : []),
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.bgElevated,
      borderColor: colors.borderPrimary,
      textStyle: { color: colors.textPrimary, fontSize: 12 },
      formatter: (params: Array<{ axisValue: string }>) => {
        const index = times.indexOf(params[0]?.axisValue ?? '');
        const item = minuteKline[index];
        const changePercent = item?.changePercent
          ?? (item && prevClose ? (item.close - prevClose) / prevClose * 100 : null);
        return [
          params[0]?.axisValue ?? '',
          `价格 ${formatPrice(item?.close)}`,
          `涨跌幅 ${formatPercent(changePercent)}`,
          ...(boardChanges[index] === null || boardChanges[index] === undefined
            ? []
            : [`${boardName} ${formatPercent(boardChanges[index])}`]),
        ].join('<br/>');
      },
    },
  };
}

function boardChangeSeries(data: BoardTrend, times: string[]) {
  const getPrice = (item: BoardTrend[number]) => 'price' in item ? item.price : item.close;
  const changeByTime = new Map(data.map((item) => [
    item.time.slice(-5),
    'changePercent' in item ? item.changePercent : null,
  ]));
  const valueByTime = new Map(data.map((item) => [item.time.slice(-5), getPrice(item)]));
  const base = data.find((item) => getPrice(item) !== null);
  const basePrice = base ? getPrice(base) ?? 0 : 0;
  return times.map((time) => {
    const changePercent = changeByTime.get(time.slice(-5));
    if (changePercent !== null && changePercent !== undefined) return changePercent;
    const value = valueByTime.get(time.slice(-5));
    return value === null || value === undefined || basePrice === 0
      ? null
      : (value - basePrice) / basePrice * 100;
  });
}

function buildChipOption(data: ChipRows, currentPrice: number, colors: ChartColors) {
  const histogram = data.at(-1)?.histogram;
  if (!histogram?.prices.length) return {};
  const closestPrice = currentPrice > 0
    ? histogram.prices.reduce((closest, price) =>
        Math.abs(price - currentPrice) < Math.abs(closest - currentPrice) ? price : closest
      )
    : null;
  return {
    animation: false,
    grid: { left: 58, right: 18, top: 12, bottom: 28 },
    xAxis: {
      type: 'value',
      axisLabel: { color: colors.textTertiary, formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: colors.borderSecondary, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: histogram.prices.map((price) => price.toFixed(2)),
      axisLabel: { color: colors.textTertiary, fontSize: 10 },
      axisLine: { lineStyle: { color: colors.borderPrimary } },
    },
    series: [{
      name: '筹码占比',
      type: 'bar',
      data: histogram.ratios,
      itemStyle: { color: colors.rise, borderRadius: [0, 2, 2, 0] },
      barMaxWidth: 5,
      markLine: closestPrice === null ? undefined : {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 1.5 },
        label: {
          show: true,
          position: 'insideEndTop',
          color: '#f59e0b',
          formatter: `现价 ${formatPrice(currentPrice)}`,
        },
        data: [{ yAxis: closestPrice.toFixed(2) }],
      },
    }],
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.bgElevated,
      borderColor: colors.borderPrimary,
      textStyle: { color: colors.textPrimary },
      formatter: (params: Array<{ axisValue: string; value: number }>) =>
        `价格 ${params[0]?.axisValue ?? '--'}<br/>筹码占比 ${((params[0]?.value ?? 0) * 100).toFixed(2)}%`,
    },
  };
}

function buildMarginOption(data: MarginRows, currentPrice: number, colors: ChartColors) {
  return {
    animation: false,
    grid: { left: 72, right: 18, top: 28, bottom: 32 },
    legend: { top: 0, textStyle: { color: colors.textTertiary } },
    xAxis: {
      type: 'category',
      data: data.map((item) => item.date.slice(5)),
      axisLabel: { color: colors.textTertiary },
      axisLine: { lineStyle: { color: colors.borderPrimary } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: colors.textTertiary, formatter: (value: number) => formatYuanAmount(value) },
      splitLine: { lineStyle: { color: colors.borderSecondary, type: 'dashed' } },
    },
    series: [
      {
        name: '融资净买入',
        type: 'bar',
        data: data.map((item) => (item.finBuyAmount ?? 0) - (item.finRepayAmount ?? 0)),
        itemStyle: { color: colors.rise },
      },
      {
        name: '融券净卖出估值',
        type: 'bar',
        data: data.map((item) => -((item.loanSellVolume ?? 0) - (item.loanRepayVolume ?? 0)) * currentPrice),
        itemStyle: { color: colors.fall },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.bgElevated,
      borderColor: colors.borderPrimary,
      textStyle: { color: colors.textPrimary },
      valueFormatter: (value: number) => formatYuanAmount(value),
    },
  };
}

function buildKlineOption(args: {
  data: KlineDataItem[];
  overlays: OverlayIndicatorKey[];
  oscillator: OscillatorIndicatorKey;
  indicatorConfig: IndicatorConfig;
  colors: ChartColors;
}) {
  const { data, overlays, oscillator, indicatorConfig, colors } = args;

  if (!data.length) {
    return {};
  }

  const dates = data.map((item) => item.date);
  const ohlc = data.map((item) => [
    item.open ?? 0,
    item.close ?? 0,
    item.low ?? 0,
    item.high ?? 0,
  ]);
  const volumes = data.map((item) => ({
    value: item.volume ?? 0,
    itemStyle: {
      color: (item.close ?? 0) >= (item.open ?? 0) ? colors.rise : colors.fall,
    },
  }));

  const startPercent =
    data.length > 60 ? Math.max(0, ((data.length - 60) / data.length) * 100) : 0;

  const series: unknown[] = [
    {
      name: 'K线',
      type: 'candlestick',
      data: ohlc,
      itemStyle: {
        color: colors.rise,
        color0: colors.fall,
        borderColor: colors.rise,
        borderColor0: colors.fall,
      },
    },
    {
      name: '成交量',
      type: 'bar',
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: volumes,
    },
  ];

  if (overlays.includes('ma')) {
    const maColors = ['#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];
    indicatorConfig.ma.forEach((period, index) => {
      series.push({
        name: `MA${period}`,
        type: 'line',
        data: data.map((item) => item.ma?.[`ma${period}`] ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: maColors[index % maColors.length] },
      });
    });
  }

  if (overlays.includes('boll')) {
    series.push(
      {
        name: 'BOLL上轨',
        type: 'line',
        data: data.map((item) => item.boll?.upper ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#f59e0b', type: 'dashed' },
      },
      {
        name: 'BOLL中轨',
        type: 'line',
        data: data.map((item) => item.boll?.mid ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#8b5cf6' },
      },
      {
        name: 'BOLL下轨',
        type: 'line',
        data: data.map((item) => item.boll?.lower ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#f59e0b', type: 'dashed' },
      }
    );
  }

  if (overlays.includes('sar')) {
    series.push({
      name: 'SAR',
      type: 'scatter',
      data: data.map((item) => item.sar?.sar ?? null),
      symbolSize: 5,
      itemStyle: { color: '#22d3ee' },
    });
  }

  if (overlays.includes('kc')) {
    series.push(
      {
        name: 'KC上轨',
        type: 'line',
        data: data.map((item) => item.kc?.upper ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#10b981' },
      },
      {
        name: 'KC中轨',
        type: 'line',
        data: data.map((item) => item.kc?.mid ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#06b6d4' },
      },
      {
        name: 'KC下轨',
        type: 'line',
        data: data.map((item) => item.kc?.lower ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#10b981' },
      }
    );
  }

  switch (oscillator) {
    case 'kdj':
      series.push(
        {
          name: 'K',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.kdj?.k ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#f59e0b' },
        },
        {
          name: 'D',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.kdj?.d ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#3b82f6' },
        },
        {
          name: 'J',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.kdj?.j ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#ec4899' },
        }
      );
      break;
    case 'rsi':
      indicatorConfig.rsi.forEach((period, index) => {
        const colors = ['#f59e0b', '#3b82f6', '#ec4899', '#14b8a6'];
        series.push({
          name: `RSI${period}`,
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.rsi?.[`rsi${period}`] ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: colors[index % colors.length] },
        });
      });
      break;
    case 'obv':
      series.push(
        {
          name: 'OBV',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.obv?.obv ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#60a5fa' },
        },
        {
          name: 'OBV MA',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.obv?.obvMa ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#f59e0b' },
        }
      );
      break;
    case 'roc':
      series.push(
        {
          name: 'ROC',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.roc?.roc ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: colors.fall },
        },
        {
          name: 'ROC Signal',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.roc?.signal ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#f59e0b' },
        }
      );
      break;
    case 'dmi':
      series.push(
        {
          name: '+DI',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.dmi?.pdi ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: colors.fall },
        },
        {
          name: '-DI',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.dmi?.mdi ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: colors.rise },
        },
        {
          name: 'ADX',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.dmi?.adx ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#3b82f6' },
        }
      );
      break;
    case 'macd':
    default:
      series.push(
        {
          name: 'MACD',
          type: 'bar',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => ({
            value: item.macd?.macd ?? 0,
            itemStyle: { color: (item.macd?.macd ?? 0) >= 0 ? colors.rise : colors.fall },
          })),
        },
        {
          name: 'DIF',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.macd?.dif ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#f59e0b' },
        },
        {
          name: 'DEA',
          type: 'line',
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: data.map((item) => item.macd?.dea ?? null),
          symbol: 'none',
          lineStyle: { width: 1, color: '#3b82f6' },
        }
      );
      break;
  }

  const latest = data[data.length - 1];
  const oscillatorSummary =
    oscillator === 'macd'
      ? `MACD ${latest.macd?.dif?.toFixed(2) ?? '-'} / ${latest.macd?.dea?.toFixed(2) ?? '-'}`
      : oscillator === 'kdj'
        ? `KDJ ${latest.kdj?.k?.toFixed(2) ?? '-'} / ${latest.kdj?.d?.toFixed(2) ?? '-'} / ${latest.kdj?.j?.toFixed(2) ?? '-'}`
        : oscillator === 'rsi'
          ? `RSI ${indicatorConfig.rsi
              .map((period) => `${period}:${latest.rsi?.[`rsi${period}`]?.toFixed(2) ?? '-'}`)
              .join(' ')}`
          : oscillator === 'obv'
            ? `OBV ${latest.obv?.obv?.toFixed(0) ?? '-'}`
            : oscillator === 'roc'
              ? `ROC ${latest.roc?.roc?.toFixed(2) ?? '-'}`
              : `DMI ${latest.dmi?.pdi?.toFixed(2) ?? '-'} / ${latest.dmi?.mdi?.toFixed(2) ?? '-'} / ${latest.dmi?.adx?.toFixed(2) ?? '-'}`;

  return {
    animation: false,
    grid: [
      { left: 70, right: 30, top: 42, height: '40%' },
      { left: 70, right: 30, top: '62%', height: '10%' },
      { left: 70, right: 30, top: '78%', height: '12%' },
    ],
    graphic: [
      {
        type: 'text',
        left: 80,
        top: 10,
        style: {
          text: oscillatorSummary,
          fill: colors.textTertiary,
          fontSize: 11,
        },
      },
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: colors.borderPrimary } },
        axisLabel: { show: false },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        axisLine: { lineStyle: { color: colors.borderPrimary } },
        axisLabel: { show: false },
      },
      {
        type: 'category',
        gridIndex: 2,
        data: dates,
        axisLine: { lineStyle: { color: colors.borderPrimary } },
        axisLabel: { color: colors.textTertiary, fontSize: 10 },
      },
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        axisLine: { show: false },
        axisLabel: { color: colors.textTertiary, fontSize: 10 },
        splitLine: { lineStyle: { color: colors.borderSecondary, type: 'dashed' } },
      },
      {
        type: 'value',
        gridIndex: 1,
        axisLine: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'value',
        gridIndex: 2,
        axisLine: { show: false },
        axisLabel: { color: colors.textTertiary, fontSize: 9 },
        splitLine: { show: false },
      },
    ],
    series,
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.bgElevated,
      borderColor: colors.borderPrimary,
      textStyle: { color: colors.textPrimary, fontSize: 12 },
      formatter: (params: unknown[]) => {
        if (!Array.isArray(params) || params.length === 0) {
          return '';
        }

        const firstParam = params[0] as { axisValue?: string; dataIndex?: number };
        const dataIndex = firstParam.dataIndex ?? 0;
        const item = data[dataIndex];

        if (!item) {
          return '';
        }

        const overlayTexts: string[] = [];

        if (overlays.includes('ma')) {
          overlayTexts.push(
            ...indicatorConfig.ma.map(
              (period) => `MA${period}: ${item.ma?.[`ma${period}`]?.toFixed(2) ?? '--'}`
            )
          );
        }

        if (overlays.includes('boll')) {
          overlayTexts.push(
            `BOLL: ${item.boll?.upper?.toFixed(2) ?? '--'} / ${item.boll?.mid?.toFixed(2) ?? '--'} / ${item.boll?.lower?.toFixed(2) ?? '--'}`
          );
        }

        if (overlays.includes('sar')) {
          overlayTexts.push(`SAR: ${item.sar?.sar?.toFixed(2) ?? '--'}`);
        }

        if (overlays.includes('kc')) {
          overlayTexts.push(
            `KC: ${item.kc?.upper?.toFixed(2) ?? '--'} / ${item.kc?.mid?.toFixed(2) ?? '--'} / ${item.kc?.lower?.toFixed(2) ?? '--'}`
          );
        }

        let oscillatorText = '';
        switch (oscillator) {
          case 'kdj':
            oscillatorText = `KDJ: ${item.kdj?.k?.toFixed(2) ?? '--'} / ${item.kdj?.d?.toFixed(2) ?? '--'} / ${item.kdj?.j?.toFixed(2) ?? '--'}`;
            break;
          case 'rsi':
            oscillatorText = indicatorConfig.rsi
              .map((period) => `RSI${period}: ${item.rsi?.[`rsi${period}`]?.toFixed(2) ?? '--'}`)
              .join('<br/>');
            break;
          case 'obv':
            oscillatorText = `OBV: ${item.obv?.obv?.toFixed(0) ?? '--'} / MA: ${item.obv?.obvMa?.toFixed(0) ?? '--'}`;
            break;
          case 'roc':
            oscillatorText = `ROC: ${item.roc?.roc?.toFixed(2) ?? '--'} / Signal: ${item.roc?.signal?.toFixed(2) ?? '--'}`;
            break;
          case 'dmi':
            oscillatorText = `+DI: ${item.dmi?.pdi?.toFixed(2) ?? '--'}<br/>-DI: ${item.dmi?.mdi?.toFixed(2) ?? '--'}<br/>ADX: ${item.dmi?.adx?.toFixed(2) ?? '--'}`;
            break;
          case 'macd':
          default:
            oscillatorText = `DIF: ${item.macd?.dif?.toFixed(2) ?? '--'} / DEA: ${item.macd?.dea?.toFixed(2) ?? '--'} / MACD: ${item.macd?.macd?.toFixed(2) ?? '--'}`;
            break;
        }

        return `
          <div style="font-weight:500;margin-bottom:8px;">${firstParam.axisValue ?? ''}</div>
          <div>开: ${(item.open ?? 0).toFixed(2)} 收: ${(item.close ?? 0).toFixed(2)}</div>
          <div>高: ${(item.high ?? 0).toFixed(2)} 低: ${(item.low ?? 0).toFixed(2)}</div>
          <div>量: ${((item.volume ?? 0) / 10000).toFixed(2)}万手</div>
          ${overlayTexts.length > 0 ? `<div style="margin-top:6px;border-top:1px solid ${colors.borderPrimary};padding-top:6px;">${overlayTexts.join('<br/>')}</div>` : ''}
          <div style="margin-top:6px;border-top:1px solid ${colors.borderPrimary};padding-top:6px;">${oscillatorText}</div>
        `;
      },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: startPercent, end: 100 },
      {
        type: 'slider',
        xAxisIndex: [0, 1, 2],
        start: startPercent,
        end: 100,
        bottom: 10,
        height: 20,
        borderColor: colors.borderPrimary,
        backgroundColor: colors.borderSecondary,
        fillerColor: 'rgba(88, 166, 255, 0.2)',
        handleStyle: { color: '#58a6ff' },
        textStyle: { color: colors.textTertiary, fontSize: 10 },
      },
    ],
  };
}

export function StockDetail() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { settings, getRefreshInterval } = useAppSettings();
  const { theme } = useTheme();
  const chartColors = useMemo(
    () => getChartColors(theme, settings.colorMode),
    [theme, settings.colorMode]
  );
  const normalizedCode = normalizeStockCode(code || '');

  const [quote, setQuote] = useState<FullQuote | null>(null);
  const [timeline, setTimeline] = useState<TodayTimelineResponse | null>(null);
  const [minuteKline, setMinuteKline] = useState<MinuteKlineItem[]>([]);
  const [klineData, setKlineData] = useState<KlineDataItem[]>([]);
  const [fundFlow, setFundFlow] = useState<FundFlow | null>(null);
  const [largeOrder, setLargeOrder] = useState<PanelLargeOrder | null>(null);
  const [individualFundFlowHistory, setIndividualFundFlowHistory] =
    useState<IndividualFundFlowRows>([]);
  const [northboundHoldings, setNorthboundHoldings] =
    useState<NorthboundIndividualRows>([]);
  const [chipData, setChipData] = useState<ChipRows>([]);
  const [marginData, setMarginData] = useState<MarginRows>([]);
  const [chipLoading, setChipLoading] = useState(true);
  const [marginLoading, setMarginLoading] = useState(true);
  const [chipError, setChipError] = useState(false);
  const [marginError, setMarginError] = useState(false);
  const [boardMembership, setBoardMembership] = useState<BoardMembership>({ industry: null, concepts: [] });
  const [boardOptions, setBoardOptions] = useState<BoardRef[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<BoardRef | null>(null);
  const [boardTrend, setBoardTrend] = useState<BoardTrend>([]);
  const [boardSearch, setBoardSearch] = useState('');
  const [alerts, setAlerts] = useState(() => getAlertsByCode(normalizedCode));

  const [loading, setLoading] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [minutePeriod, setMinutePeriod] = useState('1');
  const [klinePeriod, setKlinePeriod] = useState('daily');
  const [selectedOverlays, setSelectedOverlays] = useState<OverlayIndicatorKey[]>(['ma']);
  const [selectedOscillator, setSelectedOscillator] =
    useState<OscillatorIndicatorKey>('macd');
  const [alertType, setAlertType] = useState<AlertType>('price_gte');
  const [alertValue, setAlertValue] = useState('');

  const detailRefreshInterval = getRefreshInterval('detail');
  const fundRefreshInterval = Math.max(detailRefreshInterval * 6, 30000);

  useEffect(() => {
    setInWatchlist(isInWatchlist(normalizedCode));
    setAlerts(getAlertsByCode(normalizedCode));
  }, [normalizedCode]);

  useEffect(() => {
    void Promise.allSettled([getStockBoardMembership(normalizedCode), getBoardOptions()]).then(
      ([membershipResult, optionsResult]) => {
        if (membershipResult.status === 'fulfilled') {
          setBoardMembership(membershipResult.value);
          setSelectedBoard(membershipResult.value.industry);
          setBoardSearch(membershipResult.value.industry?.name ?? '');
        }
        if (optionsResult.status === 'fulfilled') setBoardOptions(optionsResult.value);
      }
    );
  }, [normalizedCode]);

  const boardRequestRef = useRef(0);
  useEffect(() => {
    if (!selectedBoard) {
      setBoardTrend([]);
      return;
    }
    const requestId = ++boardRequestRef.current;
    void getBoardMinuteTrend(
      selectedBoard,
      minutePeriod as '1' | '5' | '15' | '30' | '60'
    ).then((data) => {
      if (requestId === boardRequestRef.current) setBoardTrend(data);
    }).catch((error) => {
      console.error('Fetch board trend error:', error);
      if (requestId === boardRequestRef.current) setBoardTrend([]);
    });
  }, [minutePeriod, selectedBoard]);

  useEffect(() => {
    setChipLoading(true);
    setMarginLoading(true);
    setChipError(false);
    setMarginError(false);
    void Promise.allSettled([
      getChipDistribution(normalizedCode).then(setChipData).catch((error) => {
        console.error('Fetch chip distribution error:', error);
        setChipError(true);
      }).finally(() => setChipLoading(false)),
      getMarginTargetHistory(normalizedCode).then(setMarginData).catch((error) => {
        console.error('Fetch margin history error:', error);
        setMarginError(true);
      }).finally(() => setMarginLoading(false)),
    ]);
  }, [normalizedCode]);

  // 每个 alertType 只预填一次：quote 随轮询高频更新，无守卫会持续覆写用户正在输入的阈值
  const prefilledAlertTypeRef = useRef<AlertType | null>(null);

  useEffect(() => {
    if (!quote || prefilledAlertTypeRef.current === alertType) {
      return;
    }
    prefilledAlertTypeRef.current = alertType;

    switch (alertType) {
      case 'change_percent_gte':
      case 'change_percent_lte':
        setAlertValue(String(quote.changePercent.toFixed(2)));
        break;
      case 'amount_gte':
        setAlertValue(String(Math.max(quote.amount, 1).toFixed(2)));
        break;
      case 'price_gte':
      case 'price_lte':
      default:
        setAlertValue(String(quote.price.toFixed(2)));
        break;
    }
  }, [alertType, quote]);

  const fetchQuote = useCallback(async () => {
    if (!normalizedCode) {
      return;
    }

    try {
      const [quoteData] = await getFullQuotes([normalizedCode]);
      if (quoteData) {
        setQuote(quoteData);
      }
    } catch (error) {
      console.error('Fetch quote error:', error);
    }
  }, [normalizedCode]);

  // 周期切换后旧周期的慢响应可能后到，比对最新周期丢弃过期数据
  const minutePeriodRef = useRef(minutePeriod);
  minutePeriodRef.current = minutePeriod;
  const klinePeriodRef = useRef(klinePeriod);
  klinePeriodRef.current = klinePeriod;

  const fetchTimeline = useCallback(async () => {
    if (!normalizedCode) {
      return;
    }

    const requestPeriod = minutePeriod;
    try {
      if (requestPeriod === '1') {
        const data = await getTodayTimeline(normalizedCode);
        if (minutePeriodRef.current !== requestPeriod) return;
        setTimeline(data);
        setMinuteKline([]);
        return;
      }

      const data = await getMinuteKline(normalizedCode, {
        period: requestPeriod as '5' | '15' | '30' | '60',
      });
      if (minutePeriodRef.current !== requestPeriod) return;
      setMinuteKline(data as MinuteKlineItem[]);
      setTimeline(null);
    } catch (error) {
      console.error('Fetch timeline error:', error);
    }
  }, [minutePeriod, normalizedCode]);

  const fetchKline = useCallback(async () => {
    if (!normalizedCode) {
      return;
    }

    const requestPeriod = klinePeriod;
    try {
      const history = await getHistoryKline(normalizedCode, {
        period: requestPeriod as 'daily' | 'weekly' | 'monthly',
        adjust: 'qfq',
      });
      if (klinePeriodRef.current !== requestPeriod) return;

      const enriched = addIndicators(history, {
        ma: { periods: settings.indicatorConfig.ma },
        macd: settings.indicatorConfig.macd,
        boll: settings.indicatorConfig.boll,
        kdj: settings.indicatorConfig.kdj,
        rsi: { periods: settings.indicatorConfig.rsi },
      });

      const ohlcv = history.map((item) => ({
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }));

      const obv = calcOBV(ohlcv, { maPeriod: settings.indicatorConfig.ma[1] ?? 10 });
      const roc = calcROC(ohlcv, { period: 12, signalPeriod: 6 });
      const dmi = calcDMI(ohlcv, settings.indicatorConfig.dmi);
      const sar = calcSAR(ohlcv, settings.indicatorConfig.sar);
      const kc = calcKC(ohlcv, settings.indicatorConfig.kc);

      setKlineData(
        enriched.map((item, index) => ({
          ...(item as HistoryKline),
          ma: item.ma as Record<string, number> | undefined,
          macd: item.macd as { dif?: number; dea?: number; macd?: number } | undefined,
          boll: item.boll as { upper?: number; mid?: number; lower?: number } | undefined,
          kdj: item.kdj as { k?: number; d?: number; j?: number } | undefined,
          rsi: item.rsi as Record<string, number> | undefined,
          obv: obv[index],
          roc: roc[index],
          dmi: dmi[index],
          sar: sar[index],
          kc: kc[index],
        }))
      );
    } catch (error) {
      console.error('Fetch kline error:', error);
    }
  }, [klinePeriod, normalizedCode, settings.indicatorConfig]);

  const fetchFundData = useCallback(async () => {
    if (!normalizedCode) {
      return;
    }

    try {
      const [
        [flowData],
        [orderData],
        individualFundFlowData,
        northboundHoldingData,
      ] = await Promise.all([
        getFundFlow([normalizedCode]),
        getPanelLargeOrder([normalizedCode]),
        getIndividualFundFlow(normalizedCode, { period: 'daily' }),
        getNorthboundIndividual(normalizedCode),
      ]);

      if (flowData) {
        setFundFlow(flowData);
      }
      if (orderData) {
        setLargeOrder(orderData);
      }

      setIndividualFundFlowHistory(individualFundFlowData.slice(-8));
      setNorthboundHoldings(northboundHoldingData.slice(-8));
    } catch (error) {
      console.error('Fetch fund data error:', error);
    }
  }, [normalizedCode]);

  // 整载只跑一次（换股由路由 key 重挂载触发）；周期/指标变化走下面的专属增量 effect，
  // 若把 fetch 回调放进依赖，切个 tab 就会全屏 loading + 五个接口全部重拉
  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      await Promise.all([
        fetchQuote(),
        fetchTimeline(),
        fetchKline(),
        fetchFundData(),
      ]);
      setLoading(false);
    };

    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedCode]);

  // 跳过挂载首轮（loadInitial 已拉过），只响应周期/指标配置变化
  const timelineFetchedOnceRef = useRef(false);
  useEffect(() => {
    if (!timelineFetchedOnceRef.current) {
      timelineFetchedOnceRef.current = true;
      return;
    }
    fetchTimeline();
  }, [fetchTimeline]);

  const klineFetchedOnceRef = useRef(false);
  useEffect(() => {
    if (!klineFetchedOnceRef.current) {
      klineFetchedOnceRef.current = true;
      return;
    }
    fetchKline();
  }, [fetchKline]);

  usePolling(
    useCallback(async () => {
      await Promise.all([fetchQuote(), fetchTimeline()]);
    }, [fetchQuote, fetchTimeline]),
    {
      interval: detailRefreshInterval,
      enabled: !loading,
      immediate: false,
    }
  );

  usePolling(fetchFundData, {
    interval: fundRefreshInterval,
    enabled: !loading,
    immediate: false,
  });

  const handleToggleWatchlist = useCallback(() => {
    if (inWatchlist) {
      removeFromWatchlist(normalizedCode);
      toast.success('已从自选移除');
    } else {
      addToWatchlist(normalizedCode);
      toast.success('已加入自选');
    }
    setInWatchlist((prev) => !prev);
  }, [inWatchlist, normalizedCode, toast]);

  const handleAddAlert = useCallback(() => {
    if (!quote) {
      return;
    }

    const value = Number(alertValue);
    // 涨跌幅类阈值合法值域含负数（跌幅告警），只有价格/成交额类才要求正数
    const requiresPositive = !['change_percent_gte', 'change_percent_lte'].includes(alertType);
    if (!Number.isFinite(value) || (requiresPositive && value <= 0)) {
      toast.warning('请输入有效的告警阈值');
      return;
    }

    addAlertRule({
      code: normalizedCode,
      name: quote.name,
      type: alertType,
      value,
      cooldownSec: 300,
      enabled: true,
      lastTriggeredAt: 0,
    });
    setAlerts(getAlertsByCode(normalizedCode));
    toast.success('已添加本地告警');
  }, [alertType, alertValue, normalizedCode, quote, toast]);

  const handleDeleteAlert = useCallback(
    (ruleId: string) => {
      deleteAlertRule(ruleId);
      setAlerts(getAlertsByCode(normalizedCode));
      toast.success('已删除告警');
    },
    [normalizedCode, toast]
  );

  const selectableBoards = useMemo(() => {
    const boards = [
      ...(boardMembership.industry ? [boardMembership.industry] : []),
      ...boardMembership.concepts,
      ...boardOptions,
    ];
    return [...new Map(boards.map((item) => [`${item.type}-${item.code}`, item])).values()];
  }, [boardMembership, boardOptions]);

  const selectBoardByName = useCallback((name: string) => {
    const match = selectableBoards.find((item) => item.name === name.trim());
    if (!match) return;
    setSelectedBoard(match);
    setBoardSearch(match.name);
  }, [selectableBoards]);

  const latestNorthboundHolding = northboundHoldings.at(-1) ?? null;

  const timelineChartOption = useMemo(
    () =>
      buildTimelineOption({
        minutePeriod,
        timeline,
        minuteKline,
        prevClose: quote?.prevClose,
        colors: chartColors,
        boardTrend,
        boardName: selectedBoard?.name ?? '',
      }),
    [boardTrend, chartColors, minuteKline, minutePeriod, quote?.prevClose, selectedBoard?.name, timeline]
  );

  const klineChartOption = useMemo(
    () =>
      buildKlineOption({
        data: klineData,
        overlays: selectedOverlays,
        oscillator: selectedOscillator,
        indicatorConfig: settings.indicatorConfig,
        colors: chartColors,
      }),
    [klineData, selectedOscillator, selectedOverlays, settings.indicatorConfig, chartColors]
  );

  const latestChip = chipData.at(-1) ?? null;
  const buySidePercent = largeOrder
    ? (largeOrder.buyLargeRatio + largeOrder.buySmallRatio) * 100
    : 0;
  const sellSidePercent = largeOrder
    ? (largeOrder.sellLargeRatio + largeOrder.sellSmallRatio) * 100
    : 0;
  const chipChartOption = useMemo(
    () => buildChipOption(chipData, quote?.price ?? 0, chartColors),
    [chipData, quote?.price, chartColors]
  );
  const marginSummary = useMemo(
    () => summarizeMarginTrend(marginData, quote?.price ?? 0),
    [marginData, quote?.price]
  );
  const marginChartOption = useMemo(
    () => buildMarginOption(marginData, quote?.price ?? 0, chartColors),
    [chartColors, marginData, quote?.price]
  );

  if (loading) {
    return <Loading fullScreen text="加载中..." />;
  }

  if (!quote) {
    return (
      <div className={styles.notFound}>
        <p>未找到股票 {code}</p>
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>
    );
  }

  return (
    <div className={styles.detail}>
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>

        <div className={styles.stockHeader}>
          <div className={styles.stockTitle}>
            <h1 className={styles.stockName}>{quote.name}</h1>
            <span className={styles.stockCode}>{quote.code}</span>
          </div>
          <div className={styles.boardMeta}>
            {boardMembership.industry ? (
              <button onClick={() => navigate(`/boards/industry/${boardMembership.industry?.code}`)}>
                行业 · {boardMembership.industry.name}
              </button>
            ) : <span>行业 · --</span>}
            {boardMembership.concepts.length > 0 ? boardMembership.concepts.slice(0, 4).map((item) => (
              <button key={item.code} onClick={() => navigate(`/boards/concept/${item.code}`)}>
                概念 · {item.name}
              </button>
            )) : <span>概念 · --</span>}
          </div>
          <div className={styles.priceSection}>
            <span className={`${styles.price} ${getChangeColorClass(quote.changePercent)}`}>
              {formatPrice(quote.price)}
            </span>
            <div className={styles.changeInfo}>
              <span className={getChangeColorClass(quote.changePercent)}>
                {formatChange(quote.change)}
              </span>
              <span className={getChangeColorClass(quote.changePercent)}>
                {formatPercent(quote.changePercent)}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <div className={styles.inlineAlert}>
            <select
              aria-label="告警类型"
              value={alertType}
              onChange={(event) => setAlertType(event.target.value as AlertType)}
            >
              {ALERT_TYPE_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <input
              aria-label="告警阈值"
              value={alertValue}
              onChange={(event) => setAlertValue(event.target.value)}
              type="number"
              step="0.01"
            />
            <Button size="sm" icon={<Bell size={14} />} onClick={handleAddAlert}>告警</Button>
            {alerts.length > 0 && (
              <details className={styles.alertDetails}>
                <summary>已设 {alerts.length}</summary>
                <div className={styles.compactAlertList}>
                  {alerts.map((rule) => (
                    <div key={rule.id}>
                      <span>{ALERT_TYPE_OPTIONS.find((item) => item.key === rule.type)?.label}{rule.value}</span>
                      <button aria-label="删除告警" onClick={() => handleDeleteAlert(rule.id)}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
          <Button
            variant={inWatchlist ? 'primary' : 'secondary'}
            icon={inWatchlist ? <Star size={16} /> : <StarOff size={16} />}
            onClick={handleToggleWatchlist}
          >
            {inWatchlist ? '已自选' : '加自选'}
          </Button>
        </div>
      </motion.header>

      <Card padding="md">
        <div className={styles.quoteGrid}>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>今开</span>
            <span className={styles.quoteValue}>{formatPrice(quote.open)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>昨收</span>
            <span className={styles.quoteValue}>{formatPrice(quote.prevClose)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>最高</span>
            <span className={`${styles.quoteValue} text-rise`}>{formatPrice(quote.high)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>最低</span>
            <span className={`${styles.quoteValue} text-fall`}>{formatPrice(quote.low)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>成交量</span>
            <span className={styles.quoteValue}>{formatVolume(quote.volume)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>成交额</span>
            <span className={styles.quoteValue}>{formatAmount(quote.amount)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>换手率</span>
            <span className={styles.quoteValue}>{formatTurnover(quote.turnoverRate)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>量比</span>
            <span className={styles.quoteValue}>{formatVolumeRatio(quote.volumeRatio)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>市盈率</span>
            <span className={styles.quoteValue}>{formatRatio(quote.pe)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>市净率</span>
            <span className={styles.quoteValue}>{formatRatio(quote.pb)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>总市值</span>
            <span className={styles.quoteValue}>{formatMarketCap(quote.totalMarketCap)}</span>
          </div>
          <div className={styles.quoteItem}>
            <span className={styles.quoteLabel}>流通市值</span>
            <span className={styles.quoteValue}>{formatMarketCap(quote.circulatingMarketCap)}</span>
          </div>
        </div>
      </Card>

      <div className={styles.mainGrid}>
        <div className={styles.chartSection}>
          <Card
            title="走势"
            extra={
              <div className={styles.timelineControls}>
                <Tabs
                  items={MINUTE_PERIODS}
                  activeKey={minutePeriod}
                  onChange={setMinutePeriod}
                  size="sm"
                />
                <label className={styles.boardSearch}>
                  <Search size={14} />
                  <input
                    aria-label="搜索行业或概念"
                    list="stock-board-options"
                    value={boardSearch}
                    placeholder="搜索行业或概念"
                    onChange={(event) => setBoardSearch(event.target.value)}
                    onBlur={(event) => selectBoardByName(event.currentTarget.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') selectBoardByName(event.currentTarget.value); }}
                  />
                  <datalist id="stock-board-options">
                    {selectableBoards.map((item) => <option key={`${item.type}-${item.code}`} value={item.name}>{item.type === 'industry' ? '行业' : '概念'}</option>)}
                  </datalist>
                </label>
              </div>
            }
          >
            <div className={styles.chartContainer}>
              <LazyEChart option={timelineChartOption} style={{ height: '100%', width: '100%' }} notMerge />
            </div>
          </Card>

          <Card
            title="K线"
            extra={
              <div className={styles.klineControls}>
                <Tabs
                  items={KLINE_PERIODS}
                  activeKey={klinePeriod}
                  onChange={setKlinePeriod}
                  size="sm"
                />
                <div className={styles.klineIndicatorPanel}>
                  <div className={styles.indicatorTags}>
                    {OVERLAY_OPTIONS.map((indicator) => (
                      <button
                        key={indicator.key}
                        className={`${styles.indicatorTag} ${selectedOverlays.includes(indicator.key) ? styles.active : ''}`}
                        onClick={() =>
                          setSelectedOverlays((prev) =>
                            prev.includes(indicator.key)
                              ? prev.filter((item) => item !== indicator.key)
                              : [...prev, indicator.key]
                          )
                        }
                      >
                        {indicator.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.oscillatorTags}>
                    {OSCILLATOR_OPTIONS.map((indicator) => (
                      <button
                        key={indicator.key}
                        className={`${styles.indicatorTag} ${selectedOscillator === indicator.key ? styles.active : ''}`}
                        onClick={() => setSelectedOscillator(indicator.key)}
                      >
                        {indicator.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            }
          >
            <div className={styles.chartContainerLarge}>
              <LazyEChart option={klineChartOption} style={{ height: '100%', width: '100%' }} notMerge />
            </div>
          </Card>

          <Card
            title="近七日融资融券"
            extra={marginData.length > 0 && (
              <span className={`${styles.marketBadge} ${getChangeColorClass(marginSummary.netPressure)}`}>
                {marginSummary.label}
              </span>
            )}
          >
            {marginLoading ? <Loading text="加载融资融券..." /> : marginError ? (
              <Empty title="融资融券加载失败" description="数据源暂时不可用" />
            ) : marginData.length === 0 ? (
              <Empty title="暂无近七日融资融券数据" description="该股票可能不是融资融券标的，或数据尚未披露" />
            ) : (
              <>
                <div className={styles.marginSummary}>
                  <span>融资净买入<strong className={getChangeColorClass(marginSummary.financeNet)}>{formatYuanAmount(marginSummary.financeNet)}</strong></span>
                  <span>融券净卖出估值<strong className={getChangeColorClass(-marginSummary.shortNetValue)}>{formatYuanAmount(marginSummary.shortNetValue)}</strong></span>
                  <small>融券金额按当前股价估算</small>
                </div>
                <div className={styles.structureChart}>
                  <LazyEChart option={marginChartOption} style={{ height: '100%', width: '100%' }} notMerge />
                </div>
              </>
            )}
          </Card>
        </div>

        <div className={styles.sideSection}>
          <Card title="五档盘口">
            <div className={styles.orderBook}>
              <div className={styles.askSide}>
                {[...Array(5)].map((_, index) => {
                  const ask = quote.ask?.[4 - index];
                  return (
                    <div key={`ask-${index}`} className={styles.orderRow}>
                      <span className={styles.orderLabel}>卖{5 - index}</span>
                      <span className={`${styles.orderPrice} text-fall`}>
                        {formatPrice(ask?.price)}
                      </span>
                      <span className={styles.orderVolume}>{ask?.volume ?? '--'}</span>
                    </div>
                  );
                })}
              </div>
              <div className={styles.bidSide}>
                {quote.bid?.slice(0, 5).map((bid, index) => (
                  <div key={`bid-${index}`} className={styles.orderRow}>
                    <span className={styles.orderLabel}>买{index + 1}</span>
                    <span className={`${styles.orderPrice} text-rise`}>
                      {formatPrice(bid?.price)}
                    </span>
                    <span className={styles.orderVolume}>{bid?.volume ?? '--'}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {fundFlow && (
            <Card title="个股资金流">
              <div className={styles.fundFlow}>
                <div className={styles.fundItem}>
                  <span className={styles.fundLabel}>主力净流入</span>
                  <span className={`${styles.fundValue} ${getChangeColorClass(fundFlow.mainNet)}`}>
                    {formatAmount(fundFlow.mainNet)}
                  </span>
                </div>
                <div className={styles.fundItem}>
                  <span className={styles.fundLabel}>主力净占比</span>
                  <span
                    className={`${styles.fundValue} ${getChangeColorClass(
                      fundFlow.mainNetRatio
                    )}`}
                  >
                    {formatPercent(fundFlow.mainNetRatio)}
                  </span>
                </div>
                <div className={styles.fundItem}>
                  <span className={styles.fundLabel}>散户净流入</span>
                  <span className={`${styles.fundValue} ${getChangeColorClass(fundFlow.retailNet)}`}>
                    {formatAmount(fundFlow.retailNet)}
                  </span>
                </div>
              </div>

              {individualFundFlowHistory.length > 0 && (
                <div className={styles.historySection}>
                  <div className={styles.historySectionHeader}>近 8 日主力资金</div>
                  <div className={styles.historyList}>
                    {[...individualFundFlowHistory].reverse().map((item) => (
                      <div key={item.date} className={styles.historyRow}>
                        <span className={styles.historyDate}>{formatMaybeDate(item.date)}</span>
                        <div className={styles.historyValueGroup}>
                          <span
                            className={`${styles.historyPrimary} ${getChangeColorClass(
                              item.mainNetInflow
                            )}`}
                          >
                            {formatYuanAmount(item.mainNetInflow)}
                          </span>
                          <span className={styles.historyMeta}>
                            {formatPercent(item.mainNetInflowPercent)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {largeOrder && (
            <Card title="大单结构">
              <div className={styles.largeOrder}>
                <div className={styles.orderSummary}>
                  <span className="text-rise">
                    买盘 <strong>{buySidePercent.toFixed(1)}%</strong>
                  </span>
                  <span className={getChangeColorClass(buySidePercent - sellSidePercent)}>
                    净买差 <strong>{formatPercent(buySidePercent - sellSidePercent)}</strong>
                  </span>
                  <span className="text-fall">
                    卖盘 <strong>{sellSidePercent.toFixed(1)}%</strong>
                  </span>
                </div>
                <div className={styles.orderBar}>
                  <div className={styles.buyLarge} style={{ width: `${largeOrder.buyLargeRatio * 100}%` }} />
                  <div className={styles.buySmall} style={{ width: `${largeOrder.buySmallRatio * 100}%` }} />
                  <div className={styles.sellSmall} style={{ width: `${largeOrder.sellSmallRatio * 100}%` }} />
                  <div className={styles.sellLarge} style={{ width: `${largeOrder.sellLargeRatio * 100}%` }} />
                </div>
                <div className={styles.orderLegend}>
                  <span className={styles.legendItem}>
                    <i className={styles.buyLargeDot} />
                    <span>大买</span><strong>{(largeOrder.buyLargeRatio * 100).toFixed(1)}%</strong>
                  </span>
                  <span className={styles.legendItem}>
                    <i className={styles.buySmallDot} />
                    <span>小买</span><strong>{(largeOrder.buySmallRatio * 100).toFixed(1)}%</strong>
                  </span>
                  <span className={styles.legendItem}>
                    <i className={styles.sellSmallDot} />
                    <span>小卖</span><strong>{(largeOrder.sellSmallRatio * 100).toFixed(1)}%</strong>
                  </span>
                  <span className={styles.legendItem}>
                    <i className={styles.sellLargeDot} />
                    <span>大卖</span><strong>{(largeOrder.sellLargeRatio * 100).toFixed(1)}%</strong>
                  </span>
                </div>
              </div>
            </Card>
          )}

          <Card title="北向持仓">
            {latestNorthboundHolding ? (
              <div className={styles.historySection}>
                <div className={styles.historyList}>
                  <div className={styles.historyRow}>
                    <span className={styles.historyDate}>最新持仓市值</span>
                    <div className={styles.historyValueGroup}>
                      <span className={styles.historyPrimary}>
                        {formatYuanAmount(latestNorthboundHolding.holdMarketValue)}
                      </span>
                      <span className={styles.historyMeta}>
                        {formatMaybeDate(latestNorthboundHolding.date)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.historyRow}>
                    <span className={styles.historyDate}>持股 / 流通占比</span>
                    <div className={styles.historyValueGroup}>
                      <span className={styles.historyPrimary}>
                        {formatCompactNumber(latestNorthboundHolding.holdShares)} 股
                      </span>
                      <span className={styles.historyMeta}>
                        {formatPercent(latestNorthboundHolding.holdRatioFloat, false)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.historySectionHeader}>近 8 日持仓变化</div>
                <div className={styles.historyList}>
                  {[...northboundHoldings].reverse().map((item) => (
                    <div key={item.date} className={styles.historyRow}>
                      <span className={styles.historyDate}>{formatMaybeDate(item.date)}</span>
                      <div className={styles.historyValueGroup}>
                        <span className={styles.historyPrimary}>
                          {formatYuanAmount(item.holdMarketValue)}
                        </span>
                        <span
                          className={`${styles.historyMeta} ${getChangeColorClass(
                            item.changePercent
                          )}`}
                        >
                          {formatPercent(item.changePercent)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.emptyText}>当前股票暂无北向持仓样本</div>
            )}
          </Card>

          <Card title="筹码峰" extra={latestChip && <span className={styles.chartDate}>{latestChip.date}</span>}>
            {chipLoading ? <Loading text="计算筹码分布..." /> : chipError ? (
              <Empty title="筹码峰加载失败" description="行情源暂时不可用" />
            ) : !latestChip?.histogram ? (
              <Empty title="暂无筹码峰数据" description="该标的可能缺少换手率数据" />
            ) : (
              <>
                <div className={styles.chipStats}>
                  <span>获利比例<strong>{formatPercent((latestChip.profitRatio ?? 0) * 100, false)}</strong></span>
                  <span>平均成本<strong>{formatPrice(latestChip.avgCost)}</strong></span>
                  <span>70%成本区间<strong>{formatPrice(latestChip.cost70Low)} - {formatPrice(latestChip.cost70High)}</strong></span>
                  <span>90%成本区间<strong>{formatPrice(latestChip.cost90Low)} - {formatPrice(latestChip.cost90High)}</strong></span>
                </div>
                <div className={styles.chipChart}>
                  <LazyEChart option={chipChartOption} style={{ height: '100%', width: '100%' }} notMerge />
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
