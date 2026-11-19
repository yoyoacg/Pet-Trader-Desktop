export const emotions = ['idle', 'thinking', 'happy', 'sad', 'angry', 'proud', 'surprised', 'sleepy', 'working'] as const;
export type Emotion = ("idle" | "thinking" | "happy" | "sad" | "angry" | "proud" | "surprised" | "sleepy" | "working");
export interface Stock { code: string; name: string; referenceCents: number; lastCents: number | null; volume: number; previousCloseCents: number; lowerLimitCents: number; upperLimitCents: number }
export interface Candle { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface Position { stockCode: string; available: number; frozen: number }
export interface Account { availableCents: number; frozenCents: number; initialEquityCents: number; positions: Position[] }
export interface OrderIntent { clientOrderId: string; stockCode: string; side: 'buy' | 'sell'; priceCents: number; quantity: number }
export interface Order extends OrderIntent { id: number; remaining: number; status: 'open' | 'filled' | 'cancelled'; createdAt: string }
export interface Trade { id: number; stockCode: string; priceCents: number; quantity: number; side: 'buy' | 'sell'; createdAt: string }
export interface Book { bids: {priceCents: number; quantity: number}[]; asks: {priceCents: number; quantity: number}[] }
export interface Memory { id: string; time: string; kind: 'decision' | 'trade' | 'command' | 'reaction'; text: string; stockCode?: string }
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
  source?: { name: string; url: string; notice: string };
}
export interface Profile {
  auto: boolean; banned: string[]; budgetCents: number; trust: number; cycles: number;
  memories: Memory[]; lastTradeId: number; review: Review | null;
  pendingOrder: OrderIntent | null; character: Character;
}
export interface Session { url: string; username: string; userId: number }
export interface Visual { character: Character; emotion: Emotion; text: string }
export interface ResponseData<T> { ok: boolean; status: number; body: T & {error?: string; details?: string} }
export interface Bootstrap { session: Session | null; profile: Profile | null; characters: Character[]; live2dReady: boolean }

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
      importCharacter(): Promise<Character | null>;
      saveCharacter(character: Character): Promise<void>;
      publish(visual: Visual): Promise<void>;
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
