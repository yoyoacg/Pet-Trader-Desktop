import { useEffect, useState } from 'react';
import type { Trade } from '../shared/types';
import { api, money } from './api';

export function TradeHistory() {
  const [before, setBefore] = useState(0);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      const data = await api<Trade[]>('GET', `/api/me/trades/history?beforeId=${before}`);
      if (!disposed) {setTrades(data);setError('');}
    }
    const load = () => {void refresh().then(undefined, error => {if (!disposed) setError(error.message);throw error;});};
    load();
    // 最新页随实际成交刷新，历史页保持稳定，避免阅读时记录跳动。
    const timer = before === 0 ? window.setInterval(load, 5000) : undefined;
    return () => {disposed = true;window.clearInterval(timer);};
  }, [before]);
  function page(id: number) {setTrades(null);setBefore(id);}
  return <section className="surface trade-history">
    <div className="section-head"><div><h2>我的交易记录</h2><p>仅显示已成交记录，时间采用新加坡时间；每页 50 笔。</p></div>{before !== 0 && <button onClick={() => page(0)}>最新成交</button>}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {trades === null ? <p className="empty">正在读取交易记录…</p> : trades.length === 0 ? <p className="empty">这里尚无成交记录。营业后，实际成交会显示在这里。</p> : <>
      <div className="table-scroll"><table><thead><tr><th>成交时间</th><th>股票</th><th>方向</th><th>成交价</th><th>数量</th><th>成交金额</th></tr></thead><tbody>{trades.map(trade => <tr key={trade.id}>
        <td>{new Date(trade.createdAt).toLocaleString('zh-CN', {timeZone: 'Asia/Singapore', hour12: false})}<small>成交 #{trade.id}</small></td>
        <td>{trade.stockCode}</td><td><span className={`side ${trade.side}`}>{trade.side === 'buy' ? '买' : '卖'}</span></td>
        <td>{money(trade.priceCents)}</td><td>{trade.quantity} 股</td><td>{money(trade.priceCents * trade.quantity)}</td>
      </tr>)}</tbody></table></div>
      {trades.length === 50 && <button className="history-more" onClick={() => page(trades[trades.length - 1].id)}>查看更早的成交</button>}
    </>}
  </section>;
}
