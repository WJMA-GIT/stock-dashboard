import type { FundFlowRankingSnapshot } from '@/services/fundFlowRankings';
import styles from './Rankings.module.css';

export function FundFlowStatus({ snapshot, error }: { snapshot: FundFlowRankingSnapshot | null; error: boolean }) {
  const formatTime = (time: number) => new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  return (
    <div className={styles.flowHeader} role="status">
      {snapshot ? <>
        {snapshot.stale || error ? '历史快照 · ' : ''}
        {snapshot.source === 'eastmoney-delay' ? '东财延迟源' : '东财实时源'}
        {' · 获取于 '}{formatTime(snapshot.fetchedAt)}
        {snapshot.dataTime ? ` · 行情时间 ${formatTime(snapshot.dataTime)}` : ' · 上游未提供行情时间'}
        {error ? ' · 刷新失败，保留上次数据' : snapshot.stale ? ' · 暂显示上次成功数据' : ''}
      </> : error ? '资金流数据加载失败，请重试' : '等待资金流数据'}
    </div>
  );
}
