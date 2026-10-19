import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { loadDictionary, savedLanguage } from './i18n';
import './index.css';

const render = () => createRoot(document.getElementById('root')!).render(<App />);

// Visitors who chose English, Arabic or Russian get their language in the very first paint.
// If that download fails, the page still opens (in Chinese) rather than staying blank.
const lang = savedLanguage();
if (lang === 'zh') render();
else loadDictionary(lang).catch(() => undefined).finally(render);
