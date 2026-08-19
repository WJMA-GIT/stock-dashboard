import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Loading } from '@/components/common';
import { useAppSettings } from '@/contexts';
import { usePolling } from '@/hooks';
import {
  getDragonTigerDetail,
  getDragonTigerInstitution,
  getDragonTigerSeatDetail,
} from '@/services/sdk';
import { formatPercent, formatPrice, formatYuanAmount, getChangeColorClass, normalizeStockCode } from '@/utils/format';
import { splitSeats, type SeatDisplayItem } from './seatDisplay';
import styles from './DragonTiger.module.css';

type DetailRows = Awaited<ReturnType<typeof getDragonTigerDetail>>;
type InstitutionRows = Awaited<ReturnType<typeof getDragonTigerInstitution>>;
type SeatRows = Awaited<ReturnType<typeof getDragonTigerSeatDetail>>;

function shanghaiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function compactDate(date: string) {
  return date.replaceAll('-', '');
}

function daysBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function codeKey(code: string) {
  return code.replace(/\D/g, '').slice(-6);
}

function uniqueStocks(rows: DetailRows) {
  return [...new Map(rows.map((row) => [codeKey(row.code), row])).values()];
}

async function loadSeats(rows: DetailRows, date: string) {
  const result: Record<string, SeatRows> = {};
  for (let index = 0; index < rows.length; index += 4) {
    const chunk = rows.slice(index, index + 4);
    const values = await Promise.all(chunk.map((row) =>
      getDragonTigerSeatDetail(codeKey(row.code), compactDate(date)).catch(() => [])
    ));
    chunk.forEach((row, offset) => { result[codeKey(row.code)] = values[offset] ?? []; });
  }
  return result;
}

function fallbackSeats(item: DetailRows[number], institution?: InstitutionRows[number]) {
  if (institution) {
    const amount = institution.orgNetAmount ?? ((institution.orgBuyAmount ?? 0) - (institution.orgSellAmount ?? 0));
    const seat: SeatDisplayItem = {
      name: `机构汇总（${amount >= 0 ? institution.buyOrgCount ?? 0 : institution.sellOrgCount ?? 0} 席）`,
      amount,
      summary: true,
    };
    return amount >= 0 ? { buyers: [seat], sellers: [] } : { buyers: [], sellers: [seat] };
  }

  return {
    buyers: item.buyAmount ? [{ name: '龙虎榜买入汇总', amount: item.buyAmount, summary: true }] : [],
    sellers: item.sellAmount ? [{ name: '龙虎榜卖出汇总', amount: -item.sellAmount, summary: true }] : [],
  };
}

function SeatColumn({ title, items, side }: { title: string; items: SeatDisplayItem[]; side: 'buy' | 'sell' }) {
  return (
    <div className={styles.seatColumn}>
      <div className={`${styles.seatTitle} ${side === 'buy' ? styles.buyTitle : styles.sellTitle}`}>{title}</div>
      {items.length ? items.map((seat, index) => (
        <div className={styles.seatRow} key={`${seat.name}-${index}`}>
          <span className={styles.rank}>{index + 1}</span>
          <span className={styles.seatName}>{seat.name}{seat.summary && <small>汇总</small>}</span>
          <strong className={getChangeColorClass(seat.amount)}>{formatYuanAmount(seat.amount)}</strong>
        </div>
      )) : <div className={styles.noSeat}>暂无明细</div>}
    </div>
  );
}

export function DragonTiger() {
  const navigate = useNavigate();
  const { getRefreshInterval } = useAppSettings();
  const [date, setDate] = useState(shanghaiDate);
  const [rows, setRows] = useState<DetailRows>([]);
  const [seats, setSeats] = useState<Record<string, SeatRows>>({});
  const [institutions, setInstitutions] = useState<Record<string, InstitutionRows[number]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const hydrate = useCallback(async (rawRows: DetailRows, targetDate: string, id: number) => {
    const stockRows = uniqueStocks(rawRows);
    if (id !== requestId.current) return;
    setRows(stockRows);
    setSeats({});
    setInstitutions({});
    setLoading(false);

    const range = { startDate: compactDate(targetDate), endDate: compactDate(targetDate) };
    const [seatMap, institutionRows] = await Promise.all([
      loadSeats(stockRows, targetDate),
      getDragonTigerInstitution(range).catch(() => []),
    ]);
    if (id !== requestId.current) return;
    setSeats(seatMap);
    setInstitutions(Object.fromEntries(institutionRows.map((item) => [codeKey(item.code), item])));
  }, []);

  const loadDate = useCallback(async (targetDate: string, showLoading = true) => {
    const id = ++requestId.current;
    if (showLoading) setLoading(true);
    setError(false);
    const range = { startDate: compactDate(targetDate), endDate: compactDate(targetDate) };
    try {
      await hydrate(await getDragonTigerDetail(range), targetDate, id);
    } catch (fetchError) {
      console.error('Dragon tiger fetch error:', fetchError);
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [hydrate]);

  const loadLatest = useCallback(async () => {
    const id = ++requestId.current;
    const today = shanghaiDate();
    setLoading(true);
    setError(false);
    try {
      const recent = await getDragonTigerDetail({
        startDate: compactDate(daysBefore(today, 45)),
        endDate: compactDate(today),
      });
      const latest = recent.reduce((value, item) => item.date > value ? item.date : value, '');
      setDate(latest || today);
      await hydrate(latest ? recent.filter((item) => item.date === latest) : [], latest || today, id);
    } catch (fetchError) {
      console.error('Latest dragon tiger fetch error:', fetchError);
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => { void loadLatest(); }, [loadLatest]);
  const refreshData = useCallback(() => loadDate(date, false), [date, loadDate]);
  usePolling(refreshData, {
    interval: Math.max(getRefreshInterval('list') * 4, 60000),
    immediate: false,
  });

  const totals = useMemo(() => rows.reduce((value, item) => ({
    buy: value.buy + (item.buyAmount ?? 0),
    sell: value.sell + (item.sellAmount ?? 0),
    net: value.net + (item.netBuyAmount ?? ((item.buyAmount ?? 0) - (item.sellAmount ?? 0))),
  }), { buy: 0, sell: 0, net: 0 }), [rows]);

  const selectDate = (nextDate: string) => {
    if (!nextDate) return;
    setDate(nextDate);
    void loadDate(nextDate);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}><Trophy size={24} />龙虎榜</h1>
          <p className={styles.subtitle}>展示选定交易日的上榜股票与买卖席位净额</p>
        </div>
        <label className={styles.dateField}>
          <CalendarDays size={16} />
          <input aria-label="龙虎榜日期" type="date" value={date} max={shanghaiDate()} onChange={(event) => selectDate(event.target.value)} />
        </label>
      </header>

      {loading ? <Loading fullScreen text="加载龙虎榜..." /> : error ? (
        <Card><Empty title="加载失败" description="龙虎榜数据暂时不可用" action={<Button size="sm" onClick={() => loadDate(date)}>重新加载</Button>} /></Card>
      ) : rows.length === 0 ? (
        <Card><Empty title="当日暂无龙虎榜数据" description="请选择其他交易日" /></Card>
      ) : (
        <>
          <section className={styles.summaryGrid}>
            <Card title="上榜股票"><strong className={styles.summaryValue}>{rows.length}</strong><span className={styles.helper}>只</span></Card>
            <Card title="买入合计"><strong className={`${styles.summaryValue} text-rise`}>{formatYuanAmount(totals.buy)}</strong><span className={styles.helper}>{date}</span></Card>
            <Card title="卖出合计"><strong className={`${styles.summaryValue} text-fall`}>{formatYuanAmount(-totals.sell)}</strong><span className={styles.helper}>{date}</span></Card>
            <Card title="净买额"><strong className={`${styles.summaryValue} ${getChangeColorClass(totals.net)}`}>{formatYuanAmount(totals.net)}</strong><span className={styles.helper}>{date}</span></Card>
          </section>

          <div className={styles.stockList}>
            {rows.map((item) => {
              const key = codeKey(item.code);
              const actualSeats = seats[key] ?? [];
              const sides = actualSeats.length ? splitSeats(actualSeats) : fallbackSeats(item, institutions[key]);
              const net = item.netBuyAmount ?? ((item.buyAmount ?? 0) - (item.sellAmount ?? 0));
              return (
                <Card key={key} padding="none">
                  <article className={styles.stockCard}>
                    <button className={styles.stockHeader} onClick={() => navigate(`/s/${normalizeStockCode(item.code)}`)}>
                      <span><strong>{item.name}</strong><small>{item.code}</small></span>
                      <span className={styles.quote}><b>{formatPrice(item.close)}</b><em className={getChangeColorClass(item.changePercent)}>{formatPercent(item.changePercent)}</em></span>
                      <span className={styles.net}><small>龙虎榜净额</small><strong className={getChangeColorClass(net)}>{formatYuanAmount(net)}</strong></span>
                    </button>
                    <p className={styles.reason}>{item.reason}</p>
                    {!actualSeats.length && <p className={styles.fallbackNote}>席位明细暂无数据，以下为{institutions[key] ? '机构' : '龙虎榜买卖'}汇总</p>}
                    <div className={styles.seatGrid}>
                      <SeatColumn title="买方席位（净额）" items={sides.buyers} side="buy" />
                      <SeatColumn title="卖方席位（净额）" items={sides.sellers} side="sell" />
                    </div>
                  </article>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
