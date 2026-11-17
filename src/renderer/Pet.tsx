import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { PetMotion, Visual } from '../shared/types';
import { SpritePet } from './characters/SpritePet';
import { Live2DPet } from './characters/Live2DPet';
import { SequencePet } from './characters/SequencePet';

export function Pet({visual, motion = 'idle', draggable = false}: {visual: Visual; motion?: PetMotion; draggable?: boolean}) {
  const [touching, setTouching] = useState(false);
  const [speechVisible, setSpeechVisible] = useState(true);
  const touchTimer = useRef<number | undefined>(undefined);
  const drag = useRef<{x: number; y: number} | null>(null);
  const dragged = useRef(false);
  const speech = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLButtonElement>(null);
  // 女仆鲸鱼娘使用竖幅素材，给到 300px 高度，其余角色保持现有大小。
  const artHeight = visual.character.id === 'jyn' ? 300 : 190;
  const artWidth = visual.character.type === 'sequence' ? Math.round(artHeight * visual.character.aspectRatio) : 190;
  const bodyWidth = Math.max(205, artWidth);
  const hasRealWalk = Boolean(
    visual.character.animations?.walkLeft &&
    visual.character.animations?.walkRight &&
    visual.character.animations.walkLeft[0]?.file !== visual.character.animations.idle?.[0]?.file &&
    visual.character.animations.walkLeft[0]?.file !== visual.character.animations.walkRight[0]?.file
  );
  useEffect(() => () => clearTimeout(touchTimer.current), []);
  useEffect(() => {
    // 每次收到话语重新显示，六秒后隐藏；切换话语或卸载时清除旧计时器。
    setSpeechVisible(true);
    const timer = setTimeout(() => setSpeechVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [visual]);
  useEffect(() => {
    if (!draggable) return;
    // 气泡的实际高度决定外框大小，文本换行后重新测量，不保留隐藏占位。
    const report = () => {void window.desktop.petLayout({speechHeight: speechVisible ? Math.ceil(speech.current!.getBoundingClientRect().height) : 0, width: bodyWidth, height: artHeight});};
    const observer = new ResizeObserver(report);
    observer.observe(speech.current!);
    report();
    return () => observer.disconnect();
  }, [draggable, speechVisible, visual.text, bodyWidth, artHeight]);
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
  function touch() {
    clearTimeout(touchTimer.current);
    setTouching(true);
    const duration = visual.character.type === 'sequence' ? visual.character.animations!.touch.reduce((sum, frame) => sum + frame.durationMs, 0) : 1500;
    touchTimer.current = window.setTimeout(() => setTouching(false), duration);
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    touch();
    dragged.current = false;
    if (!draggable || event.button !== 0) return;
    // 捕获指针后，鼠标离开角色仍可继续拖动并收到松开事件。
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {x: event.screenX, y: event.screenY};
    void window.desktop.dragPet('start');
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    if (Math.hypot(event.screenX - drag.current.x, event.screenY - drag.current.y) >= 4) {
      dragged.current = true;
      clearTimeout(touchTimer.current);
      setTouching(false);
    }
    if (dragged.current) void window.desktop.dragPet('move');
  }
  function endDrag(cancelled: boolean) {
    if (!drag.current) return;
    drag.current = null;
    void window.desktop.dragPet(cancelled ? 'cancel' : 'end');
  }
  return <div className="pet-scene" style={{'--pet-art-width': `${artWidth}px`, '--pet-art-height': `${artHeight}px`, '--pet-body-width': `${bodyWidth}px`} as CSSProperties}>
    <div ref={speech} className={`pet-speech${speechVisible ? '' : ' pet-speech-hidden'}`} role="status" aria-hidden={!speechVisible} title={visual.text}><span aria-hidden="true" className="pet-speech-heart">♡</span><span className="pet-speech-text">{visual.text}</span></div>
    <button ref={body} className="pet-body" data-motion={motion} data-walk-mode={hasRealWalk ? 'native' : 'procedural'} aria-label={draggable ? '拖动宠物或点击打开气泡面板' : '摸摸宠物'} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => endDrag(false)} onPointerCancel={() => endDrag(true)} onLostPointerCapture={() => endDrag(true)} onClick={event => {if (draggable && (event.detail === 0 || !dragged.current)) void window.desktop.showPanel();else if (event.detail === 0) touch();}}>
      {visual.character.type === 'sequence'
        ? <SequencePet character={visual.character} emotion={visual.emotion} motion={motion} touching={touching} width={artWidth} height={artHeight} />
        : visual.character.type === 'sprite' ? <SpritePet character={visual.character} emotion={touching ? 'happy' : visual.emotion} /> : <Live2DPet character={visual.character} emotion={visual.emotion} />}
    </button>
  </div>;
}
