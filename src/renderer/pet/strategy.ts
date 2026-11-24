import type { Account, AICandidate, Order, OrderIntent, Profile, Stock } from '../../shared/types';

// 筛选当前可买或可卖的候选股票与本地限额；无候选股票时不调用 AI，避免空转浪费 Token。
export function buildAICandidates(stocks: Stock[], account: Account, orders: Order[], profile: Profile): AICandidate[] {
  const reserved = Math.max(0, profile.budgetCents - account.frozenCents);
  const maxSpend = Math.min(Math.floor(account.availableCents * 0.2), reserved);
  return stocks.flatMap(stock => {
    if (orders.some(order => order.stockCode === stock.code)) return [];
    const priceCents = Math.max(stock.lowerLimitCents, Math.min(stock.upperLimitCents, stock.lastCents ?? stock.referenceCents));
    const position = account.positions.find(item => item.stockCode === stock.code) ?? {stockCode: stock.code, available: 0, frozen: 0};
    const maxBuyQuantity = profile.banned.includes(stock.code) ? 0 : Math.floor(maxSpend / priceCents);
    const maxSellQuantity = Math.floor(position.available * 0.2);
    if (maxBuyQuantity <= 0 && maxSellQuantity <= 0) return [];
    return [{
      code: stock.code,
      name: stock.name,
      priceCents,
      lowerLimitCents: stock.lowerLimitCents,
      upperLimitCents: stock.upperLimitCents,
      maxBuyQuantity,
      maxSellQuantity,
      availablePosition: position.available,
    }];
  });
}

// 随机性只用于报价和选择；行情必须由交易所的实际成交产生。
export function decideOrder(stocks: Stock[], account: Account, orders: Order[], profile: Profile): OrderIntent | null {
  const reserved = Math.max(0, profile.budgetCents - account.frozenCents);
  const candidates = stocks.flatMap(stock => {
    if (orders.some(order => order.stockCode === stock.code)) return [];
    // 宠物报价也遵守服务端公布的当日涨跌停区间。
    const priceCents = Math.max(stock.lowerLimitCents, Math.min(stock.upperLimitCents, Math.round((stock.lastCents ?? stock.referenceCents) * (0.98 + Math.random() * 0.04))));
    const position = account.positions.find(item => item.stockCode === stock.code) ?? {stockCode: stock.code, available: 0, frozen: 0};
    const buyQuantity = Math.floor(Math.min(account.availableCents * 0.2, reserved) / priceCents);
    const sellQuantity = Math.floor(position.available * 0.2);
    const options: OrderIntent[] = [];
    if (!profile.banned.includes(stock.code) && buyQuantity > 0) options.push({clientOrderId: crypto.randomUUID(), stockCode: stock.code, side: 'buy', priceCents, quantity: buyQuantity});
    if (sellQuantity > 0) options.push({clientOrderId: crypto.randomUUID(), stockCode: stock.code, side: 'sell', priceCents, quantity: sellQuantity});
    return options;
  });
  if (candidates.length === 0) return null; // 无可交易资产或所有股票均已有挂单，属于正常观望。
  return candidates[Math.floor(Math.random() * candidates.length)];
}
