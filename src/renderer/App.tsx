import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Account, AIConfig, Book, Bootstrap, Character, Emotion, Order, OrderIntent, PetMotion, Profile, Session, Stock, Trade, Visual } from '../shared/types';
import { api, money } from './api';
import { buildAICandidates, decideOrder } from './pet/strategy';
import { remember, review } from './pet/memory';
import { idleDialogue, offlineChatReply, tradeDialogue } from './pet/dialogue';
import { Pet } from './Pet';
import { TradingPanel } from './TradingPanel';
import { TradeHistory } from './TradeHistory';
import { CharacterImport } from './characters/CharacterImport';
import { BubblePanel } from './BubblePanel';

function PetWindow() {
  const [visual, setVisual] = useState<Visual | null>(null);
  const [motion, setMotion] = useState<PetMotion>('idle');
  const [animationError, setAnimationError] = useState('');
  useEffect(() => {
    const remove = window.desktop.onVisual(setVisual);
    const removeMotion = window.desktop.onMotion(setMotion);
    // 动画文件 IO 错误显示在宠物窗口，同时保留默认的完整控制台异常。
    const rejected = (event: PromiseRejectionEvent) => setAnimationError(String(event.reason.message));
    window.addEventListener('unhandledrejection', rejected);
    void window.desktop.bootstrap().then(data => {
      if (data.profile) setVisual({character: data.profile.character, ...idleDialogue(data.profile)});
      else setVisual({character: data.characters[0], emotion: 'idle', text: '老板，连接交易所就能开工了。'});
    });
    return () => {remove();removeMotion();window.removeEventListener('unhandledrejection', rejected);};
  }, []);
  return <div className="floating-pet">{animationError && <p className="error" role="alert">{animationError}</p>}{visual && <Pet visual={visual} motion={motion} draggable />}</div>;
}

export function App() {
  const [visual, setVisual] = useState<Visual | null>(null);
  const isPet = new URLSearchParams(location.search).get('view') === 'pet';
  return isPet ? <PetWindow /> : <BubblePanel visual={visual}><Workbench onVisual={setVisual} /></BubblePanel>;
}

function getAvailableActions(character: Character): string[] {
  const base = ['jump', 'spin', 'bow', 'shake', 'headpat', 'poke', 'tail'];
  const custom = Object.keys(character.customActions ?? {});
  const specific = character.type === 'puppet'
    ? Object.keys(character.puppet?.poses ?? {})
    : character.type === 'sequence'
      ? Object.keys(character.animations ?? {})
      : character.type === 'live2d'
        ? [...character.motions.map(item => item.group), ...character.expressions]
        : [];
  return [...new Set([...base, ...custom, ...specific])];
}

function Workbench({onVisual}: {onVisual: (visual: Visual | null) => void}) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const current = useRef<Profile | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [live2dReady, setLive2dReady] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const stocksRef = useRef<Stock[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const accountRef = useRef<Account | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [selected, setSelected] = useState('EASY');
  const selectedRef = useRef(selected);
  const [tab, setTab] = useState('market');
  const [visual, setVisual] = useState<Visual | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const lastDecision = useRef(0);
  const lastSpokenAt = useRef(0);
  const nextProactiveAt = useRef(Date.now() + 35000);
  const [updated, setUpdated] = useState('尚未连接');
  // 默认服务端地址由桌面端 .env 配置，缺失或格式错误直接报错。
  const [url, setURL] = useState(() => new URL(import.meta.env.VITE_API_BASE_URL).origin);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [budget, setBudget] = useState('10000');
  const [persona, setPersona] = useState('');
  const [chatText, setChatText] = useState('');
  const [aiConfig, setAIConfig] = useState<AIConfig>({enabled: false, endpoint: '', model: '', imageEndpoint: '', imageModel: '', hasApiKey: false});
  const aiConfigRef = useRef<AIConfig>(aiConfig);
  const [aiEnabled, setAIEnabled] = useState(false);
  const [aiEndpoint, setAIEndpoint] = useState('');
  const [aiModel, setAIModel] = useState('');
  const [aiImageEndpoint, setAIImageEndpoint] = useState('');
  const [aiImageModel, setAIImageModel] = useState('');
  const [aiKey, setAIKey] = useState('');
  const [aiStatus, setAIStatus] = useState('');
  const actionSeq = useRef(0);
  useEffect(() => onVisual(visual), [visual, onVisual]);

  function restore(data: Bootstrap) {
    current.current = data.profile;
    setSession(data.session); setProfile(data.profile); setCharacters(data.characters); setLive2dReady(data.live2dReady);
    setAIConfig(data.aiConfig); aiConfigRef.current = data.aiConfig;
    setAIEnabled(data.aiConfig.enabled); setAIEndpoint(data.aiConfig.endpoint); setAIModel(data.aiConfig.model);
    setAIImageEndpoint(data.aiConfig.imageEndpoint); setAIImageModel(data.aiConfig.imageModel); setAIKey('');
    if (data.profile) {
      setBudget(String(data.profile.budgetCents / 100));
      setPersona(data.profile.persona);
      setVisual({character: data.profile.character, ...idleDialogue(data.profile)});
    }
    else setVisual({character: data.characters[0], emotion: 'idle', text: '老板，连接交易所就能开工了。'});
    setReady(true);
  }
  useEffect(() => {
    // 异步入口的错误展示给用户，同时保留浏览器默认的完整异常堆栈。
    const rejected = (event: PromiseRejectionEvent) => {setError(String(event.reason.stack)); setUpdated('连接或操作失败 · 挂单状态请核对');};
    const failed = (event: ErrorEvent) => setError(String(event.error.stack));
    window.addEventListener('unhandledrejection', rejected);
    window.addEventListener('error', failed);
    void window.desktop.bootstrap().then(restore);
    return () => {window.removeEventListener('unhandledrejection', rejected);window.removeEventListener('error', failed);};
  }, []);

  async function mutate(change: (value: Profile) => Profile) {
    const next = change(current.current!);
    current.current = next; setProfile(next);
    await window.desktop.saveProfile(next);
  }
  async function speak(emotion: Emotion, text: string, overrideCharacter?: Character, actionName?: string) {
    lastSpokenAt.current = Date.now();
    if (actionName) actionSeq.current += 1;
    const next: Visual = {
      character: overrideCharacter ?? current.current!.character,
      emotion,
      text,
      action: actionName ? {name: actionName, seq: actionSeq.current, durationMs: 4500} : undefined,
    };
    setVisual(next); await window.desktop.publish(next);
  }
  async function triggerProactiveChat(trigger: string) {
    nextProactiveAt.current = Date.now() + 40000 + Math.floor(Math.random() * 35000);
    const assets = accountRef.current;
    const market = stocksRef.current;
    const equityVal = assets && market.length > 0
      ? assets.availableCents + assets.frozenCents + assets.positions.reduce((sum, position) => {
          const stock = market.find(item => item.code === position.stockCode);
          return sum + (position.available + position.frozen) * (stock ? (stock.lastCents ?? stock.referenceCents) : 10000);
        }, 0)
      : 0;
    const equitySummary = assets
      ? `总资产 ${money(equityVal)}（相对初始 ${money(equityVal - assets.initialEquityCents)}），可用现金 ${money(assets.availableCents)}`
      : '尚未同步账户资产';
    const marketSummary = market.map(item => `${item.name}(${item.code}):${money(item.lastCents ?? item.referenceCents)}`).join('，');
    const char = current.current!.character;
    const result = await window.desktop.aiProactiveChat({
      time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}),
      trigger,
      persona: current.current!.persona,
      trust: current.current!.trust,
      auto: current.current!.auto,
      equitySummary,
      marketSummary,
      recentMemories: current.current!.memories.slice(-6).map(item => item.text),
      characterId: char.id,
      characterType: char.type,
      availableActions: getAvailableActions(char),
    });
    let activeChar = char;
    if (result.generatedAction) {
      activeChar = result.generatedAction.character;
      setCharacters(items => items.map(item => item.id === activeChar.id ? activeChar : item));
    }
    const actionLabel = result.generatedAction ? ` [新生成动作：${result.generatedAction.name}]` : result.action ? ` [动作：${result.action}]` : '';
    await mutate(value => remember({...value, character: activeChar}, 'chat', `小秘书主动说：“${result.reply}”${actionLabel}`));
    await speak(result.emotion, result.reply, activeChar, result.action);
  }
  async function generateReviewText(baseProfile: Profile): Promise<string | undefined> {
    if (!aiConfigRef.current.enabled || (baseProfile.cycles + 1) % 10 !== 0) return undefined;
    const recent = baseProfile.memories.slice(-20);
    const trades = recent.filter(item => item.kind === 'trade');
    const criticism = recent.findLast(item => item.kind === 'reaction');
    const result = await window.desktop.aiReview({
      cycles: baseProfile.cycles + 1,
      persona: baseProfile.persona,
      trust: baseProfile.trust,
      tradeCount: trades.length,
      criticism: criticism ? criticism.text : '',
      recentMemories: recent.slice(-8).map(item => item.text),
    });
    return result.text;
  }
  // 网络请求可能超过轮询间隔，禁止两个本地循环重叠提交委托。
  function perform(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    return task().finally(() => {busyRef.current = false;setBusy(false);});
  }
  async function synchronize() {
    const [market, assets, open] = await Promise.all([api<Stock[]>('GET', '/api/market'), api<Account>('GET', '/api/me/account'), api<Order[]>('GET', '/api/me/orders')]);
    stocksRef.current = market; accountRef.current = assets;
    setStocks(market); setAccount(assets); setOrders(open);
    setBook(await api<Book>('GET', `/api/stocks/${selectedRef.current}/book`));
    let page: Trade[];
    do {
      page = await api<Trade[]>('GET', `/api/me/trades?afterId=${current.current!.lastTradeId}&limit=100`);
      if (page.length > 0) {
        await mutate(value => {
          let next = value;
          for (const trade of page) next = remember(next, 'trade', `${trade.side === 'buy' ? '买入' : '卖出'} ${trade.quantity} 股 ${trade.stockCode}，成交价 ${money(trade.priceCents)}；成交 #${trade.id}`, trade.stockCode);
          return {...next, lastTradeId: page[page.length - 1].id};
        });
        const latestTrade = page[page.length - 1];
        if (aiConfigRef.current.enabled) {
          await triggerProactiveChat(`刚达成一笔真实成交：${latestTrade.side === 'buy' ? '买入' : '卖出'} ${latestTrade.quantity} 股 ${latestTrade.stockCode}，成交单价 ${money(latestTrade.priceCents)}`);
        } else {
          const response = tradeDialogue(latestTrade); await speak(response.emotion, response.text);
        }
      }
    } while (page.length === 100);
    setUpdated(`已同步 ${new Date().toLocaleTimeString('zh-CN')}`);
    if (current.current!.auto && !current.current!.pendingOrder && Date.now() - lastDecision.current >= 60000) {
      lastDecision.current = Date.now();
      const expired = open.filter(order => Date.now() - Date.parse(order.createdAt) >= 300000);
      if (expired.length > 0) {
        for (const order of expired) await api('DELETE', `/api/orders/${order.id}`);
        await mutate(value => review(remember(value, 'decision', `已申请撤销 ${expired.length} 笔满五分钟的挂单；本轮不补单。`)));
        await speak('thinking', '挂单等了五分钟，先撤回来重新想想。');
      } else if (aiConfigRef.current.enabled) {
        const candidates = buildAICandidates(market, assets, open, current.current!);
        if (candidates.length === 0) {
          // 所有股票均已有挂单或可用额度不足时直接跳过 AI 请求，避免空转消耗 Token。
          const aiReviewText = await generateReviewText(current.current!);
          await mutate(value => review(remember(value, 'decision', '本轮观望：无可买或可卖候选股票，已跳过 AI 调用。'), aiReviewText));
          await speak('thinking', '这轮没有可下单额度或都已经挂着单子了，我先省省脑力继续盯盘。');
        } else {
          const decision = await window.desktop.aiDecide({
            persona: current.current!.persona,
            trust: current.current!.trust,
            availableCents: assets.availableCents,
            remainingBudgetCents: Math.max(0, current.current!.budgetCents - assets.frozenCents),
            candidates,
            recentMemories: current.current!.memories.slice(-6).map(item => item.text),
          });
          if (decision.action === 'hold') {
            const withMemory = remember(current.current!, 'decision', `AI 观望：${decision.reason}`);
            const aiReviewText = await generateReviewText(withMemory);
            await mutate(() => review(withMemory, aiReviewText));
            await speak(decision.emotion, decision.dialogue);
          } else {
            const intent: OrderIntent = {
              clientOrderId: crypto.randomUUID(),
              stockCode: decision.stockCode,
              side: decision.action,
              priceCents: decision.priceCents,
              quantity: decision.quantity,
            };
            const withMemory = remember(current.current!, 'decision', `AI 决定${intent.side === 'buy' ? '买入' : '卖出'} ${intent.quantity} 股 ${intent.stockCode}，限价 ${money(intent.priceCents)}（${decision.reason}）`, intent.stockCode);
            const aiReviewText = await generateReviewText(withMemory);
            await mutate(() => review({...withMemory, pendingOrder: intent}, aiReviewText));
            await speak(decision.emotion, decision.dialogue);
            await submitPending();
          }
        }
      } else {
        const intent = decideOrder(market, assets, open, current.current!);
        if (intent) {
          // 先落盘原订单编号，再请求服务器。网络失败时不会偷偷换编号重下。
          await mutate(value => review({...remember(value, 'decision', `决定${intent.side === 'buy' ? '买入' : '卖出'} ${intent.quantity} 股 ${intent.stockCode}，限价 ${money(intent.priceCents)}`, intent.stockCode), pendingOrder: intent}));
          await submitPending();
        } else {
          await mutate(value => review(remember(value, 'decision', '本轮观望：可用预算、股数或挂单条件不满足。')));
          await speak('thinking', '这轮先观望。没有合适的委托，比乱买更像一个负责任的秘书。');
        }
      }
    }
    // 开启本地 AI 后，即使未开启自动交易或在巡市间隙，小秘书也会每隔 40–75 秒主动找老板搭话陪伴。
    if (aiConfigRef.current.enabled && Date.now() >= nextProactiveAt.current && Date.now() - lastSpokenAt.current >= 25000) {
      await triggerProactiveChat(current.current!.auto ? '日常盯盘间隙主动找老板闲聊陪伴' : '待命休息时主动关心或调侃老板');
    }
  }
  async function submitPending() {
    const intent = current.current!.pendingOrder!;
    const known = await window.desktop.request<Order>('GET', `/api/me/orders/by-client/${intent.clientOrderId}`);
    if (known.ok) {
      await mutate(value => ({...remember(value, 'decision', `原委托 #${known.body.id} 已存在：${known.body.status}，没有重新下单。`), pendingOrder: null}));
      await speak('idle', `原委托已核对：${known.body.status}。`);
      return;
    }
    if (known.status !== 404) throw new Error(`提交前核对原委托失败：${known.body.error}`);
    const policy = current.current!;
    if (!policy.auto || (intent.side === 'buy' && policy.banned.includes(intent.stockCode))) throw new Error('当前已暂停或该股票已禁买，请放弃这笔待确认委托');
    const assets = await api<Account>('GET', '/api/me/account');
    if (intent.side === 'buy' && intent.priceCents * intent.quantity > Math.min(assets.availableCents * 0.2, Math.max(0, policy.budgetCents - assets.frozenCents))) throw new Error('原委托超出当前预算或单次额度，请放弃后重新决策');
    const result = await window.desktop.request<Order>('POST', '/api/orders', intent);
    if (!result.ok) {
      // 明确的业务拒单没有创建订单；服务端异常仍保留原编号等待核对。
      if (result.status >= 400 && result.status < 500) await mutate(value => ({...remember(value, 'decision', `委托被交易所拒绝：${result.body.error}`), pendingOrder: null}));
      throw new Error(`下单失败：${result.body.error}（HTTP ${result.status}）`);
    }
    await mutate(value => ({...remember(value, 'decision', `交易所已确认委托 #${result.body.id}，状态 ${result.body.status}。`, intent.stockCode), pendingOrder: null}));
    await speak('working', result.body.status === 'filled' ? '委托已成交，具体明细等下一次对账。' : '单子已经挂出去，等别人来接。挂单成功可不代表买到了。');
  }
  async function reconcile() {
    const intent = current.current!.pendingOrder!;
    const result = await window.desktop.request<Order>('GET', `/api/me/orders/by-client/${intent.clientOrderId}`);
    if (result.status === 404) {await speak('thinking', '交易所暂未查到该编号。你可以选择用原编号重新提交，不会创建重复委托。');return;}
    if (!result.ok) throw new Error(`核对委托失败：${result.body.error}`);
    await mutate(value => ({...remember(value, 'decision', `已核对委托 #${result.body.id}：${result.body.status}`), pendingOrder: null}));
    await speak('idle', `上次委托核对清楚了：${result.body.status}。`);
  }
  async function abandonPending() {
    const result = await api<Order>('POST', '/api/orders/abandon', current.current!.pendingOrder!);
    await mutate(value => ({...remember(value, 'command', `已终结原委托 #${result.id}：${result.status}。迟到请求不能创建新挂单。`), pendingOrder: null}));
    await speak('idle', result.status === 'filled' ? '核对时原委托已经成交，成交不能撤销。' : '原委托已终结，即使旧请求迟到也不会重新挂出去。');
  }
  useEffect(() => {
    if (!session) return;
    perform(synchronize);
    const timer = window.setInterval(() => perform(synchronize), 5000);
    return () => window.clearInterval(timer);
  }, [session]);

  function login(event: FormEvent) {
    event.preventDefault(); setError('');
    perform(async () => {restore(await window.desktop.login({url, username, password, register}));setPassword('');});
  }
  async function toggleAuto() {
    const enabled = !current.current!.auto;
    await mutate(value => remember({...value, auto: enabled}, 'command', enabled ? '老板允许自动交易。' : '老板暂停自动交易，申请撤销全部未完成委托。'));
    if (!enabled) {
      if (current.current!.pendingOrder) await abandonPending();
      const open = await api<Order[]>('GET', '/api/me/orders');
      for (const order of open) await api('DELETE', `/api/orders/${order.id}`);
    }
    lastDecision.current = 0;
    await speak(enabled ? 'working' : 'idle', enabled ? '收到，开始营业。老板负责围观，我负责认真报价。' : '已暂停新决策，挂单撤销请求已完成。成交过的部分不能撤回。');
    await synchronize();
  }
  async function placeManualOrder(intent: OrderIntent) {
    // 手动委托使用既有撮合接口，成交与否以服务端返回及后续对账为准。
    const order = await api<Order>('POST', '/api/orders', intent);
    await mutate(value => remember(value, 'command', `老板手动${intent.side === 'buy' ? '买入' : '卖出'} ${intent.quantity} 股 ${intent.stockCode}，限价 ${money(intent.priceCents)}；委托 #${order.id}：${order.status}`, intent.stockCode));
    await synchronize();
  }
  async function ban(code: string) {
    const blocked = !current.current!.banned.includes(code);
    await mutate(value => remember({...value, banned: blocked ? [...value.banned, code] : value.banned.filter(item => item !== code)}, 'command', `${blocked ? '禁止' : '解除禁止'}买入 ${code}`, code));
    if (blocked) {
      const pending = current.current!.pendingOrder;
      if (pending && pending.side === 'buy' && pending.stockCode === code) await abandonPending();
      const open = await api<Order[]>('GET', '/api/me/orders');
      for (const order of open.filter(item => item.stockCode === code && item.side === 'buy')) await api('DELETE', `/api/orders/${order.id}`);
    }
    await speak(blocked ? 'angry' : 'happy', blocked ? `${code} 已禁买，已有买单撤单请求已完成。要是它涨了，我会记得这道指令。` : `${code} 重新允许买入。我先研究，买不买还得看预算。`);
    await synchronize();
  }
  async function changeCharacter(character: Character) {
    await mutate(value => ({...value, character}));
    if (character.type === 'live2d' && !live2dReady) {setError('已保存角色选择，但本版本未配置 Live2D 运行时，暂时不能显示该模型。');return;}
    await speak('happy', '换了个样子，之前的账我可都还记着。');
  }
  async function importFile() {
    const character = await window.desktop.importCharacter();
    if (character) {setCharacters(items => [...items, character]);await changeCharacter(character);}
  }
  async function reaction(kind: 'praise' | 'comfort' | 'criticize') {
    const text = {praise: '老板表扬了本次复盘。', comfort: '老板安慰了本次复盘。', criticize: '老板批评了本次复盘。'}[kind];
    await mutate(value => ({...remember(value, 'reaction', text), trust: Math.max(0, Math.min(100, value.trust + {praise: 3, comfort: 2, criticize: -3}[kind])), review: {...value.review!, reacted: true}}));
    await speak(kind === 'criticize' ? 'angry' : 'happy', kind === 'criticize' ? '批评收到了。我记住的是你这句话，不是凭空编一笔亏损。' : '这句话我记下了，下次写复盘就有底气了。');
  }
  async function savePersonaSetting() {
    const trimmed = persona.trim();
    if (!trimmed) throw new Error('人设描述不能为空');
    await mutate(value => remember({...value, persona: trimmed}, 'command', `老板更新了小秘书人设：${trimmed}`));
    await speak('happy', `新性格设定记住了！以后我就按「${trimmed}」的风格陪你盯盘。`);
  }
  async function chatWithPet(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message) return;
    if (!current.current) {
      const fallback = {character: characters[0], emotion: 'idle' as const, text: '老板，先登录交易所，我们就能开始对话和记录共同记忆啦！'};
      setVisual(fallback); await window.desktop.publish(fallback);
      return;
    }
    const assets = accountRef.current;
    const summary = assets ? `可用现金 ${money(assets.availableCents)}，冻结 ${money(assets.frozenCents)}` : '尚未同步账户资产';
    const char = current.current.character;
    const response = aiConfigRef.current.enabled
      ? await window.desktop.aiChat({
          message,
          persona: current.current.persona,
          trust: current.current.trust,
          auto: current.current.auto,
          equitySummary: summary,
          recentMemories: current.current.memories.slice(-8).map(item => item.text),
          characterId: char.id,
          characterType: char.type,
          availableActions: getAvailableActions(char),
        })
      : {...offlineChatReply(message, current.current), action: 'jump', generatedAction: undefined};
    let activeChar = char;
    if (response.generatedAction) {
      activeChar = response.generatedAction.character;
      setCharacters(items => items.map(item => item.id === activeChar.id ? activeChar : item));
    }
    const actionLabel = response.generatedAction ? ` [新生成动作：${response.generatedAction.name}]` : response.action ? ` [动作：${response.action}]` : '';
    await mutate(value => remember({...value, character: activeChar}, 'chat', `老板：“${message}” → 小秘书：“${response.reply}”${actionLabel}`));
    await speak(response.emotion, response.reply, activeChar, response.action);
  }
  async function sendChat(event: FormEvent) {
    event.preventDefault();
    const message = chatText.trim();
    if (!message) return;
    setChatText('');
    await chatWithPet(message);
  }
  useEffect(() => {
    return window.desktop.onPetChat(text => {
      void chatWithPet(text);
    });
  }, [characters]);
  async function saveAISetting() {
    const saved = await window.desktop.saveAIConfig({
      enabled: aiEnabled,
      endpoint: aiEndpoint,
      model: aiModel,
      imageEndpoint: aiImageEndpoint,
      imageModel: aiImageModel,
      apiKey: aiKey,
    });
    setAIConfig(saved); aiConfigRef.current = saved;
    setAIEnabled(saved.enabled); setAIEndpoint(saved.endpoint); setAIModel(saved.model);
    setAIImageEndpoint(saved.imageEndpoint); setAIImageModel(saved.imageModel); setAIKey('');
    setAIStatus(saved.enabled ? `已保存并启用（${saved.endpoint}）` : '配置已保存（未启用）');
    await speak('happy', saved.enabled ? '本地 AI 接口已启用，随时可以点“测试连接”或直接跟我说话验证！' : '本地 AI 配置已保存，当前使用本地规则策略。');
  }
  async function testAISetting() {
    setAIStatus('正在向模型发送连接测试请求…');
    const result = await window.desktop.testAIConfig({
      endpoint: aiEndpoint,
      model: aiModel,
      apiKey: aiKey,
    });
    setAIStatus(`连接成功 · 响应模型：${result.model} · 回复：“${result.reply}”`);
    await speak(result.emotion, result.reply);
  }
  async function logout() {
    await mutate(value => ({...value, auto: false}));
    await window.desktop.logout();
    const character = current.current!.character;
    current.current = null;setSession(null);setProfile(null);setAccount(null);setOrders([]);setStocks([]);setVisual({character, emotion: 'idle', text: '老板，重新连接交易所就能开工了。'});setUpdated('已退出 · 服务器挂单仍有效');
  }

  if (!ready) return <main className="loading">正在打开本地宠物档案…{error && <pre>{error}</pre>}</main>;
  if (!session) return <main className="login-page"><div className="login-art"><span className="wordmark">MY LIFE / 废话交易所</span><h1>认真养宠。<br />荒谬交易。</h1><p>让你的小秘书，加入所有人的废话市场。</p><img src="petasset://builtin/default.png" className="login-sprite" alt="九种表情的阿废" /><span className="caption">虚拟资金 · 共享行情 · 本地记忆</span></div><form className="login-form" onSubmit={login}><span className="eyebrow">小秘书准备就绪</span><h2>{register ? '领取营业账户' : '回到交易工作台'}</h2><label>交易所地址<input required type="url" value={url} onChange={event => setURL(event.target.value)} /></label><label>用户名<input required autoComplete="username" minLength={3} maxLength={24} pattern="[a-zA-Z0-9]+" value={username} onChange={event => setUsername(event.target.value)} placeholder="3–24 位英文字母或数字" /></label><label>密码<input required autoComplete={register ? 'new-password' : 'current-password'} type="password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? '正在连接…' : register ? '注册并登录' : '登录交易所'}</button><button type="button" className="text-button" onClick={() => setRegister(!register)}>{register ? '已有账户，直接登录' : '还没账户？注册领取虚拟资产'}</button><p className="hint">上线公共服务时填写运营者提供的 HTTPS 地址。角色模型、对话与 AI 密钥不会发给交易所。</p>{error && <pre className="error" role="alert">{error}</pre>}</form></main>;

  const equity = account ? account.availableCents + account.frozenCents + account.positions.reduce((sum, position) => {const stock = stocks.find(item => item.code === position.stockCode)!;return sum + (position.available + position.frozen) * (stock.lastCents ?? stock.referenceCents);}, 0) : 0;
  // 行情占据主界面，账户和托管设置改为顶部页签，移除两侧栏。
  return <div className={`workbench terminal-workbench ${tab}-view`}>
    <div className="workbench-topbar"><nav aria-label="工作台功能">{[['market','行情'],['trades','交易记录'],['assistant','账户与托管'],['character','我的小秘书'],['memory','共同记忆']].map(([key, label]) => <button aria-pressed={tab === key} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav><button className="workbench-logout" disabled={busy} onClick={() => perform(logout)}>退出账户</button></div>
    <main className="workspace"><div className="workbench-status"><span><span className="status-dot" />{profile!.auto ? '宠物正在营业' : '宠物待命中'} · {session.username}</span><span title={session.url}>{updated}</span></div>
      {error && <div className="error-box" role="alert"><button className="text-button" onClick={() => setError('')}>收起错误</button><pre>{error}</pre><p>撤单或下单失败时，服务器已有挂单仍可能成交。请核对后再操作。</p></div>}
      {tab === 'assistant' && <div className="summary"><div><span>账户总资产</span><strong>{account ? money(equity) : '—'}<small>虚拟元</small></strong><p>{account ? `相对初始资产 ${money(equity - account.initialEquityCents)}` : '等待交易所数据'}</p></div><div><span>可用现金</span><strong>{account ? money(account.availableCents) : '—'}</strong><p>冻结 {account ? money(account.frozenCents) : '—'}</p></div><div><span>小秘书的信任</span><strong>{profile!.trust}<small>/ 100</small></strong><p>它记得被怎样对待</p></div></div>}
      <div className="workbench-panels">{tab !== 'assistant' && <div className="content-column">
        {tab === 'market' && account && <TradingPanel stocks={stocks} account={account} orders={orders} profile={profile!} book={book} selected={selected} select={code => {selectedRef.current = code;setSelected(code);setBook(null);perform(async () => setBook(await api<Book>('GET', `/api/stocks/${code}/book`)));}} cancel={id => perform(async () => {await api('DELETE', `/api/orders/${id}`);await mutate(value => remember(value, 'command', `老板撤销委托 #${id}`));await synchronize();})} ban={code => perform(() => ban(code))} busy={busy} place={async intent => {await perform(() => placeManualOrder(intent));}} />}
        {tab === 'market' && !account && <section className="surface empty">正在读取公共市场和账户…</section>}
        {tab === 'trades' && <TradeHistory />}
        {tab === 'character' && <CharacterImport characters={characters} current={profile!.character} live2dReady={live2dReady} change={changeCharacter} importFile={importFile} preview={speak} save={async character => {await window.desktop.saveCharacter(character);setCharacters(items => items.map(item => item.id === character.id ? character : item));await speak('happy', '角色包配置已经保存在本机。');}} />}
        {tab === 'memory' && <section className="surface"><div className="section-head"><div><h2>共同经历</h2><p>保存在这台电脑，交易所看不到。</p></div><span className="badge">{profile!.memories.length} 条</span></div>{profile!.memories.length === 0 && <p className="empty">你们的第一段经历还没发生。先让它开始营业吧。</p>}<div className="memory-list">{profile!.memories.slice(-80).reverse().map(memory => <article key={memory.id}><time>{new Date(memory.time).toLocaleString('zh-CN')}</time><p>{memory.text}</p></article>)}</div></section>}
      </div>}{tab === 'assistant' && <section className="assistant-settings"><section className="pet-card"><span className="caption">{profile!.character.name} / 你的专属小秘书（{aiConfig.enabled ? '本地 AI 驱动中' : '本地预设规则'}）</span><button className="primary" disabled={busy || (!profile!.auto && profile!.pendingOrder !== null)} onClick={() => perform(toggleAuto)}>{profile!.auto ? '暂停并撤销挂单' : '让它开始营业'}</button><label>交易资金上限 · 虚拟元<div className="budget"><input type="number" min="0" step="0.01" value={budget} onChange={event => setBudget(event.target.value)} /><button disabled={busy} onClick={() => perform(async () => {const cents = Math.round(Number(budget) * 100);if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('资金上限必须为非负金额');await mutate(value => remember({...value, budgetCents: cents}, 'command', `老板把交易预算改为 ${money(cents)}，只影响后续买单。`));await speak('idle', '新预算记下了，已经挂出的单子不会因此自动撤销。');})}>保存</button></div></label><p className="hint">每分钟决定一次，每次最多使用可用现金的 20%。暂停会请求撤单，退出账户会保留挂单。</p></section>
        <section className="surface">
          <div className="section-head"><div><h2>小秘书人设与互动对话</h2><p>开启本地 AI 后，小秘书平时会主动找你搭话闲聊；对话与人设只保存在本机。</p></div>{aiConfig.enabled && <button type="button" disabled={busy} onClick={() => perform(() => triggerProactiveChat('老板点了一下你，主动跟老板聊两句'))}>让它主动找我聊聊</button>}</div>
          <label>小秘书性格与人设设定<div className="budget"><input value={persona} maxLength={160} onChange={event => setPersona(event.target.value)} placeholder="例如：嘴硬、爱邀功、实际对老板非常负责的交易小秘书" /><button type="button" disabled={busy} onClick={() => perform(savePersonaSetting)}>保存人设</button></div></label>
          <form className="chat-form" onSubmit={sendChat}>
            <label>跟小秘书说句话<div className="budget"><input value={chatText} maxLength={160} onChange={event => setChatText(event.target.value)} placeholder="问问它的持仓想法、表扬或者随便聊聊天…" /><button className="primary" disabled={busy || !chatText.trim()}>发送</button></div></label>
          </form>
          {profile!.memories.some(item => item.kind === 'chat') && <div className="chat-history">
            <span className="caption">最近聊天记录（包含小秘书主动搭话）</span>
            {profile!.memories.filter(item => item.kind === 'chat').slice(-6).reverse().map(item => <p key={item.id}><time>{new Date(item.time).toLocaleTimeString('zh-CN')}</time>{item.text}</p>)}
          </div>}
        </section>
        <section className="surface">
          <div className="section-head"><div><h2>本地 AI 接口配置</h2><p>支持本地 LM Studio / Ollama（无需密钥）及云端 OpenAI 兼容接口；密钥经系统加密保存，不发给交易所。</p></div><span className="badge">{aiConfig.hasApiKey ? '已加密保存密钥' : '无密钥 / 本地模式'}</span></div>
          <label className="checkbox-row"><input type="checkbox" checked={aiEnabled} onChange={event => setAIEnabled(event.target.checked)} />启用本地 AI 驱动（自主交易决策、个性化复盘与人设对话）</label>
          <div className="field-row">
            <label>对话接口地址（支持 `/v1` 自动补全）<input type="url" value={aiEndpoint} onChange={event => setAIEndpoint(event.target.value)} placeholder="如 http://localhost:1234/v1 或完整 /v1/chat/completions" /></label>
            <label>对话模型名称（填 API 模型标识符）<input value={aiModel} onChange={event => setAIModel(event.target.value)} placeholder="如 qwen-2.5-7b-instruct-novel-lora" /></label>
          </div>
          <div className="field-row">
            <label>生图接口地址（可选，用于追加新动作精灵图）<input type="url" value={aiImageEndpoint} onChange={event => setAIImageEndpoint(event.target.value)} placeholder="留空则用内置精灵图合成器；或填 /v1/images/generations" /></label>
            <label>生图模型名称（可选）<input value={aiImageModel} onChange={event => setAIImageModel(event.target.value)} placeholder="留空使用内置动作图合成，或填生图模型名" /></label>
          </div>
          <label>API Key（本地模型如 LM Studio 可直接留空；{aiConfig.hasApiKey ? '留空保留已有密钥' : '云端接口请填密钥'}）<input type="password" value={aiKey} onChange={event => setAIKey(event.target.value)} placeholder={aiConfig.hasApiKey ? '••••••••（已加密保存，留空不变）' : '本地模型留空即可，云端接口填 API Key'} /></label>
          <div className="reactions">
            <button type="button" className="primary" disabled={busy} onClick={() => perform(saveAISetting)}>保存 AI 配置</button>
            <button type="button" disabled={busy || !aiEndpoint.trim() || !aiModel.trim()} onClick={() => perform(testAISetting)}>测试 AI 连接</button>
          </div>
          {aiStatus && <p className="notice">{aiStatus}</p>}
          <p className="hint">AI 委托仍受本地单次 20% 限额、总预算上限、禁买名单及当日涨跌停双重校验；无候选可交易股票时自动跳过 AI 调用以节省 Token。</p>
        </section>
        {profile!.pendingOrder && <section className="surface pending"><h2>有一笔委托待核对</h2><p>未确认前停止自动创建新单。</p><code>{profile!.pendingOrder.clientOrderId}</code><button disabled={busy} onClick={() => perform(reconcile)}>查询交易所记录</button><button disabled={busy || !profile!.auto} onClick={() => perform(submitPending)}>用原编号重新提交</button><button disabled={busy} onClick={() => perform(abandonPending)}>放弃并取消原委托</button></section>}
        {profile!.review && <section className="surface"><span className="eyebrow">小秘书的复盘</span><p>{profile!.review.text}</p><div className="reactions">{(['praise','comfort','criticize'] as const).map((kind, index) => <button key={kind} disabled={busy || profile!.review!.reacted} onClick={() => perform(() => reaction(kind))}>{['表扬','安慰','批评'][index]}</button>)}</div></section>}
      </section>}</div><footer>这是虚拟交易游戏。没有真实充值、证券或提现。关闭客户端不等于撤单。</footer>
    </main>
  </div>;
}
