import { useCallback, useMemo, useState } from 'react';
import { ChartCandlestick, RefreshCw } from 'lucide-react';
import { Button, Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getGlobalFuturesSpot } from '@/services/sdk';
import { formatCompactNumber, formatPercent, formatPrice, getChangeColorClass } from '@/utils/format';
import { sortRows, type SortDirection } from '@/utils/tableSort';
import { filterFutures, type FuturesCategory } from './futuresFilter';
import styles from './Futures.module.css';

type Rows = Awaited<ReturnType<typeof getGlobalFuturesSpot>>;
type SortKey = 'name' | 'price' | 'changePercent' | 'volume' | 'openInterest' | 'flow';

const CATEGORY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'index', label: '股指' },
  { key: 'energy', label: '能源' },
  { key: 'metals', label: '金属' },
  { key: 'agriculture', label: '农产品' },
];

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'name', label: '品种' },
  { key: 'price', label: '最新价' },
  { key: 'changePercent', label: '涨跌幅' },
  { key: 'volume', label: '成交量' },
  { key: 'openInterest', label: '持仓量' },
  { key: 'flow', label: '多空成交' },
];

const SORT_VALUE: Record<SortKey, (row: Rows[number]) => string | number | null | undefined> = {
  name: (row) => row.name,
  price: (row) => row.price,
  changePercent: (row) => row.changePercent,
  volume: (row) => row.volume,
  openInterest: (row) => row.openInterest,
  flow: (row) => (row.buyVolume ?? 0) - (row.sellVolume ?? 0),
};

export function Futures() {
  const { getRefreshInterval } = useAppSettings();
  const [rows, setRows] = useState<Rows>([]);
  const [category, setCategory] = useState<FuturesCategory>('all');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'volume', direction: 'desc' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      setRows(await getGlobalFuturesSpot());
    } catch (fetchError) {
      console.error('Futures fetch error:', fetchError);
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  const { isLoading, refresh, lastRefresh } = usePolling(fetchData, {
    interval: Math.max(getRefreshInterval('list'), 30000),
  });

  const visibleRows = useMemo(
    () => sortRows(filterFutures(rows, category), SORT_VALUE[sort.key], sort.direction),
    [category, rows, sort]
  );
  const ranked = [...visibleRows].filter((item) => item.changePercent !== null);
  const top = ranked.reduce<Rows[number] | null>((best, item) => !best || (item.changePercent ?? 0) > (best.changePercent ?? 0) ? item : best, null);
  const bottom = ranked.reduce<Rows[number] | null>((best, item) => !best || (item.changePercent ?? 0) < (best.changePercent ?? 0) ? item : best, null);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}><ChartCandlestick size={24} />期货</h1>
          <p className={styles.subtitle}>全球连续合约价格、成交热度与多空方向</p>
        </div>
        <Button size="sm" icon={<RefreshCw size={15} />} loading={isLoading} onClick={refresh}>刷新</Button>
      </header>

      {!loaded ? <Loading fullScreen text="加载期货行情..." /> : error && rows.length === 0 ? (
        <Card><Empty title="期货行情加载失败" description="数据源暂时不可用" action={<Button size="sm" onClick={refresh}>重新加载</Button>} /></Card>
      ) : (
        <>
          <section className={styles.summaryGrid}>
            <Card title="连续合约"><strong className={styles.summaryValue}>{filterFutures(rows, 'all').length}</strong><span className={styles.helper}>个品种</span></Card>
            <Card title="领涨品种"><strong className={`${styles.summaryValue} ${getChangeColorClass(top?.changePercent)}`}>{top?.name ?? '--'}</strong><span className={getChangeColorClass(top?.changePercent)}>{formatPercent(top?.changePercent)}</span></Card>
            <Card title="领跌品种"><strong className={`${styles.summaryValue} ${getChangeColorClass(bottom?.changePercent)}`}>{bottom?.name ?? '--'}</strong><span className={getChangeColorClass(bottom?.changePercent)}>{formatPercent(bottom?.changePercent)}</span></Card>
          </section>

          <Card padding="none">
            <div className={styles.toolbar}>
              <Tabs items={CATEGORY_TABS} activeKey={category} onChange={(key) => setCategory(key as FuturesCategory)} />
              <span>{lastRefresh ? `更新于 ${new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待更新'}</span>
            </div>
            {visibleRows.length === 0 ? <Empty title="暂无该类期货行情" /> : (
              <div className={styles.tableWrap}>
                <div className={styles.tableHeader}>
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
                {visibleRows.map((item) => {
                  const buy = item.buyVolume ?? 0;
                  const sell = item.sellVolume ?? 0;
                  const total = buy + sell;
                  const buyRatio = total > 0 ? buy / total * 100 : 50;
                  return (
                    <div className={styles.row} key={item.code}>
                      <span className={styles.name}><strong>{item.name}</strong><small>{item.code}</small></span>
                      <span>{formatPrice(item.price)}</span>
                      <span className={getChangeColorClass(item.changePercent)}>{formatPercent(item.changePercent)}</span>
                      <span>{formatCompactNumber(item.volume)}</span>
                      <span>{formatCompactNumber(item.openInterest)}</span>
                      <span className={styles.flow} title={`买 ${formatCompactNumber(buy)} / 卖 ${formatCompactNumber(sell)}`}><i style={{ width: `${buyRatio}%` }} /><b /></span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
