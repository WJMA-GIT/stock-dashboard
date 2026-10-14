import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import {
  FUND_FLOW_PAGE_SIZE as PAGE_SIZE,
  getFundFlowRanking,
  readFundFlowRanking,
  type FundFlowRankingSnapshot,
  type FundFlowRankingType,
} from '@/services/fundFlowRankings';
import { formatPercent, formatYuanAmount, getChangeColorClass } from '@/utils/format';
import { FundFlowStatus } from './FundFlowStatus';
import styles from './Rankings.module.css';

const FLOW_TYPES = [
  { key: 'industry', label: '行业' },
  { key: 'concept', label: '概念' },
  { key: 'stock', label: '个股' },
];

export function FundFlowPagination() {
  const [query, setQuery] = useState<{ type: FundFlowRankingType; page: number }>({ type: 'industry', page: 1 });
  return (
    <Card title="资金流排名" padding="sm">
      <Tabs
        items={FLOW_TYPES}
        activeKey={query.type}
        onChange={(type) => setQuery({ type: type as FundFlowRankingType, page: 1 })}
        size="sm"
      />
      <FundFlowPage
        key={`${query.type}-${query.page}`}
        {...query}
        onPageChange={(page) => setQuery({ ...query, page })}
      />
    </Card>
  );
}

function FundFlowPage({ type, page, onPageChange }: {
  type: FundFlowRankingType;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [snapshot, setSnapshot] = useState<FundFlowRankingSnapshot | null>(() => readFundFlowRanking(type, page));
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef({ value: 0 });
  useEffect(() => {
    const request = requestId.current;
    return () => { request.value++; };
  }, []);

  const fetchPage = useCallback(async (force = false) => {
    const id = ++requestId.current.value;
    setIsLoading(true);
    try {
      const data = await getFundFlowRanking(type, page, 'inflow', force);
      if (id !== requestId.current.value) return;
      setSnapshot(data);
      setError('');
    } catch (cause) {
      if (id !== requestId.current.value) return;
      setError(cause instanceof Error ? cause.message : '资金流排名加载失败');
    } finally {
      if (id === requestId.current.value) setIsLoading(false);
    }
  }, [page, type]);

  usePolling(fetchPage, {
    interval: Math.max(getRefreshInterval('list'), 30000),
    pauseOnHidden: true,
  });

  return (
    <>
      <div className={styles.flowHeader}>主力净流入降序 · 每页 {PAGE_SIZE} 条</div>
      <FundFlowStatus snapshot={snapshot} error={!!error} />
      {!snapshot && error ? (
        <Empty title="加载失败" description={error} action={
          <Button size="sm" loading={isLoading} onClick={() => void fetchPage(true)}>重试</Button>
        } />
      ) : snapshot === null ? (
        <Loading text="加载资金流排名..." />
      ) : snapshot.rows.length === 0 ? (
        <Empty title="本页暂无数据" />
      ) : (
        <div className={styles.flowList}>
          {snapshot.rows.map((item, index) => {
            const rank = (page - 1) * PAGE_SIZE + index + 1;
            return (
              <button
                key={item.code}
                type="button"
                className={styles.flowRow}
                onClick={() => navigate(type === 'stock' ? `/s/${item.code}` : `/boards/${type}/${item.code}`)}
              >
                <span className={`${styles.rankNum} ${rank <= 3 ? styles.top3 : ''}`}>{rank}</span>
                <span className={styles.flowName}><span>{item.name}</span><span>{item.code}</span></span>
                <span className={styles.flowValue}>
                  <span className={getChangeColorClass(item.mainNetInflow)}>{formatYuanAmount(item.mainNetInflow)}</span>
                  <span className={getChangeColorClass(item.mainNetInflowPercent)}>{formatPercent(item.mainNetInflowPercent)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className={styles.pagination}>
        <Button size="sm" disabled={page <= 1 || isLoading} onClick={() => onPageChange(page - 1)}>上一页</Button>
        <span aria-live="polite">第 {page} 页</span>
        <Button size="sm" disabled={isLoading || !snapshot || page * PAGE_SIZE >= snapshot.total} onClick={() => onPageChange(page + 1)}>下一页</Button>
        <Button size="sm" loading={isLoading} onClick={() => void fetchPage(true)}>刷新</Button>
      </div>
    </>
  );
}
