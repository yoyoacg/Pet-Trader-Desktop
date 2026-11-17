import type { Memory, Profile } from '../../shared/types';

export function remember(profile: Profile, kind: Memory['kind'], text: string, stockCode?: string): Profile {
  return {...profile, memories: [...profile.memories, {id: crypto.randomUUID(), time: new Date().toISOString(), kind, text, stockCode}]};
}

export function review(profile: Profile): Profile {
  const count = profile.cycles + 1;
  if (count % 10 !== 0) return {...profile, cycles: count};
  const recent = profile.memories.slice(-20);
  const trades = recent.filter(item => item.kind === 'trade');
  const criticism = recent.findLast(item => item.kind === 'reaction');
  const text = `第 ${count} 次巡市。最近记录了 ${trades.length} 条实际成交通知。${trades.length === 0 ? '没成交就是没成交，挂单可不算战绩。' : '每一笔都能去交易所对账，老板请验收。'}${criticism ? `我记得你说过：“${criticism.text}”。` : ''}`;
  return {...profile, cycles: count, review: {id: crypto.randomUUID(), text, reacted: false}};
}
