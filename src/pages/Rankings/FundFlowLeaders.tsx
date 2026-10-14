import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import {
  getFundFlowRanking,
  readFundFlowRanking,
  type FundFlowRankingSnapshot,
  type FundFlowRankingType,
} from '@/services/fundFlowRankings';
import type { groupWatchlistQuotesByBoard } from '@/services/stockBoardMembership';
import { formatPercent, formatYuanAmount, getChangeColorClass } from '@/utils/format';
import { FundFlowStatus } from './FundFlowStatus';
import styles from './Rankings.module.css';

type WatchlistByBoard = ReturnType<typeof groupWatchlistQuotesByBoard>;
type Direction = 'inflow' | 'outflow';
interface ColumnState {
  snapshot: FundFlowRankingSnapshot | null;
  error: string;
  loading: boolean;
}
const DIRECTIONS: Direction[] = ['inflow', 'outflow'];
const SECTIONS: { type: FundFlowRankingType; title: string }[] = [
  { type: 'industry', title: '行业板块资金流' },
  { type: 'concept', title: '概念板块资金流' },
  { type: 'stock', title: '个股主力资金流' },
];

export function FundFlowLeaders({ watchlistByBoard }: { watchlistByBoard: WatchlistByBoard }) {
  return (
    <div className={styles.flowSections}>
      {SECTIONS.map((section) => (
        <FundFlowLeaderCard key={section.type} {...section} watchlistByBoard={watchlistByBoard} />
      ))}
    </div>
  );
}

function FundFlowLeaderCard({ type, title, watchlistByBoard }: {
  type: FundFlowRankingType;
  title: string;
  watchlistByBoard: WatchlistByBoard;
}) {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [columns, setColumns] = useState<Record<Direction, ColumnState>>(() => ({
    inflow: { snapshot: readFundFlowRanking(type, 1, 'inflow'), error: '', loading: false },
    outflow: { snapshot: readFundFlowRanking(type, 1, 'outflow'), error: '', loading: false },
  }));
  const requests = useRef({ inflow: 0, outflow: 0 });
  useEffect(() => () => {
    requests.current.inflow++;
    requests.current.outflow++;
  }, []);

  const fetchColumn = useCallback(async (direction: Direction, force = false) => {
    const id = ++requests.current[direction];
    setColumns((current) => ({ ...current, [direction]: { ...current[direction], loading: true } }));
    try {
      const snapshot = await getFundFlowRanking(type, 1, direction, force);
      if (id !== requests.current[direction]) return;
      setColumns((current) => ({ ...current, [direction]: { snapshot, error: '', loading: false } }));
    } catch (cause) {
      if (id !== requests.current[direction]) return;
      const error = cause instanceof Error ? cause.message : '资金流加载失败';
      setColumns((current) => ({ ...current, [direction]: { ...current[direction], error, loading: false } }));
    }
  }, [type]);

  const fetchColumns = useCallback(async () => {
    await Promise.allSettled(DIRECTIONS.map((direction) => fetchColumn(direction)));
  }, [fetchColumn]);
  usePolling(fetchColumns, {
    interval: Math.max(getRefreshInterval('list'), 30000),
    pauseOnHidden: true,
  });

  return (
    <Card title={title} padding="sm">
      <div className={styles.flowColumns}>
        {DIRECTIONS.map((direction) => {
          const { snapshot, error, loading } = columns[direction];
          const items = snapshot?.rows.filter((item) => direction === 'inflow' ? item.mainNetInflow > 0 : item.mainNetInflow < 0) ?? [];
          return (
            <div key={direction} className={styles.flowColumn}>
              <div className={styles.flowColumnHeader}>
                <span>{direction === 'inflow' ? '净流入最多' : '净流出最多'} · 前 50 名</span>
                <Button size="sm" loading={loading} onClick={() => void fetchColumn(direction, true)}>
                  {error ? '重试' : '刷新'}
                </Button>
              </div>
              <FundFlowStatus snapshot={snapshot} error={!!error} />
              {!snapshot ? (
                error ? <Empty title="资金流加载失败" description={error} /> : <Loading size="md" text="加载资金流..." />
              ) : items.length === 0 ? (
                <Empty title={direction === 'inflow' ? '本次排名无净流入记录' : '本次排名无净流出记录'} />
              ) : (
                <div className={styles.flowList}>
                  {items.map((item, index) => (
                    <button
                      key={item.code}
                      type="button"
                      className={`${styles.flowRow} ${type === 'stock' ? '' : styles.flowBoardRow}`}
                      onClick={() => navigate(type === 'stock' ? `/s/${item.code}` : `/boards/${type}/${item.code}`)}
                    >
                      <span className={`${styles.rankNum} ${index < 3 ? styles.top3 : ''}`}>{index + 1}</span>
                      <span className={styles.flowName}><span>{item.name}</span><span>{item.code}</span></span>
                      {type !== 'stock' && (
                        <span className={styles.flowWatchlist}>
                          {watchlistByBoard[item.code]?.map((stock) => (
                            <span key={stock.code} className={`${styles.watchlistStock} ${getChangeColorClass(stock.changePercent)}`}>
                              {stock.name} {formatPercent(stock.changePercent)}
                            </span>
                          ))}
                        </span>
                      )}
                      <span className={styles.flowValue}>
                        <span className={getChangeColorClass(item.mainNetInflow)}>{formatYuanAmount(item.mainNetInflow)}</span>
                        <span className={getChangeColorClass(item.mainNetInflowPercent)}>{formatPercent(item.mainNetInflowPercent)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
