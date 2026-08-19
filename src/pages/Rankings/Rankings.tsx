/**
 * 榜单页面
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart2, RefreshCw } from 'lucide-react';
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

  const sections = useMemo(
    () => [
      { title: '行业板块', type: 'industry' as const, list: sortBoards(industryList, rankType) },
      { title: '概念板块', type: 'concept' as const, list: sortBoards(conceptList, rankType) },
    ],
    [industryList, conceptList, rankType]
  );

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
              <div className={styles.tableHeader}>
                <span className={styles.colRank}>排名</span>
                <span className={styles.colName}>名称</span>
                <span className={styles.colChange}>涨跌幅</span>
                <span className={styles.colLeader}>领涨股</span>
                <span className={styles.colStats}>涨/跌</span>
                <span className={styles.colTurnover}>换手</span>
              </div>
              <div className={styles.tableBody}>
                {section.list.map((item, index) => (
                  <motion.div
                    key={item.code}
                    className={styles.tableRow}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    onClick={() => handleBoardClick(item.code, section.type)}
                  >
                    <span className={styles.colRank}>
                      <span className={`${styles.rankNum} ${index < 3 ? styles.top3 : ''}`}>
                        {index + 1}
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
