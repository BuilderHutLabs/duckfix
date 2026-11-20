import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import { initTheme } from './ui/theme';
import { loadLanguage, setLanguage } from './i18n';

setLanguage(loadLanguage());
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
