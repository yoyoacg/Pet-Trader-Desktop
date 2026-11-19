import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, MouseEvent, PointerEvent } from 'react';
import type { PetMotion, Visual } from '../shared/types';
import { SpritePet } from './characters/SpritePet';
import { Live2DPet } from './characters/Live2DPet';
import { SequencePet } from './characters/SequencePet';
import { PuppetPet } from './characters/PuppetPet';
import type { PuppetInteraction, PuppetInteractionKind } from './characters/PuppetPet';

const HEADPAT_LINES = [
  '唔…头顶被摸得好舒服，尾巴都要翘起来了喵~',
  '老板再多摸两下，待会儿帮你多盯几档盘口！',
  '喵呜…耳朵要被揉塌啦，只准老板摸哦。',
];
const POKE_LINES = [
  '哇！小鲸鱼吊坠差点被你戳到啦！',
  '干嘛突然戳我啦，行情正好看得入神呢~',
  '唔？老板找我有事吗，双击我可以打开工作台哦！',
];
const TAIL_LINES = [
  '呀！不准随便拉猫尾巴，会炸毛的！',
  '哼！尾巴是敏感部位，再碰我要记到小本本上了！',
  '喂！蓝鲸尾环可不是按钮啦！',
];
const DRAG_LINES = [
  '哇哇别拎这么高呀！裙摆要飘起来了！',
  '要搬去桌面哪个角落呀？轻一点放下我嘛~',
];
const pickLine = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

export function Pet({visual, motion = 'idle', draggable = false}: {visual: Visual; motion?: PetMotion; draggable?: boolean}) {
  const [touching, setTouching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [interaction, setInteraction] = useState<PuppetInteraction>({kind: null, seq: 0});
  const [tempBubble, setTempBubble] = useState<string | null>(null);
  const [speechVisible, setSpeechVisible] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const touchTimer = useRef<number | undefined>(undefined);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const actionTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{x: number; y: number} | null>(null);
  const dragged = useRef(false);
  const rub = useRef<{lastX: number; accum: number; lastTrigger: number}>({lastX: -1, accum: 0, lastTrigger: 0});
  const speech = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLButtonElement>(null);
  const chatBox = useRef<HTMLFormElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // 女仆鲸鱼娘使用竖幅素材，给到 300px 高度；动态人偶使用 270px 竖幅，其余角色保持现有大小。
  const artHeight = visual.character.id === 'jyn' ? 300 : visual.character.type === 'puppet' ? 270 : 190;
  const artWidth = visual.character.type === 'sequence' || visual.character.type === 'puppet' ? Math.round(artHeight * visual.character.aspectRatio) : 190;
  const bodyWidth = Math.max(205, artWidth);
  const hasRealWalk = Boolean(
    (visual.character.type === 'puppet' && (visual.character.puppet?.walk?.length ?? 0) >= 2) ||
    (visual.character.animations?.walkLeft &&
    visual.character.animations?.walkRight &&
    visual.character.animations.walkLeft[0]?.file !== visual.character.animations.idle?.[0]?.file &&
    visual.character.animations.walkLeft[0]?.file !== visual.character.animations.walkRight[0]?.file)
  );
  const walkMode = visual.character.type === 'puppet' && hasRealWalk ? 'puppet' : hasRealWalk ? 'native' : 'procedural';
  const displayText = tempBubble ?? visual.text;

  useEffect(() => () => {
    clearTimeout(touchTimer.current);
    clearTimeout(bubbleTimer.current);
    clearTimeout(actionTimer.current);
  }, []);

  useEffect(() => {
    if (!visual.action) return;
    const actionName = visual.action.name;
    const holdMs = visual.action.durationMs ?? 4500;
    clearTimeout(actionTimer.current);
    setActiveAction(actionName);
    if (actionName === 'headpat' || actionName === 'poke' || actionName === 'tail') {
      triggerInteraction(actionName, holdMs);
    }
    if (body.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (actionName === 'jump' || Boolean(visual.character.customActions?.[actionName])) {
        body.current.animate(
          [
            {transform: 'translateY(0) scale(1, 1)'},
            {transform: 'translateY(-18px) scale(0.95, 1.06)'},
            {transform: 'translateY(0) scale(1.06, 0.94)'},
            {transform: 'translateY(-10px) scale(0.98, 1.03)'},
            {transform: 'translateY(0) scale(1, 1)'},
          ],
          {duration: 680, easing: 'ease-out'},
        );
      } else if (actionName === 'spin') {
        body.current.animate(
          [
            {transform: 'rotate(0deg) scale(1)'},
            {transform: 'rotate(-14deg) scale(1.04) translateY(-6px)'},
            {transform: 'rotate(14deg) scale(1.04) translateY(-6px)'},
            {transform: 'rotate(-8deg) scale(1.02)'},
            {transform: 'rotate(0deg) scale(1)'},
          ],
          {duration: 760, easing: 'ease-in-out'},
        );
      } else if (actionName === 'bow') {
        body.current.animate(
          [
            {transform: 'rotate(0deg) translateY(0)'},
            {transform: 'rotate(12deg) translateY(8px) scale(1.03, 0.94)'},
            {transform: 'rotate(12deg) translateY(8px) scale(1.03, 0.94)'},
            {transform: 'rotate(0deg) translateY(0)'},
          ],
          {duration: 850, easing: 'ease-in-out'},
        );
      } else if (actionName === 'shake') {
        body.current.animate(
          [
            {transform: 'translateX(0)'},
            {transform: 'translateX(-8px) rotate(-4deg)'},
            {transform: 'translateX(8px) rotate(4deg)'},
            {transform: 'translateX(-6px) rotate(-3deg)'},
            {transform: 'translateX(6px) rotate(3deg)'},
            {transform: 'translateX(0)'},
          ],
          {duration: 540, easing: 'ease-in-out'},
        );
      }
    }
    actionTimer.current = window.setTimeout(() => setActiveAction(null), holdMs);
  }, [visual.action?.seq]);

  useEffect(() => {
    // 收到新的交易/系统/AI主动搭话时清除本地临时交互气泡，展示 10 秒便于老板阅读。
    setTempBubble(null);
    setSpeechVisible(true);
    const timer = setTimeout(() => setSpeechVisible(false), 10000);
    return () => clearTimeout(timer);
  }, [visual]);

  useEffect(() => {
    if (chatOpen) chatInputRef.current?.focus();
  }, [chatOpen]);

  useEffect(() => {
    if (!draggable) return;
    // 顶部气泡与点击桌宠后展开的下方对话输入框实际高度决定外框大小。
    const report = () => {
      const speechH = speechVisible ? Math.ceil(speech.current!.getBoundingClientRect().height) : 0;
      const chatH = chatOpen && chatBox.current ? Math.ceil(chatBox.current.getBoundingClientRect().height) + 6 : 0;
      void window.desktop.petLayout({speechHeight: speechH, width: chatOpen ? Math.max(225, bodyWidth) : bodyWidth, height: artHeight + chatH});
    };
    const observer = new ResizeObserver(report);
    observer.observe(speech.current!);
    if (chatOpen && chatBox.current) observer.observe(chatBox.current);
    report();
    return () => observer.disconnect();
  }, [draggable, speechVisible, chatOpen, displayText, bodyWidth, artHeight]);

  useEffect(() => {
    if (!draggable) return;
    return window.desktop.onPetImpact(({axis, speed}) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // 撞击越快压缩越明显，回弹只改变姿势，不改变窗口和人偶的基础尺寸。
      const compressed = .8 - Math.min(speed / 1500, 1) * .25;
      const stretched = 1 + (1 - compressed) * .15;
      const transform = axis === 'x' ? `scale(${compressed}, ${stretched})` : `scale(${stretched}, ${compressed})`;
      body.current!.animate([{transform}, {transform: 'scale(1, 1)'}], {duration: 280, easing: 'cubic-bezier(.34,1.56,.64,1)'});
    });
  }, [draggable]);

  function showTempBubble(text: string, holdMs = 2600) {
    clearTimeout(bubbleTimer.current);
    setTempBubble(text);
    setSpeechVisible(true);
    bubbleTimer.current = window.setTimeout(() => {
      setTempBubble(null);
      setSpeechVisible(false);
    }, holdMs);
  }

  function triggerInteraction(kind: PuppetInteractionKind, durationMs: number, lines?: string[]) {
    clearTimeout(touchTimer.current);
    setInteraction(prev => ({kind, seq: prev.seq + 1}));
    setTouching(kind === 'headpat');
    if (lines && draggable) showTempBubble(pickLine(lines));
    const fallbackDuration = visual.character.type === 'sequence'
      ? visual.character.animations!.touch.reduce((sum, frame) => sum + frame.durationMs, 0)
      : durationMs;
    touchTimer.current = window.setTimeout(() => {
      setInteraction(prev => ({kind: null, seq: prev.seq}));
      setTouching(false);
    }, fallbackDuration);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    dragged.current = false;
    if (!draggable || event.button !== 0) return;
    // 捕获指针后，鼠标离开角色仍可继续拖动并收到松开事件。
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {x: event.screenX, y: event.screenY};
    void window.desktop.dragPet('start');
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) {
      // 未按下时在头顶区域来回滑动触发连续抚摸撸猫。
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.height <= 0) return;
      const ratio = (event.clientY - rect.top) / rect.height;
      if (ratio < 0.38) {
        if (rub.current.lastX >= 0) rub.current.accum += Math.abs(event.clientX - rub.current.lastX);
        rub.current.lastX = event.clientX;
        const now = performance.now();
        if (rub.current.accum >= 55 && now - rub.current.lastTrigger >= 1200) {
          rub.current.accum = 0;
          rub.current.lastTrigger = now;
          triggerInteraction('headpat', 2000, HEADPAT_LINES);
        }
      } else {
        rub.current.lastX = -1;
        rub.current.accum = 0;
      }
      return;
    }
    if (Math.hypot(event.screenX - drag.current.x, event.screenY - drag.current.y) >= 4) {
      if (!dragged.current && draggable) showTempBubble(pickLine(DRAG_LINES), 2400);
      dragged.current = true;
      setDragging(true);
      clearTimeout(touchTimer.current);
      setInteraction(prev => ({kind: null, seq: prev.seq}));
      setTouching(false);
    }
    if (dragged.current) void window.desktop.dragPet('move');
  }

  function endDrag(cancelled: boolean) {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    void window.desktop.dragPet(cancelled ? 'cancel' : 'end');
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) {
      if (draggable) void window.desktop.showPanel();
      else triggerInteraction('headpat', 1800);
      return;
    }
    if (dragged.current || event.detail >= 2) return;
    // 单击桌宠时切换显示下方对话输入框，并按点击部位触发互动反馈；双击或右键打开工作台。
    setChatOpen(prev => !prev);
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.2;
    if (ratio < 0.36) triggerInteraction('headpat', 2200, HEADPAT_LINES);
    else if (ratio < 0.60) triggerInteraction('poke', 1800, POKE_LINES);
    else triggerInteraction('tail', 2000, TAIL_LINES);
  }

  function submitQuickChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    setChatInput('');
    setChatOpen(false);
    showTempBubble('唔…让我想想怎么回老板…', 15000);
    void window.desktop.sendPetChat(text);
  }

  return <div className="pet-scene" style={{'--pet-art-width': `${artWidth}px`, '--pet-art-height': `${artHeight}px`, '--pet-body-width': `${bodyWidth}px`} as CSSProperties}>
    <div ref={speech} className={`pet-speech${speechVisible ? '' : ' pet-speech-hidden'}`} role="status" aria-hidden={!speechVisible} title={displayText}><span aria-hidden="true" className="pet-speech-heart">♡</span><span className="pet-speech-text">{displayText}</span></div>
    <button
      ref={body}
      className="pet-body"
      data-motion={motion}
      data-walk-mode={walkMode}
      aria-label={draggable ? '点击互动、头顶抚摸、拖动拎起，双击或右键打开工作台' : '点击互动或头顶抚摸小秘书'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {setHovered(false); rub.current.lastX = -1; rub.current.accum = 0;}}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={() => endDrag(false)}
      onPointerCancel={() => endDrag(true)}
      onLostPointerCapture={() => endDrag(true)}
      onClick={handleClick}
      onDoubleClick={() => {if (draggable) void window.desktop.showPanel();}}
      onContextMenu={event => {event.preventDefault(); if (draggable) void window.desktop.showPanel();}}
    >
      {visual.character.type === 'sequence'
        ? <SequencePet character={visual.character} emotion={visual.emotion} motion={motion} touching={touching} actionClip={activeAction} width={artWidth} height={artHeight} />
        : visual.character.type === 'puppet'
          ? <PuppetPet character={visual.character} emotion={visual.emotion} motion={motion} touching={touching} dragging={dragging} draggable={draggable} interaction={interaction} actionPose={activeAction} hovered={hovered} width={artWidth} height={artHeight} />
          : visual.character.type === 'sprite'
            ? <SpritePet character={visual.character} emotion={touching ? 'happy' : visual.emotion} customSpriteUrl={activeAction ? visual.character.customActions?.[activeAction] : null} />
            : <Live2DPet character={visual.character} emotion={visual.emotion} touching={touching} interaction={interaction} actionName={activeAction} width={artWidth} height={artHeight} />}
    </button>
    {chatOpen && <form ref={chatBox} className="pet-chat-bubble" onSubmit={submitQuickChat}>
      <input
        ref={chatInputRef}
        className="pet-chat-input"
        value={chatInput}
        maxLength={160}
        onChange={event => setChatInput(event.target.value)}
        onKeyDown={event => {if (event.key === 'Escape') setChatOpen(false);}}
        placeholder="和它说句话…"
        aria-label="在人偶下方直接输入与小秘书对话"
      />
      <button type="submit" className="pet-chat-send" disabled={!chatInput.trim()}>发送</button>
    </form>}
  </div>;
}
