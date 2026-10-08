import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Clock3, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getStockChanges } from '@/services/sdk';
import { normalizeStockCode } from '@/utils/format';
import { sortRows, type SortDirection } from '@/utils/tableSort';
import {
  CHANGE_GROUPS,
  filterChangeRows,
  formatChangeInfo,
  type ChangeDirection,
  type StockChangeKey,
} from './marketChangeConfig';
import styles from './MarketChanges.module.css';

type Rows = Awaited<ReturnType<typeof getStockChanges>>;
type SortKey = 'time' | 'stock' | 'changeType' | 'info';
const PAGE_SIZE = 100;

const DIRECTION_TABS = [
  { key: 'up', label: '上涨异动', icon: <TrendingUp size={15} /> },
  { key: 'down', label: '下跌异动', icon: <TrendingDown size={15} /> },
];

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'time', label: '时间' },
  { key: 'stock', label: '股票' },
  { key: 'changeType', label: '异动类型' },
  { key: 'info', label: '相关信息' },
];

const SORT_VALUE: Record<SortKey, (row: Rows[number]) => string | number | null | undefined> = {
  time: (row) => row.time,
  stock: (row) => `${row.name}${row.code}`,
  changeType: (row) => row.changeTypeLabel,
  info: (row) => formatChangeInfo(row),
};

export function MarketChanges() {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [direction, setDirection] = useState<ChangeDirection>('up');
  const [changeType, setChangeType] = useState<StockChangeKey>('rocket_launch');
  const [rows, setRows] = useState<Rows>([]);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'time', direction: 'desc' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const requestId = useRef(0);

  const fetchData = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(false);
    try {
      const nextRows = await getStockChanges(changeType, { page, pageSize: PAGE_SIZE });
      if (id !== requestId.current) return;
      setRows(nextRows);
      setLastRefresh(Date.now());
    } catch (fetchError) {
      if (id !== requestId.current) return;
      console.error('Market changes fetch error:', fetchError);
      setError(true);
    } finally {
      if (id === requestId.current) {
        setLoaded(true);
        setIsLoading(false);
      }
    }
  }, [changeType, page]);

  const { refresh } = usePolling(fetchData, {
    interval: Math.max(getRefreshInterval('list'), 15000),
    immediate: false,
  });

  useEffect(() => {
    setLoaded(false);
    setRows([]);
    setLastRefresh(null);
    void refresh();
    return () => { requestId.current += 1; };
  }, [changeType, page, refresh]);

  const visibleRows = useMemo(
    () => sortRows(filterChangeRows(rows, keyword), SORT_VALUE[sort.key], sort.direction),
    [keyword, rows, sort]
  );
  const uniqueStocks = useMemo(() => new Set(rows.map((item) => item.code)).size, [rows]);
  const types = CHANGE_GROUPS[direction];

  const switchDirection = (key: string) => {
    const nextDirection = key as ChangeDirection;
    setDirection(nextDirection);
    setChangeType(CHANGE_GROUPS[nextDirection][0].key);
    setPage(1);
    setKeyword('');
  };

  const selectType = (key: StockChangeKey) => {
    setChangeType(key);
    setPage(1);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}><Activity size={24} />异动</h1>
          <p className={styles.subtitle}>追踪盘口突发信号，快速定位上涨与下跌方向的活跃个股</p>
        </div>
        <Button size="sm" icon={<RefreshCw size={15} />} loading={isLoading} onClick={refresh}>
          刷新
        </Button>
      </header>

      <section className={styles.summaryGrid}>
        <Card title="本页异动"><strong className={styles.summaryValue}>{rows.length}</strong><span className={styles.summaryUnit}>条</span></Card>
        <Card title="本页涉及个股"><strong className={styles.summaryValue}>{uniqueStocks}</strong><span className={styles.summaryUnit}>只</span></Card>
        <Card title="本页最新信号"><strong className={styles.summaryValue}>{rows[0]?.time ?? '--'}</strong><span className={styles.summaryUnit}><Clock3 size={12} />盘中实时</span></Card>
      </section>

      <Card padding="none">
        <div className={styles.toolbar}>
          <Tabs items={DIRECTION_TABS} activeKey={direction} onChange={switchDirection} />
          <label className={styles.searchField}>
            <Search size={15} />
            <input
              aria-label="搜索本页异动股票"
              value={keyword}
              placeholder="搜索本页股票、代码或信息"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.typeFilters}>
          {types.map((item) => (
            <button
              key={item.key}
              className={`${styles.typeButton} ${changeType === item.key ? styles.active : ''}`}
              onClick={() => selectType(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!loaded ? (
          <Loading text="加载盘口异动..." />
        ) : error ? (
          <Empty title="异动数据加载失败" description="行情接口暂时不可用" action={<Button size="sm" onClick={refresh}>重新加载</Button>} />
        ) : visibleRows.length === 0 ? (
          <Empty
            icon={<Activity size={44} strokeWidth={1} />}
            title={keyword ? '本页未找到匹配异动' : '本页暂无异动数据'}
            description={keyword ? '请调整搜索关键词或切换页码' : page > 1 ? '已到数据末尾，可返回上一页' : '当前时段尚未触发该类盘口信号'}
          />
        ) : (
          <div className={styles.stream}>
            <div className={styles.streamHeader}>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <span key={column.key} role="columnheader" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      className={styles.sortButton}
                      aria-label={`${column.label}，${active ? `当前${sort.direction === 'asc' ? '升序' : '降序'}` : '未排序'}，点击排序`}
                      onClick={() => setSort((current) => ({
                        key: column.key,
                        direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc',
                      }))}
                    >
                      {column.label}<i aria-hidden="true">{active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</i>
                    </button>
                  </span>
                );
              })}
            </div>
            {visibleRows.map((item, index) => (
              <button
                key={`${item.time}-${item.code}-${index}`}
                className={styles.changeRow}
                onClick={() => navigate(`/s/${normalizeStockCode(item.code)}`)}
              >
                <time>{item.time}</time>
                <span className={styles.stock}><strong>{item.name}</strong><small>{item.code}</small></span>
                <span className={`${styles.changeTag} ${styles[direction]}`}>{item.changeTypeLabel || '其他异动'}</span>
                <span className={styles.info} title={item.info}>{formatChangeInfo(item)}</span>
              </button>
            ))}
          </div>
        )}
        <footer className={styles.footer}>
          <span>本页显示 {visibleRows.length} / {rows.length} 条 · 排序仅作用于本页</span>
          <div className={styles.pagination}>
            <Button size="sm" disabled={page === 1 || isLoading} onClick={() => setPage((current) => current - 1)}>上一页</Button>
            <span>第 {page} 页 · 每页 {PAGE_SIZE} 条</span>
            {/* ponytail: SDK 未返回总数，满页允许探查下一页；有 total 后改用总数判断。 */}
            <Button size="sm" disabled={!loaded || isLoading || error || rows.length < PAGE_SIZE} onClick={() => setPage((current) => current + 1)}>下一页</Button>
          </div>
          <span>{lastRefresh ? `更新于 ${new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待更新'}</span>
        </footer>
      </Card>
    </div>
  );
}
