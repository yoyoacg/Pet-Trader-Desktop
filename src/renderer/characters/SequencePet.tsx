import { useEffect, useRef } from 'react';
import type { Character, Emotion, PetMotion } from '../../shared/types';

export function SequencePet({character, emotion, motion, touching, actionClip, width, height}: {character: Character; emotion: Emotion; motion: PetMotion; touching: boolean; actionClip?: string | null; width: number; height: number}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // 画布和帧解码都按屏幕像素密度绘制，避免高 DPI 下放大低分辨率的 190px 位图。
  const pixelWidth = Math.ceil(width * window.devicePixelRatio);
  const pixelHeight = Math.ceil(height * window.devicePixelRatio);
  const hasRealWalk = Boolean(
    character.animations?.walkLeft &&
    character.animations?.walkRight &&
    character.animations.walkLeft[0]?.file !== character.animations.idle?.[0]?.file &&
    character.animations.walkLeft[0]?.file !== character.animations.walkRight[0]?.file
  );
  const clip = touching
    ? 'touch'
    : (actionClip && character.animations?.[actionClip])
      ? actionClip
      : (motion !== 'idle' && hasRealWalk)
        ? motion
        : character.states[emotion] as string;

  useEffect(() => {
    const context = canvas.current!.getContext('2d')!;
    const frames = character.animations![clip];
    const neutral = character.animations![character.states.idle as string][0];
    const bitmaps: ImageBitmap[] = [];
    let disposed = false;
    let animation = 0;
    let index = 0;
    let nextFrame = 0;
    function release() {
      for (const bitmap of bitmaps) bitmap.close();
      bitmaps.length = 0;
    }
    function paint(bitmap: ImageBitmap) {
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      // 连续帧可以是竖幅，按原始比例居中显示，避免导入人物被压成正方形。
      const scale = Math.min(pixelWidth / bitmap.width, pixelHeight / bitmap.height);
      const drawWidth = bitmap.width * scale, drawHeight = bitmap.height * scale;
      context.drawImage(bitmap, (pixelWidth - drawWidth) / 2, (pixelHeight - drawHeight) / 2, drawWidth, drawHeight);
    }
    function draw(now: number) {
      if (now >= nextFrame) {
        if (index === frames.length) {
          // 走路连续播放；原地动作播完回到待机姿势，随机休息后才再次触发。
          if (motion !== 'idle') index = 0;
          else {
            paint(bitmaps[frames.length]);
            if (touching) return;
            nextFrame = now + 4000 + Math.random() * 8000;
            index = 0;
            animation = requestAnimationFrame(draw);
            return;
          }
        }
        // 每帧先清空透明画布，动画时长取自 VPet 原始文件名。
        paint(bitmaps[index]);
        nextFrame = now + frames[index].durationMs;
        index += 1;
      }
      animation = requestAnimationFrame(draw);
    }
    async function open() {
      // 仅解码当前动作，按显示尺寸缩小；动作切换时释放，避免长期累积纹理。
      for (const frame of [...frames, neutral]) {
        const url = new URL(frame.file, character.entry).href;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`读取动画失败：${response.status} ${url}`);
        const bitmap = await createImageBitmap(await response.blob(), {resizeHeight: pixelHeight, resizeQuality: 'high'});
        if (disposed) {bitmap.close();return;}
        bitmaps.push(bitmap);
        // 第一帧就绪立即显示，不等整个动作解码完才响应点击。
        if (bitmaps.length === 1) paint(bitmap);
      }
      animation = requestAnimationFrame(draw);
    }
    // 文件读取失败也释放已解码帧，然后继续抛出，保留完整异常。
    void open().then(undefined, error => {release();throw error;});
    return () => {disposed = true;cancelAnimationFrame(animation);release();};
  }, [character.entry, clip, motion, touching, pixelWidth, pixelHeight]);

  return <canvas ref={canvas} width={pixelWidth} height={pixelHeight} className="sequence-pet" role="img" aria-label={`${character.name}：${clip}`} />;
}
