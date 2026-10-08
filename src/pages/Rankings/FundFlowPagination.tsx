import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getFundFlowRank, getSectorFundFlowRank } from '@/services/sdk';
import { formatPercent, formatYuanAmount, getChangeColorClass } from '@/utils/format';
import type { FundFlowRankItem, SectorFundFlowItem } from 'stock-sdk';
import styles from './Rankings.module.css';

type FlowType = 'industry' | 'concept' | 'stock';
const PAGE_SIZE = 50;
const FLOW_TYPES = [
  { key: 'industry', label: '行业' },
  { key: 'concept', label: '概念' },
  { key: 'stock', label: '个股' },
];

export function FundFlowPagination() {
  const [query, setQuery] = useState<{ type: FlowType; page: number }>({ type: 'industry', page: 1 });
  return (
    <Card title="资金流排名" padding="sm">
      <Tabs
        items={FLOW_TYPES}
        activeKey={query.type}
        onChange={(type) => setQuery({ type: type as FlowType, page: 1 })}
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
  type: FlowType;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [rows, setRows] = useState<(FundFlowRankItem | SectorFundFlowItem)[] | null>(null);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchPage = useCallback(async () => {
    try {
      const options = { indicator: 'today' as const, page, pageSize: PAGE_SIZE };
      const data = type === 'stock'
        ? await getFundFlowRank(options)
        : await getSectorFundFlowRank({ ...options, sectorType: type });
      if (!mounted.current) return;
      setRows(data);
      setError('');
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : '资金流排名加载失败');
    }
  }, [page, type]);

  const { isLoading, refresh } = usePolling(fetchPage, {
    interval: Math.max(getRefreshInterval('list') * 4, 60000),
    pauseOnHidden: true,
  });

  return (
    <>
      <div className={styles.flowHeader}>今日主力净流入降序 · 每页 {PAGE_SIZE} 条</div>
      {error ? (
        <Empty title="加载失败" description={error} action={
          <Button size="sm" loading={isLoading} onClick={() => void refresh()}>重试</Button>
        } />
      ) : rows === null ? (
        <Loading text="加载资金流排名..." />
      ) : rows.length === 0 ? (
        <Empty title="本页暂无数据" />
      ) : (
        <div className={styles.flowList}>
          {rows.map((item, index) => {
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
        {/* ponytail: SDK 未返回总数，满页才允许继续；提供 total 后再显示总页数。 */}
        <Button size="sm" disabled={isLoading || !!error || rows?.length !== PAGE_SIZE} onClick={() => onPageChange(page + 1)}>下一页</Button>
        <Button size="sm" loading={isLoading} onClick={() => void refresh()}>刷新</Button>
      </div>
    </>
  );
}
