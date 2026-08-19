import { useCallback, useMemo, useState } from 'react';
import { ChartCandlestick, RefreshCw } from 'lucide-react';
import { Button, Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getGlobalFuturesSpot } from '@/services/sdk';
import { formatCompactNumber, formatPercent, formatPrice, getChangeColorClass } from '@/utils/format';
import { filterFutures, type FuturesCategory } from './futuresFilter';
import styles from './Futures.module.css';

type Rows = Awaited<ReturnType<typeof getGlobalFuturesSpot>>;

const CATEGORY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'index', label: '股指' },
  { key: 'energy', label: '能源' },
  { key: 'metals', label: '金属' },
  { key: 'agriculture', label: '农产品' },
];

export function Futures() {
  const { getRefreshInterval } = useAppSettings();
  const [rows, setRows] = useState<Rows>([]);
  const [category, setCategory] = useState<FuturesCategory>('all');
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
    () => filterFutures(rows, category).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)),
    [category, rows]
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
                <div className={styles.tableHeader}><span>品种</span><span>最新价</span><span>涨跌幅</span><span>成交量</span><span>持仓量</span><span>多空成交</span></div>
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
