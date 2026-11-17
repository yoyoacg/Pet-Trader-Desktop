import { useEffect, useRef, useState } from 'react';
import type { Application } from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import type { Character, Emotion, LiveMapping } from '../../shared/types';

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

export function Live2DPet({character, emotion}: {character: Character; emotion: Emotion}) {
  const [message, setMessage] = useState('正在加载模型…');
  const canvas = useRef<HTMLCanvasElement>(null);
  const model = useRef<Live2DModel | null>(null);
  const latestEmotion = useRef(emotion);
  latestEmotion.current = emotion;
  function apply(value: Live2DModel) {
    const mapping = character.states[latestEmotion.current] as LiveMapping;
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
      if (disposed) return;
      app = new PIXI.Application({view: canvas.current!, width: 240, height: 240, resolution: window.devicePixelRatio, autoDensity: true, backgroundAlpha: 0, antialias: true});
      const loaded = await Live2DModel.from(character.entry, {autoInteract: true});
      if (disposed) {loaded.destroy(); return;}
      loaded.scale.set(Math.min(230 / loaded.width, 230 / loaded.height));
      loaded.anchor.set(0.5, 0.5);
      loaded.position.set(120, 120);
      app.stage.addChild(loaded);
      model.current = loaded;
      setMessage('');
      apply(loaded);
    }
    void open();
    return () => {disposed = true; model.current = null; if (app) app.destroy(true, {children: true, texture: true, baseTexture: true});};
  }, [character.entry]);
  useEffect(() => {if (model.current) apply(model.current);}, [emotion, character.states]);
  return <div>{message && <span className="notice">{message}</span>}<canvas ref={canvas} hidden={message !== ''} className="live2d-pet" aria-label={character.name} /></div>;
}
