import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';
import { WikiProvider } from './components/WikiDrawer';
import { applyTextScale, loadTextScale } from './lib/ui-scale';
import './styles.css';

applyTextScale(loadTextScale());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <WikiProvider>
        <App />
      </WikiProvider>
    </StoreProvider>
  </StrictMode>,
);

// Офлайн-режим: sw.js создаётся только при сборке. В программе для ПК (file://) он не нужен — всё и так на диске.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Без service worker приложение работает, только не офлайн.
    });
  });
}
