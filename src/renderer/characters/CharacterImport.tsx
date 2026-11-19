import { emotions } from '../../shared/types';
import type { Character, Emotion, LiveMapping } from '../../shared/types';

const labels = ['待机','思考','开心','沮丧','生气','得意','惊讶','困倦','工作'];
export function CharacterImport({characters, current, live2dReady, change, save, importFile, preview}: {
  characters: Character[]; current: Character; live2dReady: boolean;
  change: (character: Character) => Promise<void>; save: (character: Character) => Promise<void>; importFile: () => Promise<void>;
  preview: (emotion: Emotion, text: string, overrideCharacter?: Character, actionName?: string) => Promise<void>;
}) {
  const options: {label: string; value: LiveMapping}[] = [{label: '仅显示气泡', value: {kind: 'bubbleOnly'}}, ...current.motions.map(item => ({label: `动作 ${item.group} #${item.index}`, value: {kind: 'motion' as const, ...item}})), ...current.expressions.map(name => ({label: `表情 ${name}`, value: {kind: 'expression' as const, name}}))];
  const customActions = Object.keys(current.customActions ?? {});
  return <section className="surface character-editor">
    <div className="section-head"><div><h2>给它换个样子</h2><p>模型和关系是两回事，换装不会清空共同记忆。</p></div><button onClick={() => void importFile()}>导入角色</button></div>
    <label>当前角色<select value={current.id} onChange={event => void change(characters.find(item => item.id === event.target.value)!)}>{characters.map(character => <option key={character.id} value={character.id}>{character.name} · {character.type}</option>)}</select></label>
    <p className="hint">内置 VPet 连续动画与 Live2D 角色；支持导入 3×3 PNG 或 .model3.json。九宫格是九种表情，不是九帧连续动作。素材只保存在本机。</p>
    <div className="preview-bar">
      <span className="caption">九种情绪状态与动作验证（点击右侧桌宠立即演示）</span>
      <div className="reactions">{emotions.map((emotion, index) => <button key={emotion} type="button" onClick={() => void preview(emotion, `正在演示「${labels[index]}」状态（${emotion}）。`)}>{labels[index]}</button>)}</div>
    </div>
    {customActions.length > 0 && <div className="preview-bar">
      <span className="caption">AI 已生成追加的自定义动作精灵图（点击立即回放）</span>
      <div className="reactions">{customActions.map(actionName => <button key={actionName} type="button" onClick={() => void preview('happy', `正在展示 AI 追加的新动作：「${actionName}」！`, current, actionName)}>{actionName}</button>)}</div>
    </div>}
    {current.type === 'live2d' && live2dReady && (current.motions.length > 0 || current.expressions.length > 0) && <div className="preview-bar">
      <span className="caption">Live2D 原始动作与表情直测</span>
      <div className="reactions">{current.motions.map(item => <button key={`${item.group}-${item.index}`} type="button" onClick={() => void preview('working', `测试 Live2D 动作：${item.group} #${item.index}`, {...current, states: {...current.states, working: {kind: 'motion', group: item.group, index: item.index}}})}>动作 {item.group} #{item.index}</button>)}{current.expressions.slice(0, 12).map(name => <button key={name} type="button" onClick={() => void preview('happy', `测试 Live2D 表情：${name}`, {...current, states: {...current.states, happy: {kind: 'expression', name}}})}>表情 {name}</button>)}</div>
    </div>}
    {current.source && <p className="notice">{current.source.name} · {current.license}<br />{current.source.notice}<br /><button className="text-button" onClick={() => void window.desktop.openVPetSource()}>查看 VPet 原项目与完整授权</button></p>}
    {!live2dReady && <p className="notice">本版本没有附带 Live2D 官方运行时。可以导入模型查看映射，显示前需按文档配置获准使用的运行时。</p>}
    {!['builtin', 'builtin-vpet'].includes(current.id) && <>
      <div className="field-row"><label>角色名称<input value={current.name} onChange={event => void change({...current, name: event.target.value})} /></label><label>作者<input value={current.author} onChange={event => void change({...current, author: event.target.value})} /></label></div>
      <label>素材许可说明<input value={current.license} onChange={event => void change({...current, license: event.target.value})} /></label>
      <div className="mapping-grid">{emotions.map((emotion, index) => <label key={emotion}>{labels[index]}{current.type === 'sprite'
        ? <select value={current.states[emotion] as number} onChange={event => void change({...current, states: {...current.states, [emotion]: Number(event.target.value)}})}>{emotions.map((_, frame) => <option key={frame} value={frame}>第 {frame + 1} 格</option>)}</select>
        : current.type === 'sequence'
          ? <select value={current.states[emotion] as string} onChange={event => void change({...current, states: {...current.states, [emotion]: event.target.value}})}>{Object.keys(current.animations!).map(clip => <option key={clip} value={clip}>{clip}</option>)}</select>
          : current.type === 'puppet'
            ? <select value={current.states[emotion] as string} onChange={event => void change({...current, states: {...current.states, [emotion]: event.target.value}})}>{Object.keys(current.puppet!.poses).map(pose => <option key={pose} value={pose}>{pose}</option>)}</select>
            : <select value={options.findIndex(option => JSON.stringify(option.value) === JSON.stringify(current.states[emotion]))} onChange={event => void change({...current, states: {...current.states, [emotion]: options[Number(event.target.value)].value}})}>{options.map((option, number) => <option key={number} value={number}>{option.label}</option>)}</select>}</label>)}</div>
      <button onClick={() => void save(current)}>保存角色包配置</button>
    </>}
  </section>;
}
