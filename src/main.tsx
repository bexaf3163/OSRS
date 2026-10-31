// The React entry point: the providers (progress, the RuneLite link, the player state, the readiness engine).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';
import { BridgeProvider } from './bridge';
import { PlayerStateProvider } from './playerStateContext';
import { ReadinessProvider } from './readinessContext';
import { FundingProvider } from './fundingContext';
import { TrainingSessionProvider } from './trainingSessionContext';
import { WikiProvider } from './components/WikiDrawer';
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
              <WikiProvider>
                <App />
              </WikiProvider>
              </TrainingSessionProvider>
            </FundingProvider>
          </ReadinessProvider>
        </PlayerStateProvider>
      </BridgeProvider>
    </StoreProvider>
  </StrictMode>,
);
