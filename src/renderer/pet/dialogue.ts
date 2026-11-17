import type { Emotion, Profile, Trade } from '../../shared/types';

export function tradeDialogue(trade: Trade): {emotion: Emotion; text: string} {
  return trade.side === 'buy'
    ? {emotion: 'working', text: `买到 ${trade.quantity} 股 ${trade.stockCode}，这是实际成交，可不是我嘴上说说。`}
    : {emotion: 'proud', text: `卖出 ${trade.quantity} 股 ${trade.stockCode}。至于赚没赚，要算成本，别只看收款。`};
}

export function idleDialogue(profile: Profile): {emotion: Emotion; text: string} {
  if (profile.pendingOrder) return {emotion: 'thinking', text: '上次委托还没核对清楚。我先不下第二张单，老板点一下核对。'};
  if (!profile.auto) return {emotion: 'idle', text: '我在。等你开工指令，挂在交易所里的单子可不会跟着我下班。'};
  return {emotion: 'thinking', text: '正在盯盘。行情是大家成交出来的，我只能报价，不能凭空拉涨。'};
}
