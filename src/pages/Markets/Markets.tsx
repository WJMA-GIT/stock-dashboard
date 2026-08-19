import { useCallback, useMemo, useState } from 'react';
import { BarChart3, Globe2, Moon, Sunrise } from 'lucide-react';
import { Card, Empty, Loading, Tabs } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import { getGlobalFuturesSpot, getUSMarketStatus, getUSQuotes } from '@/services/sdk';
import { formatDollarAmount, formatPercent, formatPrice, getChangeColorClass } from '@/utils/format';
import { rankUSQuotes, type USRankingKey } from './usMarketRanking';
import styles from './Markets.module.css';

const US_INDICES = ['DJI', 'INX', 'IXIC'];
const US_SECTORS = [
  ['XLK', '科技'], ['XLF', '金融'], ['XLY', '可选消费'], ['XLC', '通信服务'],
  ['XLI', '工业'], ['XLV', '医疗保健'], ['XLP', '必需消费'], ['XLE', '能源'],
  ['XLU', '公用事业'], ['XLB', '原材料'], ['XLRE', '房地产'],
] as const;
const US_STOCKS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AVGO', 'AMD', 'NFLX',
  'JPM', 'V', 'MA', 'WMT', 'COST', 'LLY', 'XOM', 'ORCL', 'PLTR', 'COIN',
];
const US_ETFS = ['SPY', 'QQQ', 'IWM'];
const FUTURES = [['ES00Y', '标普期指'], ['NQ00Y', '纳指期指'], ['YM00Y', '道指期指']] as const;
const RANKING_TABS = [
  { key: 'rise', label: '涨幅榜' },
  { key: 'fall', label: '跌幅榜' },
  { key: 'amount', label: '成交额' },
];

type Quotes = Awaited<ReturnType<typeof getUSQuotes>>;
type Futures = Awaited<ReturnType<typeof getGlobalFuturesSpot>>;

function quoteCode(code: string) {
  return code.split('.')[0];
}

function QuoteRow({ quote, label }: { quote: Quotes[number]; label?: string }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowName}><span>{label ?? quote.name}</span><small>{quoteCode(quote.code)}</small></div>
      <div className={styles.rowMetric}><span>{formatDollarAmount(quote.amount)}</span><small>成交额</small></div>
      <span className={`${styles.change} ${getChangeColorClass(quote.changePercent)}`}>{formatPercent(quote.changePercent)}</span>
    </div>
  );
}

export function USMarket() {
  const { getRefreshInterval } = useAppSettings();
  const [quotes, setQuotes] = useState<Quotes>([]);
  const [futures, setFutures] = useState<Futures>([]);
  const [rankingKey, setRankingKey] = useState<USRankingKey>('rise');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    const [quoteResult, futureResult] = await Promise.allSettled([
      getUSQuotes([...US_INDICES, ...US_SECTORS.map(([code]) => code), ...US_ETFS, ...US_STOCKS]),
      getGlobalFuturesSpot(),
    ]);
    if (quoteResult.status === 'fulfilled') {
      setQuotes(quoteResult.value);
      setError(false);
    } else {
      console.error('US market quotes error:', quoteResult.reason);
      setError(true);
    }
    if (futureResult.status === 'fulfilled') setFutures(futureResult.value);
    else console.error('US futures error:', futureResult.reason);
    setLoading(false);
  }, []);

  usePolling(fetchData, { interval: Math.max(getRefreshInterval('list'), 30000) });

  const byCode = useMemo(() => new Map(quotes.map((item) => [quoteCode(item.code), item])), [quotes]);
  const sectors = US_SECTORS.flatMap(([code, label]) => {
    const quote = byCode.get(code);
    return quote ? [{ quote, label }] : [];
  }).sort((a, b) => b.quote.changePercent - a.quote.changePercent);
  const focus = [...US_ETFS, ...US_STOCKS].flatMap((code) => {
    const quote = byCode.get(code);
    return quote ? [quote] : [];
  });
  const rankingItems = rankUSQuotes(focus, rankingKey, 10);
  const recapItems = rankUSQuotes(focus, 'amount', 6);
  const futureByCode = new Map(futures.map((item) => [item.code, item]));
  const status = {
    pre_market: '盘前', open: '交易中', lunch_break: '休市', after_hours: '盘后', closed: '已收盘',
  }[getUSMarketStatus()];

  if (loading) return <Loading fullScreen text="加载美股市场..." />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><h1 className={styles.title}><Globe2 size={24} />美股市场</h1><p className={styles.subtitle}>指数走势、行业强弱与美元成交资金热度</p></div>
        <span className={styles.badge}>{status}</span>
      </header>

      {error && quotes.length === 0 ? (
        <Card><Empty title="美股行情暂不可用" description="数据会按刷新频率自动重试" /></Card>
      ) : (
        <>
          <section className={styles.summaryGrid}>
            {US_INDICES.flatMap((code) => {
              const item = byCode.get(code);
              return item ? [<Card key={item.code} title={item.name}><div className={`${styles.bigValue} ${getChangeColorClass(item.changePercent)}`}>{formatPrice(item.price)}</div><div className={styles.meta}><span className={getChangeColorClass(item.changePercent)}>{formatPercent(item.changePercent)}</span><span>{item.change > 0 ? '+' : ''}{item.change.toFixed(2)}</span></div></Card>] : [];
            })}
          </section>

          <section className={styles.twoColumns}>
            <Card title="盘前期指风向" extra={<Sunrise size={17} />}>
              {futures.length === 0 ? <Empty title="暂无期指数据" /> : <div className={styles.list}>{FUTURES.map(([code, label]) => {
                const item = futureByCode.get(code);
                return <div className={styles.row} key={code}><div className={styles.rowName}><span>{label}</span><small>{code}</small></div><span>{formatPrice(item?.price)}</span><span className={`${styles.change} ${getChangeColorClass(item?.changePercent)}`}>{formatPercent(item?.changePercent)}</span></div>;
              })}</div>}
            </Card>
            <Card title="盘后资金复盘" extra={<Moon size={17} />}>
              <p className={styles.note}>按最近常规交易时段美元成交额排序。</p>
              {recapItems.length ? <div className={styles.list}>{recapItems.map((item) => <QuoteRow key={item.code} quote={item} />)}</div> : <Empty />}
            </Card>
          </section>

          <Card title="美股市场榜单" extra={<Tabs items={RANKING_TABS} activeKey={rankingKey} onChange={(key) => setRankingKey(key as USRankingKey)} size="sm" />}>
            {rankingItems.length ? <div className={styles.rankingList}>{rankingItems.map((item, index) => (
              <div className={styles.rankingRow} key={item.code}>
                <span className={styles.rankNum}>{index + 1}</span>
                <div className={styles.rowName}><span>{item.name}</span><small>{quoteCode(item.code)}</small></div>
                <span className={styles.price}>{formatPrice(item.price)}</span>
                <span className={`${styles.change} ${getChangeColorClass(item.changePercent)}`}>{rankingKey === 'amount' ? formatDollarAmount(item.amount) : formatPercent(item.changePercent)}</span>
              </div>
            ))}</div> : <Empty title="暂无榜单数据" />}
          </Card>

          <Card title="行业板块走向" extra={<span className={styles.helper}><BarChart3 size={14} />SPDR 行业 ETF 代理</span>}>
            <p className={styles.note}>成交额表示资金关注热度，不等同于净流入。</p>
            {sectors.length ? <div className={styles.sectorGrid}>{sectors.map(({ quote, label }) => <QuoteRow key={quote.code} quote={quote} label={label} />)}</div> : <Empty />}
          </Card>
        </>
      )}
    </div>
  );
}
