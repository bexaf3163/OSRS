// The React entry point: the providers (progress, the RuneLite link, the player state, the readiness engine).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';
import { BridgeProvider } from './bridge';
import { PlayerStateProvider } from './playerStateContext';
import { ReadinessProvider } from './readinessContext';
import { WikiProvider } from './components/WikiDrawer';
import { applyTextScale, loadTextScale } from './lib/ui-scale';
import './styles.css';

applyTextScale(loadTextScale());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <BridgeProvider>
        <PlayerStateProvider>
          <ReadinessProvider>
            <WikiProvider>
              <App />
            </WikiProvider>
          </ReadinessProvider>
        </PlayerStateProvider>
      </BridgeProvider>
    </StoreProvider>
  </StrictMode>,
);
