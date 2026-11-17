import { useEffect, useState } from 'react';
import type { Account, Book, Order, OrderIntent, Profile, Stock } from '../shared/types';
import { money } from './api';
import { StockChart } from './StockChart';
import { TradeHistory } from './TradeHistory';

const priceOf = (stock: Stock) => stock.lastCents ?? stock.referenceCents;
const changeOf = (stock: Stock) => (priceOf(stock) - stock.previousCloseCents) / stock.previousCloseCents * 100;
const direction = (stock: Stock) => changeOf(stock) >= 0 ? 'price-up' : 'price-down';
const percent = (stock: Stock) => `${changeOf(stock) > 0 ? '+' : ''}${changeOf(stock).toFixed(2)}%`;

function OrderBook({stock, book}: {stock: Stock; book: Book | null}) {
  if (book === null) return <section className="terminal-panel"><div className="terminal-panel-head">五档盘口 <span>{stock.code}</span></div><p className="empty">正在读取盘口…</p></section>;
  const asks = book.asks.slice(0, 5), bids = book.bids.slice(0, 5);
  // 深度条只比较实际挂单量，无报价的档位保持空白。
  const maxQuantity = Math.max(...asks.map(level => level.quantity), ...bids.map(level => level.quantity));
  const levels = (items: Book['asks'], side: 'buy' | 'sell') => items.map((level, index) => <div className="terminal-book-row" key={level.priceCents}>
    <i className={`terminal-depth ${side}`} style={{width: `${level.quantity / maxQuantity * 100}%`}} />
    <span>{side === 'buy' ? '买' : '卖'}{side === 'buy' ? index + 1 : asks.length - index}</span><b className={side === 'buy' ? 'price-up' : 'price-down'}>{money(level.priceCents)}</b><span>{level.quantity}</span><span>{money(level.priceCents * level.quantity)}</span>
  </div>);
  return <section className="terminal-panel"><div className="terminal-panel-head">五档盘口 <span>{stock.code}</span></div><div className="terminal-book">
    <div className="terminal-book-cols"><span>档位</span><span>价格</span><span>数量</span><span>金额</span></div>
    {asks.length === 0 ? <p className="terminal-book-empty">暂无卖单</p> : levels([...asks].reverse(), 'sell')}
    <div className="terminal-book-mid"><strong className={direction(stock)}>{money(priceOf(stock))}</strong><span>最新 {percent(stock)}</span></div>
    {bids.length === 0 ? <p className="terminal-book-empty">暂无买单</p> : levels(bids, 'buy')}
  </div></section>;
}

function OrderTicket({stock, account, side, setSide, busy, place}: {
  stock: Stock; account: Account; side: 'buy' | 'sell'; setSide: (side: 'buy' | 'sell') => void;
  busy: boolean; place: (intent: OrderIntent) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(priceOf(stock) / 100));
  const [quantity, setQuantity] = useState('1');
  const [clientOrderId, setClientOrderId] = useState(() => crypto.randomUUID());
  useEffect(() => {setClientOrderId(crypto.randomUUID());}, [side]);
  const position = account.positions.find(item => item.stockCode === stock.code)!;
  const priceCents = Math.round(Number(price) * 100);
  // 价格输入正在编辑时可以暂时为空或为零，此时不计算可买数量。
  const available = side === 'buy' ? (priceCents > 0 ? Math.floor(account.availableCents / priceCents) : 0) : position.available;
  const maximum = Math.min(1000000, available);
  function edited() {setClientOrderId(crypto.randomUUID());}
  return <section className="terminal-panel"><div className="terminal-panel-head">限价委托 <span>虚拟股票 · 按股交易</span></div>
    <div className="terminal-side-tabs">{(['buy', 'sell'] as const).map(value => <button key={value} className={value} aria-pressed={side === value} disabled={busy} onClick={() => setSide(value)}>{value === 'buy' ? '买入' : '卖出'}</button>)}</div>
    <form className="terminal-order-form" onSubmit={event => {
      event.preventDefault();
      // 原参数重试沿用同一编号，收到提交结果后才开始下一笔委托。
      void place({clientOrderId, stockCode: stock.code, side, priceCents, quantity: Number(quantity)}).then(() => setClientOrderId(crypto.randomUUID()));
    }}>
      <label><span>委托价格 <small>{side === 'buy' ? `可用 ${money(account.availableCents)} 元` : `可用 ${position.available} 股`}</small></span><input aria-label="委托价格" type="number" required min={stock.lowerLimitCents / 100} max={stock.upperLimitCents / 100} step="0.01" value={price} disabled={busy} onChange={event => {setPrice(event.target.value);edited();}} /></label>
      <label><span>委托数量 <small>最多 {maximum.toLocaleString('zh-CN')} 股</small></span><input aria-label="委托数量" type="number" required min="1" max={maximum} step="1" value={quantity} disabled={busy} onChange={event => {setQuantity(event.target.value);edited();}} /></label>
      <div className="terminal-ratios">{[25, 50, 75, 100].map(ratio => <button key={ratio} type="button" disabled={busy || maximum === 0} onClick={() => {setQuantity(String(Math.floor(maximum * ratio / 100)));edited();}}>{ratio === 100 ? '全部' : `${ratio}%`}</button>)}</div>
      <div className="terminal-order-total"><span>委托金额</span><b>{money(priceCents * Number(quantity))} 元</b></div>
      <div className="terminal-order-total"><span>今日价格范围</span><span>{money(stock.lowerLimitCents)}–{money(stock.upperLimitCents)}</span></div>
      <button className={`terminal-submit ${side}`} disabled={busy || maximum === 0}>{busy ? '处理中…' : side === 'buy' ? '买入' : '卖出'}</button>
      <p className="terminal-risk">虚拟资金 · 价格优先，同价按先后撮合</p>
    </form>
  </section>;
}

export function TradingPanel({stocks, account, orders, profile, book, selected, select, cancel, ban, busy, place}: {
  stocks: Stock[]; account: Account; orders: Order[]; profile: Profile; book: Book | null; selected: string;
  select: (code: string) => void; cancel: (id: number) => void; ban: (code: string) => void; busy: boolean;
  place: (intent: OrderIntent) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [bottomTab, setBottomTab] = useState('positions');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const stock = stocks.find(item => item.code === selected)!;
  const filtered = stocks.filter(item => `${item.code} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const marketValue = account.positions.reduce((sum, position) => sum + (position.available + position.frozen) * priceOf(stocks.find(item => item.code === position.stockCode)!), 0);
  return <div className="trading-terminal">
    <div className="terminal-ticker"><div className="terminal-brand"><b>废</b><div><strong>废话交易所</strong><small>MY LIFE TERMINAL</small></div></div>
      <div className="terminal-ticker-stocks">{stocks.slice(0, 3).map(item => <button key={item.code} onClick={() => select(item.code)}><span>{item.name}</span><b className={direction(item)}>{money(priceOf(item))}</b><em className={direction(item)}>{percent(item)}</em></button>)}</div>
      <span className="terminal-session"><i />虚拟撮合</span>
    </div>
    <div className="terminal-layout">
      <aside className="terminal-watchlist"><div className="terminal-watch-head"><div>自选股票 <span>{stocks.length} 只</span></div><input aria-label="搜索股票代码或名称" placeholder="搜索代码 / 名称" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <div className="terminal-watch-cols"><span>名称</span><span>现价</span><span>涨跌幅</span></div>
        <div className="terminal-watch-rows">{filtered.map(item => <button key={item.code} className="terminal-watch-row" aria-pressed={selected === item.code} onClick={() => select(item.code)}><span>{item.name}<small>{item.code}</small></span><b className={direction(item)}>{money(priceOf(item))}</b><span className={direction(item)}>{percent(item)}</span></button>)}{filtered.length === 0 && <p className="empty">没有匹配的股票</p>}</div>
        <p className="terminal-watch-note">行情来自交易所实际成交<br />红涨绿跌 · 每 5 秒同步</p>
      </aside>
      <main className="terminal-chart-area"><StockChart key={selected} stock={stock} /></main>
      <aside className="terminal-trade-column"><OrderBook stock={stock} book={book} /><OrderTicket key={selected} stock={stock} account={account} side={side} setSide={setSide} busy={busy} place={place} /></aside>
    </div>
    {/* 底部页签沿用真实持仓、委托和成交记录，不展示接口尚未提供的成本与浮盈。 */}
    <section className="terminal-bottom"><div className="terminal-bottom-tabs" role="group" aria-label="交易数据">{[['positions', '持仓'], ['orders', `当前委托 (${orders.length})`], ['trades', '成交记录'], ['funds', '资金概览']].map(([value, label]) => <button key={value} aria-pressed={bottomTab === value} onClick={() => setBottomTab(value)}>{label}</button>)}</div>
      <div className="terminal-bottom-content">
        {bottomTab === 'positions' && <div className="table-scroll"><table><thead><tr><th>证券名称</th><th>持仓数量</th><th>可用数量</th><th>冻结数量</th><th>现价</th><th>市值</th><th>宠物买入权限</th><th>操作</th></tr></thead><tbody>{stocks.map(item => {
          const position = account.positions.find(value => value.stockCode === item.code)!;
          const blocked = profile.banned.includes(item.code);
          return <tr key={item.code}><td><button className="terminal-stock-link" onClick={() => select(item.code)}>{item.name}<small>{item.code}</small></button></td><td>{position.available + position.frozen}</td><td>{position.available}</td><td>{position.frozen}</td><td className={direction(item)}>{money(priceOf(item))}</td><td>{money((position.available + position.frozen) * priceOf(item))}</td><td><button disabled={busy} onClick={() => ban(item.code)}>{blocked ? '已禁买 · 解除' : '允许 · 禁买'}</button></td><td><button className="terminal-sell" disabled={busy || position.available === 0} onClick={() => {select(item.code);setSide('sell');}}>卖出</button></td></tr>;
        })}</tbody></table></div>}
        {bottomTab === 'orders' && (orders.length === 0 ? <p className="empty">暂无未完成委托</p> : <div className="table-scroll"><table><thead><tr><th>委托时间</th><th>股票</th><th>方向</th><th>委托价格</th><th>委托数量</th><th>未成交</th><th>操作</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td>{new Date(order.createdAt).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Singapore', hour12: false})}</td><td>{order.stockCode}</td><td className={order.side === 'buy' ? 'price-up' : 'price-down'}>{order.side === 'buy' ? '买入' : '卖出'}</td><td>{money(order.priceCents)}</td><td>{order.quantity}</td><td>{order.remaining}</td><td><button disabled={busy} onClick={() => cancel(order.id)}>撤单</button></td></tr>)}</tbody></table></div>)}
        {bottomTab === 'trades' && <TradeHistory />}
        {bottomTab === 'funds' && <dl className="terminal-funds"><div><dt>可用资金</dt><dd>{money(account.availableCents)}</dd></div><div><dt>冻结资金</dt><dd>{money(account.frozenCents)}</dd></div><div><dt>持仓市值</dt><dd>{money(marketValue)}</dd></div><div><dt>账户总资产</dt><dd>{money(account.availableCents + account.frozenCents + marketValue)}</dd></div></dl>}
      </div>
    </section>
  </div>;
}
