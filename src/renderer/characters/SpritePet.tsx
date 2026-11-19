import { useEffect, useState } from 'react';
import type { Character, Emotion } from '../../shared/types';

export function SpritePet({character, emotion, customSpriteUrl}: {character: Character; emotion: Emotion; customSpriteUrl?: string | null}) {
  const frame = character.states[emotion] as number;
  const [active, setActive] = useState(true);
  useEffect(() => {setActive(true);}, [character.entry, emotion, customSpriteUrl]);
  useEffect(() => {
    if (active) return;
    // 单次身体动作结束后随机休息，避免所有表情持续摇摆或跳动。
    const timer = setTimeout(() => setActive(true), 4000 + Math.random() * 8000);
    return () => clearTimeout(timer);
  }, [active]);
  if (customSpriteUrl) {
    return <div className="sprite-pet" data-emotion="happy" data-active={true} role="img" aria-label={`${character.name}：自定义动作`} style={{width: Math.min(190, 190 * character.aspectRatio), height: Math.min(190, 190 / character.aspectRatio), backgroundImage: `url("${customSpriteUrl}")`, backgroundSize: 'contain', backgroundPosition: 'center'}} />;
  }
  // 九宫格是九种表情，保持当前表情，由 CSS 提供对应的身体动作。
  return <div className="sprite-pet" data-emotion={emotion} data-active={active} onAnimationEnd={() => setActive(false)} role="img" aria-label={`${character.name}：${emotion}`} style={{width: Math.min(190, 190 * character.aspectRatio), height: Math.min(190, 190 / character.aspectRatio), backgroundImage: `url("${character.entry}")`, backgroundPosition: `${(frame % 3) * 50}% ${Math.floor(frame / 3) * 50}%`}} />;
}
