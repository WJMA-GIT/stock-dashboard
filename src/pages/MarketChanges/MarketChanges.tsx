import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getStockChanges } from '@/services/sdk';
import { normalizeStockCode } from '@/utils/format';
import {
  CHANGE_GROUPS,
  filterChangeRows,
  formatChangeInfo,
  type ChangeDirection,
  type StockChangeKey,
} from './marketChangeConfig';
import styles from './MarketChanges.module.css';

type Rows = Awaited<ReturnType<typeof getStockChanges>>;

const DIRECTION_TABS = [
  { key: 'up', label: '上涨异动', icon: <TrendingUp size={15} /> },
  { key: 'down', label: '下跌异动', icon: <TrendingDown size={15} /> },
];

export function MarketChanges() {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [direction, setDirection] = useState<ChangeDirection>('up');
  const [changeType, setChangeType] = useState<StockChangeKey>('rocket_launch');
  const [rows, setRows] = useState<Rows>([]);
  const [keyword, setKeyword] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      setRows(await getStockChanges(changeType));
    } catch (fetchError) {
      console.error('Market changes fetch error:', fetchError);
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [changeType]);

  const { isLoading, refresh, lastRefresh } = usePolling(fetchData, {
    interval: Math.max(getRefreshInterval('list'), 15000),
    immediate: false,
  });

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [changeType, refresh]);

  const visibleRows = useMemo(
    () => filterChangeRows([...rows].sort((a, b) => b.time.localeCompare(a.time)), keyword),
    [keyword, rows]
  );
  const uniqueStocks = useMemo(() => new Set(rows.map((item) => item.code)).size, [rows]);
  const types = CHANGE_GROUPS[direction];

  const switchDirection = (key: string) => {
    const nextDirection = key as ChangeDirection;
    setDirection(nextDirection);
    setChangeType(CHANGE_GROUPS[nextDirection][0].key);
    setKeyword('');
  };

  const selectType = (key: StockChangeKey) => {
    setChangeType(key);
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
        <Card title="当前异动"><strong className={styles.summaryValue}>{rows.length}</strong><span className={styles.summaryUnit}>条</span></Card>
        <Card title="涉及个股"><strong className={styles.summaryValue}>{uniqueStocks}</strong><span className={styles.summaryUnit}>只</span></Card>
        <Card title="最新信号"><strong className={styles.summaryValue}>{rows[0]?.time ?? '--'}</strong><span className={styles.summaryUnit}><Clock3 size={12} />盘中实时</span></Card>
      </section>

      <Card padding="none">
        <div className={styles.toolbar}>
          <Tabs items={DIRECTION_TABS} activeKey={direction} onChange={switchDirection} />
          <label className={styles.searchField}>
            <Search size={15} />
            <input
              aria-label="搜索异动股票"
              value={keyword}
              placeholder="搜索股票、代码或信息"
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

        {!loaded && isLoading ? (
          <Loading text="加载盘口异动..." />
        ) : error ? (
          <Empty title="异动数据加载失败" description="行情接口暂时不可用" action={<Button size="sm" onClick={refresh}>重新加载</Button>} />
        ) : visibleRows.length === 0 ? (
          <Empty
            icon={<Activity size={44} strokeWidth={1} />}
            title={keyword ? '未找到匹配异动' : '暂无异动数据'}
            description={keyword ? '请调整搜索关键词' : '当前时段尚未触发该类盘口信号'}
          />
        ) : (
          <div className={styles.stream}>
            <div className={styles.streamHeader}><span>时间</span><span>股票</span><span>异动类型</span><span>相关信息</span></div>
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
          <span>显示 {visibleRows.length} / {rows.length} 条</span>
          <span>{lastRefresh ? `更新于 ${new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待更新'}</span>
        </footer>
      </Card>
    </div>
  );
}
