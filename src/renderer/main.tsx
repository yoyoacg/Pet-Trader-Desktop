import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './pet.css';
import './market.css';

// 渲染前标记浮动窗口，让 html、body 和 React 根节点统一透明。
document.documentElement.classList.toggle('pet-window', new URLSearchParams(location.search).get('view') === 'pet');
document.documentElement.classList.toggle('panel-window', new URLSearchParams(location.search).get('view') !== 'pet');
createRoot(document.getElementById('root')!).render(<App />);
