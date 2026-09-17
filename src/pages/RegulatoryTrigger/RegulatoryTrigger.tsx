import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getUnusualFluctuation } from '@/services/sdk';
import { formatPercent, getChangeColorClass, normalizeStockCode } from '@/utils/format';
import { sortRows, type SortDirection } from '@/utils/tableSort';
import styles from './RegulatoryTrigger.module.css';

type Rows = Awaited<ReturnType<typeof getUnusualFluctuation>>;
type StatusFilter = 'all' | 'triggered' | 'approaching';
type DirectionFilter = 'all' | 'up' | 'down';
type SortKey = 'status' | 'stock' | 'changePercent' | 'deviation' | 'target' | 'window' | 'rule';

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'triggered', label: '已触发' },
  { key: 'approaching', label: '逼近阈值' },
];

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'status', label: '监管状态' },
  { key: 'stock', label: '股票' },
  { key: 'changePercent', label: '涨跌幅' },
  { key: 'deviation', label: '累计偏离' },
  { key: 'target', label: '目标阈值' },
  { key: 'window', label: '统计区间' },
  { key: 'rule', label: '规则原文' },
];

const SORT_VALUE: Record<SortKey, (row: Rows[number]) => string | number | null | undefined> = {
  status: (row) => Number(row.triggered),
  stock: (row) => `${row.name}${row.code}`,
  changePercent: (row) => row.changePercent,
  deviation: (row) => row.deviationValue,
  target: (row) => row.targetChangePercent,
  window: (row) => row.windowDays,
  rule: (row) => row.rule,
};

function shanghaiDate(date: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date);
}

export function RegulatoryTrigger() {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [rows, setRows] = useState<Rows>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'deviation', direction: 'desc' });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const result = selectedDate
        ? await getUnusualFluctuation({ date: selectedDate })
        : await getUnusualFluctuation({
            startDate: shanghaiDate(new Date(Date.now() - 29 * 86400000)),
            endDate: shanghaiDate(new Date()),
          });
      const latestDate = result.reduce((latest, item) => item.date > latest ? item.date : latest, '');
      setRows(selectedDate || !latestDate ? result : result.filter((item) => item.date === latestDate));
      if (!selectedDate) setSelectedDate(latestDate || shanghaiDate(new Date()));
    } catch (fetchError) {
      console.error('Regulatory trigger fetch error:', fetchError);
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [selectedDate]);

  const { isLoading, refresh, lastRefresh } = usePolling(fetchData, {
    interval: Math.max(getRefreshInterval('list'), 5 * 60 * 1000),
    immediate: false,
  });

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [selectedDate, refresh]);

  const visibleRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const filtered = rows.filter((item) => {
      if (status === 'triggered' && !item.triggered) return false;
      if (status === 'approaching' && item.triggered) return false;
      if (direction !== 'all' && item.direction !== direction) return false;
      return !normalizedKeyword || `${item.name}${item.code}${item.rule}`.toLowerCase().includes(normalizedKeyword);
    });
    return sortRows(filtered, SORT_VALUE[sort.key], sort.direction);
  }, [direction, keyword, rows, sort, status]);

  const triggeredCount = useMemo(() => rows.filter((item) => item.triggered).length, [rows]);
  const approachingCount = rows.length - triggeredCount;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}><ShieldAlert size={24} />触发监管</h1>
          <p className={styles.subtitle}>查看交易异常波动预警，区分已触发与逼近阈值的股票</p>
        </div>
        <Button size="sm" icon={<RefreshCw size={15} />} loading={isLoading} onClick={refresh}>
          刷新
        </Button>
      </header>

      <section className={styles.summaryGrid}>
        <Card title="当日预警"><strong className={styles.summaryValue}>{rows.length}</strong><span className={styles.summaryUnit}>只股票</span></Card>
        <Card title="已触发"><strong className={`${styles.summaryValue} ${styles.triggeredText}`}>{triggeredCount}</strong><span className={styles.summaryUnit}>达到监管规则阈值</span></Card>
        <Card title="逼近阈值"><strong className={`${styles.summaryValue} ${styles.approachingText}`}>{approachingCount}</strong><span className={styles.summaryUnit}>尚未触发，需持续关注</span></Card>
      </section>

      <Card padding="none">
        <div className={styles.toolbar}>
          <Tabs items={STATUS_TABS} activeKey={status} onChange={(key) => setStatus(key as StatusFilter)} />
          <div className={styles.controls}>
            <div className={styles.directionFilters} aria-label="异动方向筛选">
              {(['all', 'up', 'down'] as const).map((key) => (
                <button
                  key={key}
                  className={`${styles.filterButton} ${direction === key ? styles.active : ''}`}
                  onClick={() => setDirection(key)}
                >
                  {key === 'all' ? '全部方向' : key === 'up' ? '上涨' : '下跌'}
                </button>
              ))}
            </div>
            <input
              className={styles.dateInput}
              type="date"
              aria-label="选择监管异动日期"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
            <label className={styles.searchField}>
              <Search size={15} />
              <input
                aria-label="搜索监管异动股票"
                value={keyword}
                placeholder="搜索股票、代码或规则"
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
          </div>
        </div>

        {!loaded && isLoading ? (
          <Loading text="加载监管异动..." />
        ) : error ? (
          <Empty title="监管异动数据加载失败" description="数据接口暂时不可用" action={<Button size="sm" onClick={refresh}>重新加载</Button>} />
        ) : visibleRows.length === 0 ? (
          <Empty
            icon={<ShieldAlert size={44} strokeWidth={1} />}
            title={keyword ? '未找到匹配股票' : '暂无监管异动数据'}
            description={keyword ? '请调整搜索关键词或筛选条件' : '该交易日没有符合当前条件的股票'}
          />
        ) : (
          <div className={styles.tableWrap}>
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
              {visibleRows.map((item) => (
                <button
                  key={`${item.date}-${item.code}-${item.rule}`}
                  className={styles.dataRow}
                  onClick={() => navigate(`/s/${normalizeStockCode(item.code)}`)}
                >
                  <span className={`${styles.statusTag} ${item.triggered ? styles.triggered : styles.approaching}`}>
                    {item.triggered ? '已触发' : '逼近阈值'}
                  </span>
                  <span className={styles.stock}><strong>{item.name}</strong><small>{item.code}</small></span>
                  <span className={getChangeColorClass(item.changePercent)}>{formatPercent(item.changePercent)}</span>
                  <strong className={getChangeColorClass(item.deviationValue)}>{formatPercent(item.deviationValue)}</strong>
                  <span className={getChangeColorClass(item.targetChangePercent)}>{formatPercent(item.targetChangePercent)}</span>
                  <span>{item.windowDays == null ? '--' : `${item.windowDays}日`}</span>
                  <span className={styles.rule} title={item.rule}>{item.rule}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <footer className={styles.footer}>
          <span>{selectedDate || '--'} · 显示 {visibleRows.length} / {rows.length} 条</span>
          <span>{lastRefresh ? `更新于 ${new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour12: false })}` : '等待更新'}</span>
        </footer>
      </Card>
    </div>
  );
}
