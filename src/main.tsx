import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';
import { BridgeProvider } from './bridge';
import { WikiProvider } from './components/WikiDrawer';
import { applyTextScale, loadTextScale } from './lib/ui-scale';
import './styles.css';

applyTextScale(loadTextScale());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <BridgeProvider>
        <WikiProvider>
          <App />
        </WikiProvider>
      </BridgeProvider>
    </StoreProvider>
  </StrictMode>,
);
