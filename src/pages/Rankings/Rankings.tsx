/**
 * 榜单页面
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Card, Tabs, Loading } from '@/components/common';
import { useAppSettings, useBoardData } from '@/contexts';
import { usePolling } from '@/hooks';
import { getFundFlowRank, getSectorFundFlowRank } from '@/services/sdk';
import {
  formatPercent,
  formatTurnover,
  formatYuanAmount,
  getChangeColorClass,
} from '@/utils/format';
import { sortRows, type SortDirection } from '@/utils/tableSort';
import type { FundFlowRankItem, IndustryBoard, SectorFundFlowItem } from 'stock-sdk';
import { splitFundFlowRanks } from './fundFlowRanking';
import styles from './Rankings.module.css';

// 榜单类型
const RANKING_TYPES = [
  { key: 'rise', label: '涨幅榜', icon: <TrendingUp size={14} /> },
  { key: 'fall', label: '跌幅榜', icon: <TrendingDown size={14} /> },
  { key: 'amount', label: '总市值', icon: <BarChart2 size={14} /> },
  { key: 'turnover', label: '换手率', icon: <RefreshCw size={14} /> },
];

type SortKey = 'rise' | 'fall' | 'amount' | 'turnover';
type BoardSortKey = 'rank' | 'name' | 'changePercent' | 'leadingStock' | 'stats' | 'turnoverRate';
type BoardSort = { key: BoardSortKey; direction: SortDirection } | null;

const BOARD_SORT_GETTERS: Record<
  Exclude<BoardSortKey, 'rank'>,
  (item: IndustryBoard) => string | number | null
> = {
  name: (item) => item.name,
  changePercent: (item) => item.changePercent,
  leadingStock: (item) => item.leadingStock,
  stats: (item) =>
    item.riseCount === null && item.fallCount === null
      ? null
      : (item.riseCount ?? 0) - (item.fallCount ?? 0),
  turnoverRate: (item) => item.turnoverRate,
};

function sortBoards(list: IndustryBoard[], rankType: SortKey): IndustryBoard[] {
  const sorted = [...list];
  switch (rankType) {
    case 'fall':
      sorted.sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
      break;
    case 'turnover':
      sorted.sort((a, b) => (b.turnoverRate ?? 0) - (a.turnoverRate ?? 0));
      break;
    case 'amount':
      sorted.sort((a, b) => (b.totalMarketCap ?? 0) - (a.totalMarketCap ?? 0));
      break;
    case 'rise':
    default:
      sorted.sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
      break;
  }
  return sorted.slice(0, 50);
}

export function Rankings() {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const { industryList, conceptList, loading } = useBoardData();
  const [rankType, setRankType] = useState<SortKey>('rise');
  const [industryFundFlows, setIndustryFundFlows] = useState<SectorFundFlowItem[]>([]);
  const [conceptFundFlows, setConceptFundFlows] = useState<SectorFundFlowItem[]>([]);
  const [stockFundFlows, setStockFundFlows] = useState<FundFlowRankItem[]>([]);
  const [boardSorts, setBoardSorts] = useState<Record<'industry' | 'concept', BoardSort>>({
    industry: null,
    concept: null,
  });

  const fetchFundFlows = useCallback(async () => {
    const [industry, concept, stocks] = await Promise.all([
      getSectorFundFlowRank({ indicator: 'today', sectorType: 'industry' }),
      getSectorFundFlowRank({ indicator: 'today', sectorType: 'concept' }),
      getFundFlowRank({ indicator: 'today' }),
    ]);
    setIndustryFundFlows(industry);
    setConceptFundFlows(concept);
    setStockFundFlows(stocks);
  }, []);

  const { isLoading: fundFlowLoading } = usePolling(fetchFundFlows, {
    interval: Math.max(getRefreshInterval('list') * 4, 60000),
    pauseOnHidden: true,
    immediate: true,
  });

  const sections = useMemo(() => {
    const makeSection = (
      title: string,
      type: 'industry' | 'concept',
      list: IndustryBoard[]
    ) => {
      const ranked = sortBoards(list, rankType).map((item, index) => ({ item, rank: index + 1 }));
      const sort = boardSorts[type];
      return {
        title,
        type,
        list: sort
          ? sortRows(
              ranked,
              (row) => sort.key === 'rank' ? row.rank : BOARD_SORT_GETTERS[sort.key](row.item),
              sort.direction
            )
          : ranked,
      };
    };

    return [
      makeSection('行业板块', 'industry', industryList),
      makeSection('概念板块', 'concept', conceptList),
    ];
  }, [boardSorts, conceptList, industryList, rankType]);

  const fundFlowSections = useMemo(
    () => [
      {
        title: '行业板块资金流',
        type: 'industry' as const,
        ...splitFundFlowRanks(industryFundFlows),
      },
      {
        title: '概念板块资金流',
        type: 'concept' as const,
        ...splitFundFlowRanks(conceptFundFlows),
      },
      {
        title: '主力净流入',
        type: 'stock' as const,
        ...splitFundFlowRanks(stockFundFlows),
      },
    ],
    [conceptFundFlows, industryFundFlows, stockFundFlows]
  );

  const handleBoardClick = (code: string, type: 'industry' | 'concept') => {
    navigate(`/boards/${type}/${code}`);
  };

  const handleBoardSort = (type: 'industry' | 'concept', key: BoardSortKey) => {
    setBoardSorts((current) => ({
      ...current,
      [type]: current[type]?.key === key
        ? { key, direction: current[type].direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'rank' || key === 'name' || key === 'leadingStock' ? 'asc' : 'desc' },
    }));
  };

  const handleFundFlowClick = (
    code: string,
    type: 'industry' | 'concept' | 'stock'
  ) => {
    navigate(type === 'stock' ? `/s/${code}` : `/boards/${type}/${code}`);
  };

  if (loading) {
    return <Loading fullScreen text="加载榜单数据..." />;
  }

  return (
    <div className={styles.rankings}>
      <div className={styles.controls}>
        <Tabs
          items={RANKING_TYPES}
          activeKey={rankType}
          onChange={(key) => setRankType(key as SortKey)}
        />
      </div>

      <div className={styles.content}>
        {sections.map((section) => (
          <Card key={section.type} title={section.title} padding="sm">
            <div className={styles.rankTable}>
              <div className={styles.tableHeader} role="row">
                {([
                  ['rank', '排名', styles.colRank],
                  ['name', '名称', styles.colName],
                  ['changePercent', '涨跌幅', styles.colChange],
                  ['leadingStock', '领涨股', styles.colLeader],
                  ['stats', '涨/跌', styles.colStats],
                  ['turnoverRate', '换手', styles.colTurnover],
                ] as const).map(([key, label, className]) => {
                  const active = boardSorts[section.type]?.key === key;
                  const direction = active ? boardSorts[section.type]?.direction : null;
                  return (
                    <span
                      key={key}
                      className={className}
                      role="columnheader"
                      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        className={styles.sortHeader}
                        onClick={() => handleBoardSort(section.type, key)}
                        aria-label={`${label}，${active ? (direction === 'asc' ? '升序' : '降序') : '未排序'}，点击切换排序`}
                      >
                        {label}
                        {active ? (
                          direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                        ) : (
                          <ArrowUpDown size={12} />
                        )}
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className={styles.tableBody}>
                {section.list.map(({ item, rank }, index) => (
                  <motion.div
                    key={item.code}
                    className={styles.tableRow}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => handleBoardClick(item.code, section.type)}
                  >
                    <span className={styles.colRank}>
                      <span className={`${styles.rankNum} ${rank <= 3 ? styles.top3 : ''}`}>
                        {rank}
                      </span>
                    </span>
                    <span className={styles.colName}>{item.name}</span>
                    <span className={`${styles.colChange} ${getChangeColorClass(item.changePercent)}`}>
                      {formatPercent(item.changePercent)}
                    </span>
                    <div className={styles.colLeader}>
                      <span className={styles.leaderName}>{item.leadingStock}</span>
                      <span className={getChangeColorClass(item.leadingStockChangePercent)}>
                        {formatPercent(item.leadingStockChangePercent)}
                      </span>
                    </div>
                    <span className={styles.colStats}>
                      <span className="text-rise">{item.riseCount}</span>
                      <span>/</span>
                      <span className="text-fall">{item.fallCount}</span>
                    </span>
                    <span className={styles.colTurnover}>
                      {formatTurnover(item.turnoverRate)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className={styles.flowSections}>
        {fundFlowSections.map((section) => (
          <Card key={section.type} title={section.title} padding="sm">
            <div className={styles.flowColumns}>
              {[
                { key: 'inflow', title: '净流入最多', items: section.inflows },
                { key: 'outflow', title: '净流出最多', items: section.outflows },
              ].map((column) => (
                <div key={column.key} className={styles.flowColumn}>
                  <div className={styles.flowHeader}>{column.title}</div>
                  {column.items.length === 0 && fundFlowLoading ? (
                    <Loading size="md" />
                  ) : column.items.length === 0 ? (
                    <div className={styles.flowEmpty}>暂无数据</div>
                  ) : (
                    <div className={styles.flowList}>
                      {column.items.map((item, index) => (
                        <button
                          key={item.code}
                          type="button"
                          className={styles.flowRow}
                          onClick={() => handleFundFlowClick(item.code, section.type)}
                        >
                          <span className={`${styles.rankNum} ${index < 3 ? styles.top3 : ''}`}>
                            {index + 1}
                          </span>
                          <span className={styles.flowName}>
                            <span>{item.name}</span>
                            <span>{item.code}</span>
                          </span>
                          <span className={styles.flowValue}>
                            <span className={getChangeColorClass(item.mainNetInflow)}>
                              {formatYuanAmount(item.mainNetInflow)}
                            </span>
                            <span className={getChangeColorClass(item.mainNetInflowPercent)}>
                              {formatPercent(item.mainNetInflowPercent)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
