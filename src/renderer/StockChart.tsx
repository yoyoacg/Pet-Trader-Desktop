import { useEffect, useRef, useState } from 'react';
import type { Candle, Stock } from '../shared/types';
import { api, formatError, money } from './api';

const chartTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit'});
const chartDate = (value: string) => new Date(value).toLocaleDateString('zh-CN', {timeZone: 'Asia/Singapore', month: '2-digit', day: '2-digit'});
const averages = [{period: 5, color: '#e8c766'}, {period: 10, color: '#7ba7e0'}, {period: 20, color: '#c77bd8'}];

function PricePlot({candles, stock, mode}: {candles: Candle[]; stock: Stock; mode: 'candles' | 'line'}) {
  const container = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(360);
  const [count, setCount] = useState(120);
  const [offset, setOffset] = useState(0);
  const [pointer, setPointer] = useState<{x: number; y: number} | null>(null);
  useEffect(() => {
    // 跟随中间图表区的实际宽高绘制，让底部持仓和右侧盘口保持在同一屏内。
    const observer = new ResizeObserver(([entry]) => {setWidth(entry.contentRect.width);setHeight(entry.contentRect.height);});
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);
  const left = 12, right = width - 70, top = 18, bottom = height * .70, volumeTop = height * .82, volumeBottom = height - 28;
  // 24 小时窗口滚动后，历史翻页位置仍限制在当前可用成交范围内。
  const historyOffset = Math.min(offset, Math.max(0, candles.length - count));
  const end = candles.length - historyOffset, start = Math.max(0, end - count);
  const visible = candles.slice(start, end);
  const latest = candles[candles.length - 1];
  // 均线使用完整成交序列计算；历史不足时不画该周期，空白时段不补造数据。
  const lines = averages.map(({period, color}) => ({period, color, values: visible.map((_, index) => {
    const position = start + index;
    return position + 1 < period ? null : candles.slice(position + 1 - period, position + 1).reduce((sum, item) => sum + item.close, 0) / period;
  })}));
  const prices = [...visible.flatMap(item => [item.low, item.high]), ...lines.flatMap(line => line.values.filter(value => value !== null))];
  const low = Math.min(...prices), high = Math.max(...prices);
  // 至少留出六分钱的纵轴范围，单价成交也不会产生重复的分位刻度。
  const padding = Math.max(3, (high - low) * .12);
  const minimum = Math.max(0, low - padding), maximum = Math.max(minimum + 6, high + padding);
  const y = (price: number) => top + (maximum - price) / (maximum - minimum) * (bottom - top);
  const slots = Math.max(40, visible.length), step = (right - left) / slots;
  const x = (index: number) => left + (index + .5) * step;
  const candleWidth = Math.max(1, Math.min(9, step * .68));
  const maxVolume = Math.max(...visible.map(item => item.volume));
  const volumeHeight = (volume: number) => volume / maxVolume * (volumeBottom - volumeTop);
  const activeIndex = pointer === null ? visible.length - 1 : Math.min(visible.length - 1, Math.max(0, Math.floor((pointer.x - left) / step)));
  const active = visible[activeIndex];
  const change = active.close - active.open;
  const color = (item: Candle) => item.close >= item.open ? '#ff5a5a' : '#35c48d';
  const tickCount = Math.min(6, Math.max(2, Math.floor((right - left) / 70)), visible.length);
  const timeTicks = [...new Set(Array.from({length: tickCount}, (_, index) => Math.round(index * (visible.length - 1) / Math.max(1, tickCount - 1))))];
  const lastPriceVisible = latest.close >= minimum && latest.close <= maximum;
  return <div className="chart-canvas">
    <div className="chart-readout"><span>{chartDate(active.time)} {chartTime(active.time)}</span><span>开 <b style={{color: color(active)}}>{money(active.open)}</b></span><span>高 <b>{money(active.high)}</b></span><span>低 <b>{money(active.low)}</b></span><span>收 <b style={{color: color(active)}}>{money(active.close)}</b></span><span style={{color: color(active)}}>{change > 0 ? '+' : ''}{(change / active.open * 100).toFixed(2)}%</span></div>
    <div className="chart-indicators">{lines.map(line => <span key={line.period} style={{color: line.color}}>MA{line.period} {line.values[activeIndex] === null ? '—' : money(line.values[activeIndex]!)}</span>)}</div>
    <svg ref={container} className="price-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${stock.code} ${mode === 'candles' ? 'K 线' : '收盘价折线'}及成交量，红涨绿跌，显示 ${visible.length} 个成交时段`}
      onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const px = (event.clientX - rect.left) * width / rect.width, py = (event.clientY - rect.top) * height / rect.height;
        setPointer(px >= left && px <= right && py >= top && py <= volumeBottom ? {x: px, y: py} : null);
      }} onPointerLeave={() => setPointer(null)}>
      <defs><clipPath id={`plot-${stock.code}`}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
      {Array.from({length: 7}, (_, tick) => {
        const price = maximum - (maximum - minimum) * tick / 6;
        return <g key={tick}><line x1={left} x2={right} y1={y(price)} y2={y(price)} className="chart-grid" /><text x={right + 10} y={y(price) + 4}>{money(price)}</text></g>;
      })}
      {timeTicks.map(index => <g key={index}><line x1={x(index)} x2={x(index)} y1={top} y2={volumeBottom} className="chart-grid" /><text x={x(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === visible.length - 1 ? 'end' : 'middle'}>{chartTime(visible[index].time)}</text></g>)}
      <line x1={right} x2={right} y1={top} y2={volumeBottom} className="chart-grid" />
      <g clipPath={`url(#plot-${stock.code})`}>
        {stock.previousCloseCents >= minimum && stock.previousCloseCents <= maximum && <g><line x1={left} x2={right} y1={y(stock.previousCloseCents)} y2={y(stock.previousCloseCents)} className="chart-reference" /><text x={left + 4} y={y(stock.previousCloseCents) - 6}>昨收 {money(stock.previousCloseCents)}</text></g>}
        {mode === 'line' ? <polyline points={visible.map((item, index) => `${x(index)},${y(item.close)}`).join(' ')} fill="none" stroke="#7ba7e0" strokeWidth="1.6" /> : visible.map((item, index) => <g key={item.time} fill={item.close >= item.open ? '#101826' : color(item)} stroke={color(item)}><line x1={x(index)} x2={x(index)} y1={y(item.high)} y2={y(item.low)} /><rect x={x(index) - candleWidth / 2} y={Math.min(y(item.open), y(item.close))} width={candleWidth} height={Math.max(1, Math.abs(y(item.open) - y(item.close)))} /></g>)}
        {lines.map(line => <polyline key={line.period} points={line.values.flatMap((value, index) => value === null ? [] : [`${x(index)},${y(value)}`]).join(' ')} fill="none" stroke={line.color} strokeWidth="1.15" />)}
      </g>
      {lastPriceVisible && <g><line x1={left} x2={right} y1={y(latest.close)} y2={y(latest.close)} stroke="#d9a441" strokeDasharray="4 3" /><rect x={right + 2} y={y(latest.close) - 9} width={66} height={18} rx={3} fill="#d9a441" /><text className="chart-price-label" x={right + 7} y={y(latest.close) + 4}>{money(latest.close)}</text></g>}
      <line x1={left} x2={right} y1={volumeTop - 16} y2={volumeTop - 16} className="chart-grid" />
      <text x={left + 4} y={volumeTop - 6}>成交量 VOL <tspan fill={color(active)}>{active.volume.toLocaleString('zh-CN')} 股</tspan></text>
      {visible.map((item, index) => <rect key={item.time} x={x(index) - candleWidth / 2} y={volumeBottom - volumeHeight(item.volume)} width={candleWidth} height={volumeHeight(item.volume)} fill={color(item)} opacity=".55" />)}
      <text x={right + 10} y={volumeTop - 6}>{maxVolume.toLocaleString('zh-CN')}</text><text x={right + 10} y={volumeBottom}>0</text>
      {pointer !== null && <g className="chart-crosshair"><line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={volumeBottom} /><line x1={left} x2={right} y1={pointer.y} y2={pointer.y} />{pointer.y <= bottom && <g><rect x={right} y={pointer.y - 10} width={76} height={20} /><text x={right + 7} y={pointer.y + 4}>{money(maximum - (pointer.y - top) / (bottom - top) * (maximum - minimum))}</text></g>}<rect x={Math.max(left, Math.min(right - 132, x(activeIndex) - 66))} y={height - 25} width={132} height={22} /><text x={Math.max(left, Math.min(right - 132, x(activeIndex) - 66)) + 66} y={height - 10} textAnchor="middle">{chartDate(active.time)} {chartTime(active.time)}</text></g>}
    </svg>
    <div className="chart-navigation"><div><button aria-label="查看更早行情" disabled={start === 0} onClick={() => {setOffset(Math.min(candles.length - Math.min(count, candles.length), historyOffset + Math.ceil(count / 2)));setPointer(null);}}>←</button><button aria-label="查看较新行情" disabled={historyOffset === 0} onClick={() => {setOffset(Math.max(0, historyOffset - Math.ceil(count / 2)));setPointer(null);}}>→</button><button onClick={() => {setOffset(0);setPointer(null);}}>最新</button></div><div>{[60, 120, 240].map(value => <button key={value} aria-pressed={count === value} onClick={() => {setCount(value);setOffset(0);setPointer(null);}}>{value} 根</button>)}</div><span>UTC+8 · 自动缩放</span></div>
  </div>;
}

export function StockChart({stock}: {stock: Stock}) {
  const [interval, setIntervalValue] = useState('1m');
  const [mode, setMode] = useState<'candles' | 'line'>('candles');
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    setCandles(null);
    async function refresh() {
      const data = await api<Candle[]>('GET', `/api/stocks/${stock.code}/chart?interval=${interval}`);
      if (!disposed) {setCandles(data);setError('');}
    }
    // 请求错误显示并重新抛出，保留默认异常堆栈；切换股票后不写入旧响应。
    const load = () => {void refresh().then(undefined, error => {if (!disposed) setError(formatError(error));throw error;});};
    load();
    const timer = window.setInterval(load, 5000);
    return () => {disposed = true;window.clearInterval(timer);};
  }, [stock.code, interval]);
  const price = stock.lastCents ?? stock.referenceCents;
  const change = (price - stock.previousCloseCents) / stock.previousCloseCents * 100;
  return <section className="surface stock-chart">
    <div className="chart-market-head"><div className="chart-symbol"><h2>{stock.name}</h2><span>{stock.code} / 虚拟股票</span></div><div className={`chart-quote ${change >= 0 ? 'price-up' : 'price-down'}`}><strong>{money(price)}</strong><span>{change > 0 ? '+' : ''}{change.toFixed(2)}%{stock.lastCents === null ? ' · 参考价' : ''}</span></div><dl><div><dt>昨收</dt><dd>{money(stock.previousCloseCents)}</dd></div><div><dt>涨停</dt><dd className="price-up">{money(stock.upperLimitCents)}</dd></div><div><dt>跌停</dt><dd className="price-down">{money(stock.lowerLimitCents)}</dd></div><div><dt>累计成交量</dt><dd>{stock.volume.toLocaleString('zh-CN')} 股</dd></div></dl></div>
    <div className="chart-toolbar"><span className="chart-toolbar-title">行情图表</span><div className="chart-tabs">{[{value: '1m', label: '1 分'}, {value: '5m', label: '5 分'}, {value: '1h', label: '1 小时'}].map(item => <button key={item.value} aria-pressed={interval === item.value} onClick={() => setIntervalValue(item.value)}>{item.label}</button>)}</div><div className="chart-tabs chart-mode">{(['candles', 'line'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'candles' ? 'K 线' : '收盘折线'}</button>)}</div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {candles === null ? <p className="empty">正在读取成交走势…</p> : candles.length === 0 ? <p className="empty">近 24 小时尚无成交，成交后开始绘制。</p> : <PricePlot key={interval} candles={candles} stock={stock} mode={mode} />}
    <p className="chart-caption">真实虚拟成交 · 每 5 秒刷新 · 红涨绿跌 · 近 24 小时最多 240 个成交时段</p>
  </section>;
}
