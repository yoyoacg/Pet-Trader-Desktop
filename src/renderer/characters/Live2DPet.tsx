import { useEffect, useRef, useState } from 'react';
import type { Application } from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import type { Character, Emotion, LiveMapping } from '../../shared/types';
import type { PuppetInteraction } from './PuppetPet';

async function loadCore(): Promise<void> {
  if (window.Live2DCubismCore) return; // 可选 SDK 的加载边界，同一窗口不重复初始化。
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'petasset://runtime/live2dcubismcore.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Live2D 官方运行时未安装或加载失败，不能显示该模型'));
    document.head.appendChild(script);
  });
}

export function Live2DPet({
  character,
  emotion,
  touching = false,
  interaction,
  actionName,
  width = 190,
  height = 190,
}: {
  character: Character;
  emotion: Emotion;
  touching?: boolean;
  interaction?: PuppetInteraction;
  actionName?: string | null;
  width?: number;
  height?: number;
}) {
  const [message, setMessage] = useState('正在加载模型…');
  const host = useRef<HTMLDivElement>(null);
  const model = useRef<Live2DModel | null>(null);
  const activeEmotion: Emotion = interaction?.kind === 'headpat' || touching
    ? 'happy'
    : interaction?.kind === 'poke'
      ? 'surprised'
      : interaction?.kind === 'tail'
        ? 'angry'
        : emotion;
  const latestEmotion = useRef<Emotion>(activeEmotion);
  latestEmotion.current = activeEmotion;

  function apply(value: Live2DModel) {
    if (actionName) {
      const matchedMotion = character.motions.find(item => item.group === actionName || `${item.group}#${item.index}` === actionName);
      if (matchedMotion) {
        void value.motion(matchedMotion.group, matchedMotion.index);
        return;
      }
      if (character.expressions.includes(actionName)) {
        void value.expression(actionName);
        return;
      }
    }
    const mapping = character.states[latestEmotion.current] as LiveMapping;
    if (!mapping) return;
    if (mapping.kind === 'motion') void value.motion(mapping.group, mapping.index);
    if (mapping.kind === 'expression') void value.expression(mapping.name);
  }

  useEffect(() => {
    let disposed = false;
    let app: Application;
    async function open() {
      const {live2dReady} = await window.desktop.bootstrap();
      if (disposed) return;
      if (!live2dReady) {setMessage('本版本尚未配置 Live2D 官方运行时');return;}
      await loadCore();
      const PIXI = await import('pixi.js');
      // 使用 Pixi 官方静态 uniform 同步模块，适配当前禁止动态代码求值的 CSP。
      const {install} = await import('@pixi/unsafe-eval');
      install(PIXI);
      window.PIXI = PIXI;
      const {Live2DModel} = await import('pixi-live2d-display/cubism4');
      if (disposed || !host.current) return;
      const view = document.createElement('canvas');
      view.className = 'live2d-pet';
      host.current.replaceChildren(view);
      app = new PIXI.Application({view, width, height, resolution: window.devicePixelRatio, autoDensity: true, backgroundAlpha: 0, antialias: true});
      const loaded = await Live2DModel.from(character.entry, {autoInteract: false});
      if (disposed) {loaded.destroy(); return;}
      loaded.scale.set(Math.min((width - 10) / loaded.width, (height - 10) / loaded.height));
      loaded.anchor.set(0.5, 0.5);
      loaded.position.set(width / 2, height / 2);
      app.stage.addChild(loaded);
      model.current = loaded;
      setMessage('');
      apply(loaded);
    }
    void open();
    return () => {
      disposed = true;
      model.current = null;
      if (app) app.destroy(true, {children: true, texture: true, baseTexture: true});
      if (host.current) host.current.replaceChildren();
    };
  }, [character.entry, width, height]);

  // 订阅桌面全局鼠标视线坐标，驱动 Live2D 头部与眼球平滑追随。
  useEffect(() => {
    return window.desktop.onGaze(({x, y}) => {
      if (model.current) {
        model.current.focus((x + 1) * 0.5 * width, (y + 1) * 0.5 * height);
      }
    });
  }, [width, height]);

  useEffect(() => {if (model.current) apply(model.current);}, [activeEmotion, actionName, interaction?.seq, character.states]);
  return <div>{message && <span className="notice">{message}</span>}<div ref={host} hidden={message !== ''} className="live2d-pet" aria-label={character.name} /></div>;
}
