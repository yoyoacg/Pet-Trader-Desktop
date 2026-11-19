import { useEffect, useRef, useState } from 'react';
import type { Application, Graphics, SimplePlane, Texture } from 'pixi.js';
import type { Character, Emotion, PetMotion } from '../../shared/types';

export type PuppetInteractionKind = 'headpat' | 'poke' | 'tail' | 'drag';

export interface PuppetInteraction {
  kind: PuppetInteractionKind | null;
  seq: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: 'heart' | 'star' | 'bubble' | 'zzz' | 'drop' | 'anger' | 'spark';
  color: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const bell = (x: number, start: number, end: number) => {
  const mid = (start + end) * 0.5;
  return smoothstep(start, mid, x) * (1 - smoothstep(mid, end, x));
};

async function loadImage(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`读取角色姿态图片失败：${response.status} ${url}`);
  // 通过同源 blob URL 解码图片，避免开发环境 http:// 与 petasset:// 跨源导致 WebGL texImage2D 报错。
  const objectURL = URL.createObjectURL(await response.blob());
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`解码角色姿态图片失败：${url}`));
      img.src = objectURL;
    });
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}

function drawHeart(g: Graphics, x: number, y: number, r: number, color: number, alpha: number) {
  g.beginFill(color, alpha);
  g.moveTo(x, y + r * 0.6);
  g.bezierCurveTo(x - r * 1.2, y - r * 0.2, x - r * 0.7, y - r * 1.1, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.2, y - r * 0.2, x, y + r * 0.6);
  g.endFill();
}

function drawStar(g: Graphics, x: number, y: number, r: number, color: number, alpha: number) {
  g.beginFill(color, alpha);
  g.moveTo(x, y - r);
  g.lineTo(x + r * 0.28, y - r * 0.28);
  g.lineTo(x + r, y);
  g.lineTo(x + r * 0.28, y + r * 0.28);
  g.lineTo(x, y + r);
  g.lineTo(x - r * 0.28, y + r * 0.28);
  g.lineTo(x - r, y);
  g.lineTo(x - r * 0.28, y - r * 0.28);
  g.closePath();
  g.endFill();
}

function drawZ(g: Graphics, x: number, y: number, s: number, color: number, alpha: number) {
  g.lineStyle(Math.max(1.4, s * 0.22), color, alpha);
  g.moveTo(x - s * 0.5, y - s * 0.5);
  g.lineTo(x + s * 0.5, y - s * 0.5);
  g.lineTo(x - s * 0.5, y + s * 0.5);
  g.lineTo(x + s * 0.5, y + s * 0.5);
  g.lineStyle(0);
}

function drawAnger(g: Graphics, x: number, y: number, s: number, color: number, alpha: number) {
  g.lineStyle(Math.max(1.5, s * 0.22), color, alpha);
  const k = s * 0.3;
  const o = s * 0.75;
  g.moveTo(x - o, y - k); g.lineTo(x - k, y - k); g.lineTo(x - k, y - o);
  g.moveTo(x + k, y - o); g.lineTo(x + k, y - k); g.lineTo(x + o, y - k);
  g.moveTo(x + o, y + k); g.lineTo(x + k, y + k); g.lineTo(x + k, y + o);
  g.moveTo(x - k, y + o); g.lineTo(x - k, y + k); g.lineTo(x - o, y + k);
  g.lineStyle(0);
}

/**
 * PixiJS 准 Live2D 网格动态人偶渲染器：
 * 结合多姿态高清透明贴图与 SimplePlane 顶点变形，提供呼吸、全局视线跟随、
 * 猫耳/猫尾/裙摆摆动、多部位交互反馈、拖拽物理钟摆及平稳 12 帧行走。
 */
export function PuppetPet({
  character,
  emotion,
  motion,
  touching,
  dragging,
  draggable,
  interaction = { kind: null, seq: 0 },
  hovered = false,
  width,
  height,
}: {
  character: Character;
  emotion: Emotion;
  motion: PetMotion;
  touching: boolean;
  dragging: boolean;
  draggable: boolean;
  interaction?: PuppetInteraction;
  hovered?: boolean;
  width: number;
  height: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  // 最新交互状态通过 ref 同步给 60fps 渲染循环，避免重建 PixiJS 应用上下文。
  const stateRef = useRef({ emotion, motion, touching, dragging, interactionKind: interaction.kind, hovered });
  stateRef.current = { emotion, motion, touching, dragging, interactionKind: interaction.kind, hovered };

  const targetGaze = useRef({ x: 0, y: 0 });
  const pulseRef = useRef<{ jelly: number; ear: number; burstKind: Particle['kind'] | null }>({
    jelly: 0,
    ear: 0,
    burstKind: null,
  });
  const prevRef = useRef({ touching: false, emotion, seq: 0, hovered: false });

  useEffect(() => {
    if (interaction.seq !== prevRef.current.seq && interaction.kind) {
      if (interaction.kind === 'headpat') {
        pulseRef.current = { jelly: 1, ear: 1, burstKind: 'heart' };
      } else if (interaction.kind === 'poke') {
        pulseRef.current = { jelly: 0.85, ear: 0.9, burstKind: 'spark' };
      } else if (interaction.kind === 'tail') {
        pulseRef.current = { jelly: 0.9, ear: 1.1, burstKind: 'anger' };
      }
    } else if (touching && !prevRef.current.touching) {
      pulseRef.current = { jelly: 1, ear: 1, burstKind: 'heart' };
    } else if (emotion !== prevRef.current.emotion) {
      pulseRef.current.jelly = 0.65;
      pulseRef.current.burstKind =
        emotion === 'happy' ? 'heart'
          : emotion === 'proud' ? 'star'
            : emotion === 'surprised' ? 'spark'
              : emotion === 'angry' ? 'anger' : null;
    } else if (hovered && !prevRef.current.hovered) {
      pulseRef.current.ear = Math.max(pulseRef.current.ear, 0.8);
    }
    prevRef.current = { touching, emotion, seq: interaction.seq, hovered };
  }, [touching, emotion, interaction.seq, interaction.kind, hovered]);

  useEffect(() => {
    if (draggable && typeof window.desktop?.onGaze === 'function') {
      return window.desktop.onGaze(gaze => {
        targetGaze.current = gaze;
      });
    }
    // 面板模式或未启用全局信号时，根据页面指针位置估算注视方向。
    const onPointer = (event: PointerEvent) => {
      const rect = canvas.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.35;
      targetGaze.current = {
        x: clamp((event.clientX - cx) / 360, -1, 1),
        y: clamp((event.clientY - cy) / 360, -1, 1),
      };
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    return () => window.removeEventListener('pointermove', onPointer);
  }, [draggable]);

  useEffect(() => {
    let disposed = false;
    let app: Application | null = null;
    const textures = new Map<string, Texture>();
    let blinkTimer = 0;
    let blinkCloseTimer = 0;
    let earTimer = 0;
    let microTimer = 0;
    let microEndTimer = 0;
    let walkPhase = 0;
    let isBlinking = false;
    let idleMicroPose: string | null = null;

    async function init() {
      const puppet = character.puppet;
      if (!puppet) throw new Error(`角色 ${character.name} 缺少 puppet 姿态配置`);

      const entries = Object.entries(puppet.poses);
      const images = await Promise.all(
        entries.map(async ([key, file]) => [key, await loadImage(new URL(file, character.entry).href)] as const),
      );
      if (disposed) return;

      const PIXI = await import('pixi.js');
      // 适配禁用 unsafe-eval 的渲染进程 CSP。
      const { install } = await import('@pixi/unsafe-eval');
      install(PIXI);
      if (disposed || !canvas.current) return;

      for (const [key, img] of images) {
        textures.set(key, PIXI.Texture.from(img));
      }

      const idleKey = String(character.states.idle);
      const idleTex = textures.get(idleKey) ?? textures.values().next().value!;
      const texW = idleTex.width;
      const texH = idleTex.height;

      app = new PIXI.Application({
        view: canvas.current,
        width,
        height,
        resolution: window.devicePixelRatio,
        autoDensity: true,
        backgroundAlpha: 0,
        antialias: true,
      });

      const rig = new PIXI.Container();
      const baseScale = Math.min((width * 0.94) / texW, (height * 0.96) / texH);
      rig.position.set(width * 0.5, height * 0.96);
      rig.scale.set(baseScale);

      const plane: SimplePlane = new PIXI.SimplePlane(idleTex, 12, 16);
      plane.autoResize = false;
      plane.pivot.set(texW * 0.5, texH * 0.96);

      const posBuffer = plane.geometry.getBuffer('aVertexPosition');
      const basePositions = new Float32Array(posBuffer.data);
      const uvRatios = new Float32Array(basePositions.length);
      for (let i = 0; i < basePositions.length; i += 2) {
        uvRatios[i] = basePositions[i] / texW;
        uvRatios[i + 1] = basePositions[i + 1] / texH;
      }

      const fx = new PIXI.Graphics();
      rig.addChild(plane);
      app.stage.addChild(rig);
      app.stage.addChild(fx);

      const particles: Particle[] = [];
      let elapsedTotal = 0;
      let fxSpawnCooldown = 0;
      const curGaze = { x: 0, y: 0 };
      let swayAngle = 0;
      let swayVel = 0;
      let prevGazeX = 0;

      const scheduleBlink = () => {
        blinkTimer = window.setTimeout(() => {
          isBlinking = true;
          blinkCloseTimer = window.setTimeout(() => {
            isBlinking = false;
            scheduleBlink();
          }, 135);
        }, 2800 + Math.random() * 2700);
      };
      const scheduleEar = () => {
        earTimer = window.setTimeout(() => {
          pulseRef.current.ear = 0.75;
          scheduleEar();
        }, 3500 + Math.random() * 3500);
      };
      const microCandidates = ['thinking', 'happy'].filter(key => textures.has(key));
      const scheduleMicro = () => {
        if (microCandidates.length === 0) return;
        microTimer = window.setTimeout(() => {
          idleMicroPose = microCandidates[Math.floor(Math.random() * microCandidates.length)];
          microEndTimer = window.setTimeout(() => {
            idleMicroPose = null;
            scheduleMicro();
          }, 1800);
        }, 11000 + Math.random() * 7000);
      };
      scheduleBlink();
      scheduleEar();
      scheduleMicro();

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let lastWalkSwitch = performance.now();

      const emitParticle = (kind: Particle['kind'], color: number, x: number, y: number, vx: number, vy: number, size: number, maxLife: number) => {
        if (particles.length >= 18) particles.shift();
        particles.push({ x, y, vx, vy, life: 0, maxLife, size, kind, color });
      };

      app.ticker.add(() => {
        if (disposed || !app) return;
        const dt = Math.min(app.ticker.deltaMS / 1000, 0.05);
        elapsedTotal += dt;

        const {
          emotion: curEmotion,
          motion: curMotion,
          touching: isTouching,
          dragging: isDragging,
          interactionKind,
          hovered: isHovered,
        } = stateRef.current;

        const isWalking = curMotion !== 'idle';
        const now = performance.now();
        const walkCount = puppet.walk?.length ?? 0;
        const walkInterval = walkCount >= 6 ? 72 : 220;
        if (isWalking && now - lastWalkSwitch >= walkInterval) {
          walkPhase = (walkPhase + 1) % (walkCount || 1);
          lastWalkSwitch = now;
        } else if (!isWalking) {
          walkPhase = 0;
        }

        // 姿态选择优先级：拖拽 > 部位互动 > 摸头 > 走路 > 情绪/自发微动作与眨眼。
        let poseKey = String(character.states[curEmotion] ?? idleKey);
        if (isDragging && puppet.drag && textures.has(puppet.drag)) {
          poseKey = puppet.drag;
        } else if (interactionKind === 'headpat' && puppet.touch && textures.has(puppet.touch)) {
          poseKey = puppet.touch;
        } else if (interactionKind === 'poke' && textures.has('surprised')) {
          poseKey = 'surprised';
        } else if (interactionKind === 'tail' && textures.has('angry')) {
          poseKey = 'angry';
        } else if (isTouching && puppet.touch && textures.has(puppet.touch)) {
          poseKey = puppet.touch;
        } else if (isWalking && walkCount > 0) {
          poseKey = puppet.walk![walkPhase] ?? poseKey;
        } else if (curEmotion === 'idle') {
          if (isBlinking && puppet.blink && textures.has(puppet.blink)) {
            poseKey = puppet.blink;
          } else if (idleMicroPose && textures.has(idleMicroPose)) {
            poseKey = idleMicroPose;
          }
        }

        const nextTex = textures.get(poseKey) ?? idleTex;
        if (plane.texture !== nextTex) plane.texture = nextTex;

        const facing = curMotion === 'walkRight' ? -1 : 1;

        if (reducedMotion) {
          rig.scale.set(facing * baseScale, baseScale);
          rig.rotation = 0;
          rig.position.set(width * 0.5, height * 0.96);
          fx.clear();
          return;
        }

        const gazeAlpha = clamp(dt * 8, 0, 1);
        curGaze.x += (targetGaze.current.x - curGaze.x) * gazeAlpha;
        curGaze.y += (targetGaze.current.y - curGaze.y) * gazeAlpha;
        const gazeSpeedX = (curGaze.x - prevGazeX) / Math.max(dt, 0.008);
        prevGazeX = curGaze.x;

        if (isDragging) {
          const targetRot = clamp(-gazeSpeedX * 0.025, -0.14, 0.14);
          swayVel += (targetRot - swayAngle) * 40 * dt;
          swayVel *= Math.exp(-5 * dt);
          swayAngle += swayVel * dt;
        } else {
          swayAngle *= Math.exp(-10 * dt);
          swayVel = 0;
        }

        pulseRef.current.jelly *= Math.exp(-7 * dt);
        pulseRef.current.ear *= Math.exp(-11 * dt);
        if (pulseRef.current.jelly < 0.005) pulseRef.current.jelly = 0;
        if (pulseRef.current.ear < 0.005) pulseRef.current.ear = 0;

        const jelly = Math.sin(elapsedTotal * 18) * pulseRef.current.jelly * 0.055;
        // 走路期间取消外部容器旋转与上下抛跳，让 12 帧步态稳健平滑、不再前后摇摆。
        rig.position.set(width * 0.5, height * 0.96);
        rig.scale.set(facing * baseScale * (1 + jelly), baseScale * (1 - jelly * 0.8));
        rig.rotation = isWalking ? 0 : swayAngle;

        const breathFreq = curEmotion === 'sleepy' ? 1.15 : isTouching || curEmotion === 'happy' || interactionKind === 'headpat' ? 2.8 : 2.1;
        const breath = Math.sin(elapsedTotal * breathFreq);
        const tailFreq =
          interactionKind === 'headpat' || isTouching || curEmotion === 'happy' || curEmotion === 'proud' ? 4.6
            : interactionKind === 'tail' || curEmotion === 'angry' ? 5.2
              : isHovered ? 3.4
                : curEmotion === 'sad' || curEmotion === 'sleepy' ? 1.4 : 2.6;
        const tailAmp =
          interactionKind === 'headpat' || isTouching || curEmotion === 'happy' || curEmotion === 'proud' ? 13
            : interactionKind === 'tail' || curEmotion === 'angry' ? 11
              : curEmotion === 'sad' || curEmotion === 'sleepy' ? 4 : 8.5;

        const sleepyNod = curEmotion === 'sleepy' ? Math.max(0, Math.sin(elapsedTotal * 1.15 - 0.5)) * 8 : 0;
        const proudLift = curEmotion === 'proud' ? -4.5 + Math.sin(elapsedTotal * 4.2) * 1.8 : 0;
        const workingNod = curEmotion === 'working' ? Math.sin(elapsedTotal * 3.8) * 2.2 : 0;
        const sadDroop = curEmotion === 'sad' ? 4.5 : 0;
        const earDip = Math.sin(elapsedTotal * 26) * pulseRef.current.ear * 7.5;

        const data = posBuffer.data;
        const lookX = isWalking ? 0 : curGaze.x;
        const lookY = isWalking ? 0 : curGaze.y;

        for (let i = 0; i < basePositions.length; i += 2) {
          const bx = basePositions[i];
          const by = basePositions[i + 1];
          const u = uvRatios[i];
          const v = uvRatios[i + 1];

          const headW = smoothstep(0.44, 0.14, v);
          const torsoW = bell(v, 0.22, 0.66);
          const upperW = smoothstep(0.88, 0.28, v);
          const earW = smoothstep(0.24, 0.05, v);
          const skirtW = isWalking ? 0 : bell(v, 0.45, 0.69);
          const hairW = isWalking ? bell(v, 0.20, 0.36) * smoothstep(0.45, 0.72, u) : 0;
          const tailW = isWalking
            ? smoothstep(0.64, 0.82, u) * bell(v, 0.52, 0.80) * 0.45
            : smoothstep(0.55, 0.72, u) * bell(v, 0.50, 0.84);

          let dx = 0;
          let dy = 0;

          if (!isWalking) {
            dx += breath * 3.2 * torsoW * (u - 0.5);
            dy += breath * -3.6 * upperW;
            dx += lookX * 14 * headW;
            dy += lookY * 9 * headW + lookX * 7 * headW * (0.5 - u);
            dy += (sleepyNod + proudLift + workingNod + sadDroop) * headW;
            dy += earDip * earW;
            dx += (Math.sin(elapsedTotal * 2.0 + 0.8) * 3.5 + swayAngle * 38) * skirtW;
          }

          dx += Math.sin(elapsedTotal * tailFreq + v * 6.5) * tailAmp * tailW;
          dy += Math.cos(elapsedTotal * tailFreq + v * 5.2) * tailAmp * 0.45 * tailW;
          dx += Math.sin(elapsedTotal * 5.2 + v * 7.5) * 2.6 * hairW;

          if (isDragging) {
            const legW = smoothstep(0.45, 0.92, v);
            dx += Math.sin(elapsedTotal * 5.2) * 5 * legW - swayAngle * 65 * legW;
          }

          data[i] = bx + dx;
          data[i + 1] = by + dy;
        }
        posBuffer.update();

        // 触发一次性粒子爆发。
        if (pulseRef.current.burstKind) {
          const kind = pulseRef.current.burstKind;
          pulseRef.current.burstKind = null;
          const color =
            kind === 'heart' ? 0xf28db2
              : kind === 'star' ? 0xf3c64f
                : kind === 'anger' ? 0xe86b6b : 0x62d9e8;
          for (let k = 0; k < 4; k += 1) {
            const angle = (-Math.PI * 0.85) + (k / 3) * (Math.PI * 0.7);
            emitParticle(
              kind,
              color,
              width * (0.35 + k * 0.1),
              kind === 'anger' ? height * 0.18 : height * 0.24,
              Math.cos(angle) * 26,
              Math.sin(angle) * 24 - 14,
              kind === 'spark' ? 9 : 6,
              0.85,
            );
          }
        }

        // 静止待机/交互期间周期性生成情绪微粒子，行走期间保持画面干净。
        fxSpawnCooldown -= dt;
        if (fxSpawnCooldown <= 0 && !isWalking) {
          if (interactionKind === 'headpat' || isTouching || curEmotion === 'happy') {
            fxSpawnCooldown = 0.42;
            emitParticle('heart', 0xf28db2, width * (0.32 + Math.random() * 0.36), height * 0.26, (Math.random() - 0.5) * 18, -32, 5 + Math.random() * 2, 1.15);
          } else if (interactionKind === 'tail' || curEmotion === 'angry') {
            fxSpawnCooldown = 0.65;
            emitParticle('anger', 0xe86b6b, width * 0.73, height * 0.16, 4, -8, 8, 0.85);
          } else if (curEmotion === 'proud') {
            fxSpawnCooldown = 0.55;
            emitParticle('star', 0xf3c64f, width * (0.2 + Math.random() * 0.6), height * (0.14 + Math.random() * 0.28), (Math.random() - 0.5) * 10, -18, 5 + Math.random() * 3, 1.0);
          } else if (curEmotion === 'thinking') {
            fxSpawnCooldown = 0.7;
            emitParticle('bubble', 0x7ac7dc, width * 0.72, height * 0.22, 6, -20, 3.5 + Math.random() * 2.5, 1.3);
          } else if (curEmotion === 'sleepy') {
            fxSpawnCooldown = 0.95;
            emitParticle('zzz', 0x7d95b5, width * 0.68, height * 0.2, 10, -22, 7, 1.5);
          } else if (curEmotion === 'sad') {
            fxSpawnCooldown = 0.75;
            emitParticle('drop', 0x66b8e8, width * (0.32 + Math.random() * 0.36), height * 0.28, 0, 32, 3.2, 0.95);
          } else {
            fxSpawnCooldown = 1.0;
          }
        }

        fx.clear();
        for (let i = particles.length - 1; i >= 0; i -= 1) {
          const p = particles[i];
          p.life += dt;
          if (p.life >= p.maxLife) {
            particles.splice(i, 1);
            continue;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const progress = p.life / p.maxLife;
          const alpha = Math.sin(progress * Math.PI);

          if (p.kind === 'heart') drawHeart(fx, p.x, p.y, p.size, p.color, alpha * 0.9);
          else if (p.kind === 'star') drawStar(fx, p.x, p.y, p.size * (0.7 + progress * 0.4), p.color, alpha);
          else if (p.kind === 'bubble') {
            fx.beginFill(p.color, alpha * 0.65);
            fx.drawCircle(p.x, p.y, p.size);
            fx.endFill();
          } else if (p.kind === 'zzz') drawZ(fx, p.x, p.y, p.size * (0.8 + progress * 0.45), p.color, alpha * 0.85);
          else if (p.kind === 'drop') {
            fx.beginFill(p.color, alpha * 0.78);
            fx.drawEllipse(p.x, p.y, p.size * 0.65, p.size * 1.15);
            fx.endFill();
          } else if (p.kind === 'anger') drawAnger(fx, p.x, p.y, p.size * (0.9 + Math.sin(progress * 12) * 0.12), p.color, alpha);
          else if (p.kind === 'spark') drawStar(fx, p.x, p.y, p.size * (1 - progress * 0.3), p.color, alpha);
        }
      });

      setReady(true);
    }

    void init();
    return () => {
      disposed = true;
      clearTimeout(blinkTimer);
      clearTimeout(blinkCloseTimer);
      clearTimeout(earTimer);
      clearTimeout(microTimer);
      clearTimeout(microEndTimer);
      if (app) app.destroy(true, { children: true });
      for (const tex of textures.values()) tex.destroy(true);
      textures.clear();
    };
  }, [character.entry, width, height]);

  return (
    <canvas
      ref={canvas}
      className="puppet-pet"
      data-ready={ready}
      role="img"
      aria-label={`${character.name}：${emotion}`}
    />
  );
}
