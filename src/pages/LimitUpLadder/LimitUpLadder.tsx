import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Layers3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getZTPool } from '@/services/sdk';
import { formatPrice, formatYuanAmount, normalizeStockCode } from '@/utils/format';
import { groupLimitUpRows } from './ladderGrouping';
import styles from './LimitUpLadder.module.css';

type Rows = Awaited<ReturnType<typeof getZTPool>>;

function shanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function StockCard({ item, onClick }: { item: Rows[number]; onClick: () => void }) {
  return (
    <button className={styles.stockCard} onClick={onClick}>
      <div className={styles.stockTop}>
        <span className={styles.limitTag}>涨停</span>
        <span>首封 {item.firstBoardTime?.slice(0, 5) ?? '--'}</span>
      </div>
      <strong>{item.name}</strong>
      <span className={styles.code}>{item.code}</span>
      <span className={styles.industry}>{item.industry || '其他'}</span>
      <div className={styles.stockMeta}>
        <span>{formatPrice(item.price)}</span>
        <span>封单 {formatYuanAmount(item.boardAmount)}</span>
      </div>
      {(item.failedCount ?? 0) > 0 && <span className={styles.failed}>炸板 {item.failedCount} 次</span>}
    </button>
  );
}

export function LimitUpLadder() {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [date, setDate] = useState(shanghaiDate);
  const [rows, setRows] = useState<Rows>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      setRows(await getZTPool('zt', date.replaceAll('-', '')));
    } catch (fetchError) {
      console.error('Limit-up ladder fetch error:', fetchError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    void fetchData();
  }, [fetchData]);
  usePolling(fetchData, {
    interval: Math.max(getRefreshInterval('list') * 4, 60000),
    immediate: false,
  });

  const { stairs, firstBoards, industries } = useMemo(() => groupLimitUpRows(rows), [rows]);
  const openStock = (code: string) => navigate(`/s/${normalizeStockCode(code)}`);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}><Layers3 size={24} />连板天梯</h1>
          <p className={styles.subtitle}>按连续涨停板数分层，观察市场高度与题材集中度</p>
        </div>
        <label className={styles.dateField}>
          <CalendarDays size={16} />
          <input type="date" value={date} max={shanghaiDate()} onChange={(event) => setDate(event.target.value)} />
        </label>
      </header>

      {loading ? <Loading fullScreen text="加载涨停天梯..." /> : error ? (
        <Card><Empty title="加载失败" description="涨停池暂时不可用" action={<Button size="sm" onClick={fetchData}>重新加载</Button>} /></Card>
      ) : rows.length === 0 ? (
        <Card><Empty title="当日暂无涨停数据" description="请选择其他交易日" /></Card>
      ) : (
        <>
          <section className={styles.industryBar}>
            <span className={styles.industryTitle}>题材分布</span>
            {industries.map(([name, count]) => <span key={name} className={styles.industryChip}>{name} {count}</span>)}
          </section>

          <Card padding="none">
            <div className={styles.ladder}>
              {stairs.map(([boards, items]) => (
                <section className={styles.level} key={boards}>
                  <div className={styles.levelBadge}><strong>{boards}</strong><span>连板</span></div>
                  <div className={styles.stockGrid}>
                    {items.map((item) => <StockCard key={item.code} item={item} onClick={() => openStock(item.code)} />)}
                  </div>
                </section>
              ))}
            </div>
          </Card>

          <section>
            <div className={styles.sectionTitle}><Layers3 size={18} /><h2>首板涨停</h2><span>{firstBoards.length} 只</span></div>
            <div className={styles.firstBoardGrid}>
              {firstBoards.map((item) => <StockCard key={item.code} item={item} onClick={() => openStock(item.code)} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
