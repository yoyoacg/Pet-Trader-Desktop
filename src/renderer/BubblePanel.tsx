import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Visual } from '../shared/types';
import { Pet } from './Pet';

export function BubblePanel({children, visual}: {children: ReactNode; visual: Visual | null}) {
  useEffect(() => {
    // 只记录用户操作；行情轮询、宠物动画和话语更新都不延长展开时间。
    const activity = () => {void window.desktop.panelActivity();};
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'input'] as const;
    for (const event of events) window.addEventListener(event, activity, {capture: true, passive: true});
    return () => {for (const event of events) window.removeEventListener(event, activity, true);};
  }, []);
  return <div className="bubble-panel">
    <div className="bubble-surface">
      <div className="bubble-titlebar"><span>MY LIFE · 小秘书的工作台</span><span className="bubble-idle-hint">2 分钟无操作后收起</span><button aria-label="收起气泡面板" onClick={() => void window.desktop.hidePanel()}>×</button></div>
      <div className="bubble-content">{children}</div>
      {visual && <p className="bubble-companion-message" role="status">{visual.text}</p>}
    </div>
    {visual && <div className="panel-pet"><Pet visual={visual} /></div>}
  </div>;
}
