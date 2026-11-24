export const emotions = ['idle', 'thinking', 'happy', 'sad', 'angry', 'proud', 'surprised', 'sleepy', 'working'] as const;
export type Emotion = ("idle" | "thinking" | "happy" | "sad" | "angry" | "proud" | "surprised" | "sleepy" | "working");
export interface Stock { code: string; name: string; referenceCents: number; lastCents: number | null; volume: number; previousCloseCents: number; lowerLimitCents: number; upperLimitCents: number }
export interface Candle { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface Position { stockCode: string; available: number; frozen: number }
export interface Account { availableCents: number; frozenCents: number; initialEquityCents: number; issuedCustomStocks?: number; positions: Position[] }
export interface OrderIntent { clientOrderId: string; stockCode: string; side: 'buy' | 'sell'; priceCents: number; quantity: number }
export interface Order extends OrderIntent { id: number; remaining: number; status: 'open' | 'filled' | 'cancelled'; createdAt: string }
export interface Trade { id: number; stockCode: string; priceCents: number; quantity: number; side: 'buy' | 'sell'; createdAt: string }
export interface Book { bids: {priceCents: number; quantity: number}[]; asks: {priceCents: number; quantity: number}[] }
export interface Memory { id: string; time: string; kind: 'decision' | 'trade' | 'command' | 'reaction' | 'chat'; text: string; stockCode?: string }
export interface Review { id: string; text: string; reacted: boolean }
export type LiveMapping = {kind: 'bubbleOnly'} | {kind: 'motion'; group: string; index: number} | {kind: 'expression'; name: string};
export type PetMotion = 'idle' | 'walkLeft' | 'walkRight';
export interface AnimationFrame { file: string; durationMs: number }
export interface PuppetConfig {
  poses: Record<string, string>;
  blink?: string;
  touch?: string;
  drag?: string;
  walk?: string[];
}
export interface Character {
  formatVersion: 1; id: string; name: string; author: string; license: string; type: 'sprite' | 'live2d' | 'sequence' | 'puppet'; entry: string; aspectRatio: number;
  states: Record<Emotion, number | LiveMapping | string>;
  motions: {group: string; index: number}[]; expressions: string[];
  animations?: Record<string, AnimationFrame[]>;
  puppet?: PuppetConfig;
  customActions?: Record<string, string>;
  source?: { name: string; url: string; notice: string };
}
export interface PetAction {
  name: string;
  seq: number;
  durationMs?: number;
}
export interface Profile {
  auto: boolean; banned: string[]; budgetCents: number; trust: number; cycles: number;
  persona: string; memories: Memory[]; lastTradeId: number; review: Review | null;
  pendingOrder: OrderIntent | null; character: Character;
}
export interface AIConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  imageEndpoint: string;
  imageModel: string;
  hasApiKey: boolean;
}
export interface AIConfigInput {
  enabled: boolean;
  endpoint: string;
  model: string;
  imageEndpoint?: string;
  imageModel?: string;
  apiKey: string;
}
export interface AICandidate {
  code: string;
  name: string;
  priceCents: number;
  lowerLimitCents: number;
  upperLimitCents: number;
  maxBuyQuantity: number;
  maxSellQuantity: number;
  availablePosition: number;
}
export interface AIDecideInput {
  persona: string;
  trust: number;
  availableCents: number;
  remainingBudgetCents: number;
  candidates: AICandidate[];
  recentMemories: string[];
}
export interface AIDecideOutput {
  action: 'buy' | 'sell' | 'hold';
  stockCode: string;
  priceCents: number;
  quantity: number;
  emotion: Emotion;
  dialogue: string;
  reason: string;
}
export interface AIChatInput {
  message: string;
  persona: string;
  trust: number;
  auto: boolean;
  equitySummary: string;
  recentMemories: string[];
  characterId: string;
  characterType: Character['type'];
  availableActions: string[];
}
export interface AIProactiveInput {
  time: string;
  trigger: string;
  persona: string;
  trust: number;
  auto: boolean;
  equitySummary: string;
  marketSummary: string;
  recentMemories: string[];
  characterId: string;
  characterType: Character['type'];
  availableActions: string[];
}
export interface AIChatOutput {
  emotion: Emotion;
  reply: string;
  action?: string;
  generatedAction?: { name: string; character: Character };
}
export interface AIReviewInput {
  cycles: number;
  persona: string;
  trust: number;
  tradeCount: number;
  criticism: string;
  recentMemories: string[];
}
export interface Session { url: string; username: string; userId: number }
export interface Visual { character: Character; emotion: Emotion; text: string; action?: PetAction }
export interface ResponseData<T> { ok: boolean; status: number; body: T & {error?: string; details?: string} }
export interface Bootstrap { session: Session | null; profile: Profile | null; characters: Character[]; live2dReady: boolean; aiConfig: AIConfig }

// 这里只声明允许访问的桌面桥接，渲染页面不能读取任意磁盘或获取登录令牌。
declare global {
  interface Window {
    PIXI: unknown;
    Live2DCubismCore: unknown;
    desktop: {
      bootstrap(): Promise<Bootstrap>;
      login(input: {url: string; username: string; password: string; register: boolean}): Promise<Bootstrap>;
      logout(): Promise<void>;
      request<T>(method: string, path: string, body?: unknown): Promise<ResponseData<T>>;
      saveProfile(profile: Profile): Promise<void>;
      saveAIConfig(input: AIConfigInput): Promise<AIConfig>;
      testAIConfig(input: {endpoint: string; model: string; apiKey: string}): Promise<{model: string; emotion: Emotion; reply: string}>;
      aiDecide(input: AIDecideInput): Promise<AIDecideOutput>;
      aiChat(input: AIChatInput): Promise<AIChatOutput>;
      aiProactiveChat(input: AIProactiveInput): Promise<AIChatOutput>;
      aiReview(input: AIReviewInput): Promise<{emotion: Emotion; text: string}>;
      importCharacter(): Promise<Character | null>;
      saveCharacter(character: Character): Promise<void>;
      publish(visual: Visual): Promise<void>;
      sendPetChat(text: string): Promise<void>;
      onPetChat(callback: (text: string) => void): () => void;
      onVisual(callback: (visual: Visual) => void): () => void;
      onMotion(callback: (motion: PetMotion) => void): () => void;
      onGaze(callback: (gaze: {x: number; y: number}) => void): () => void;
      showPanel(): Promise<void>;
      hidePanel(): Promise<void>;
      panelActivity(): Promise<void>;
      dragPet(phase: 'start' | 'move' | 'end' | 'cancel'): Promise<void>;
      petLayout(layout: {speechHeight: number; width: number; height: number}): Promise<void>;
      onPetImpact(callback: (impact: {axis: 'x' | 'y'; speed: number}) => void): () => void;
      openVPetSource(): Promise<void>;
    };
  }
}
