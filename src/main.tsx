// The React entry point: the providers (progress, the RuneLite link, the player state, the readiness engine).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { StoreProvider } from './state/store';
import { BridgeProvider } from './state/bridge';
import { PlayerStateProvider } from './state/playerStateContext';
import { ReadinessProvider } from './state/readinessContext';
import { FundingProvider } from './state/fundingContext';
import { TrainingSessionProvider } from './state/trainingSessionContext';
import './styles.css';
import './clear-path.css';
import './modern-path.css';
import './cockpit.css';
import './ledger/fonts.css';
import './ledger/ledger.css';
import './ledger/extras.css';
import './ledger/app.css';


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <BridgeProvider>
        <PlayerStateProvider>
          <ReadinessProvider>
            <FundingProvider>
              <TrainingSessionProvider>
              <App />
              </TrainingSessionProvider>
            </FundingProvider>
          </ReadinessProvider>
        </PlayerStateProvider>
      </BridgeProvider>
    </StoreProvider>
  </StrictMode>,
);
