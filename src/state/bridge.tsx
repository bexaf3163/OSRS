// The RuneLite link state: whether it is on, whether the plugin is there, which step is shown in the game.
// The auto-mark from the game comes here: the step is marked, the next one goes to the game, the pages open it on their own.
// Also from here: the skill levels (quick variants), the item count (departure check) and the bulk list for the exchange,
// the temporary target "🧭 to a place / to a shop", the stage items for the bank, the gear and the training pace from the game.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { gateAllows } from '../domain/persistence/profiles';
import { useBridgeCore } from './bridgeCore';
import { useCharacter } from './bridgeCharacter';
import { useLaunch, useLink } from './bridgeLink';
import { useNavTarget } from './bridgeNav';
import { useBankTags, useSnapshot } from './bridgeSnapshot';
import { useStepFollow, useStepSending } from './bridgeSteps';
import type { BridgeValue } from './bridgeValue';
import { useLastGears } from './lastGear';

const BridgeContext = createContext<BridgeValue | null>(null);

export function BridgeProvider({ children }: { children: ReactNode }) {
  // The state sits in bridgeCore.ts and the parts in the bridge*.ts files, called in this order so that their effects run in it.
  const c = useBridgeCore();
  const { enabled, state, inGame, activeStepId, advance, stats, owned, shortestPath, branchChoice, gear, pacing, xp, questsDone, moves, player, position, gate, navTarget, questInstruction, chronicleCharges, spellbook, questPoints, combatLog, totalLevel, accountType, plugin } = c;
  const { lastGear, lastGears } = useLastGears(gear, player);
  const snap = useSnapshot(c);
  const sending = useStepSending(c, snap);
  const nav = useNavTarget(c, sending);
  const { setEnabled, locate } = useLink(c, snap, sending, nav);
  useBankTags(c, snap);
  const { runelite, autoLaunch, setAutoLaunch, launchRuneLite } = useLaunch(c);
  const { pointInGame, clear, chooseBranch } = useStepFollow(c, sending);
  const { session, xpRate } = useCharacter(c);
  const { setPrepPart, setTrainingStep, syncPlan } = snap;
  const { navigate, clearNav, releaseNav, userClearedAt } = nav;
  const currentCharacter = state === 'online' && inGame && gateAllows(gate);
  const value = useMemo<BridgeValue>(
    () => ({
      enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance,
      canLaunch: Boolean(runelite), launchRuneLite: () => launchRuneLite(), autoLaunch, setAutoLaunch,
      stats: currentCharacter ? stats : null, owned: currentCharacter ? owned : null,
      shortestPath, branchChoice, chooseBranch, syncPlan, gear: currentCharacter ? gear : null, lastGear, lastGears,
      pacing: currentCharacter ? pacing : null, navTarget, questInstruction: currentCharacter ? questInstruction : null,
      chronicleCharges: currentCharacter ? chronicleCharges : null, spellbook: currentCharacter ? spellbook : null,
      questPoints: currentCharacter ? questPoints : null, totalLevel: currentCharacter ? totalLevel : null,
      accountType: currentCharacter ? accountType : null, combatLog: currentCharacter ? combatLog : null,
      navigate, clearNav, releaseNav, userClearedAt, plugin,
      xp: currentCharacter ? xp : null, questsDone: currentCharacter ? questsDone : null, questStates: currentCharacter ? c.questStates : null, player,
      position: currentCharacter ? position : null, gate, xpRate, session, locate, moves, setPrepPart, setTrainingStep,
    }),
    [enabled, setEnabled, state, inGame, activeStepId, pointInGame, clear, advance, runelite, launchRuneLite, autoLaunch, setAutoLaunch,
      stats, owned, shortestPath, branchChoice, chooseBranch, syncPlan, gear, lastGear, lastGears, pacing, navTarget, questInstruction, chronicleCharges, spellbook, questPoints, totalLevel, accountType, combatLog, navigate, clearNav, releaseNav, userClearedAt, plugin,
      xp, questsDone, c.questStates, player, position, gate, xpRate, session, locate, moves, setPrepPart, setTrainingStep, currentCharacter],
  );
  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge(): BridgeValue {
  const v = useContext(BridgeContext);
  if (!v) throw new Error('useBridge outside BridgeProvider');
  return v;
}
