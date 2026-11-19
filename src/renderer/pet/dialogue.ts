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

export function offlineChatReply(message: string, profile: Profile): {emotion: Emotion; reply: string} {
  const lastTrade = profile.memories.findLast(item => item.kind === 'trade');
  if (message.includes('赚') || message.includes('亏') || message.includes('战绩')) {
    return {emotion: 'proud', reply: lastTrade ? `我可没偷懒，最近一笔是：${lastTrade.text}。（开启本地 AI 后我能按自定义人设和你深聊）` : '目前还没有实际成交入账，挂单可不算战绩！（开启本地 AI 后可自由对话）'};
  }
  if (!profile.auto) {
    return {emotion: 'idle', reply: `收到老板说的“${message}”啦。我现在还在待命，点“让它开始营业”我就去盯盘！（开启本地 AI 可自由对话）`};
  }
  return {emotion: profile.trust >= 60 ? 'happy' : 'thinking', reply: `你的话我记在小本本上啦！当前信任度 ${profile.trust}/100，我会按${profile.persona}的风格继续盯盘。（开启本地 AI 可自由对话）`};
}
