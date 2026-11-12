// The link to the plugin, which covers turning it on and off, the status and event stream, and starting RuneLite with the app.

import { useCallback, useEffect, useState } from 'react';
import { gateAllows } from '../domain/persistence/profiles';
import { guardedProfileGate as profileGate, readProfiles } from './profiles';
import { desktop, type RuneliteLaunch } from '../services/desktop';
import { checkStatus, connectEvents, parseNavTarget, parseMove, supportsSnapshot, syncShoppingPlan, pluginCompat, type BridgeEvent, type ShoppingPlanPayload } from '../services/runeliteBridge';
import { parseGear, parsePacing, parsePlayer, parseQuests, parseStats, parseXp } from '../services/bridgeEvents';
import { parseOwned } from '../domain/items/checklist';
import { BridgeFreshness, type StatusTicket } from '../domain/player/bridgeFreshness';
import { admitQuestObservation, parseQuestObservation } from '../domain/player/questObservation';
import type { QuestObservation } from '../domain/player/questObservation';
import { STORAGE_KEYS } from '../domain/persistence/storageKeys';
import { chosenBranch, ENABLED_KEY, loadJson, MOVES_KEY, PLAN_KEY, saveJson, type BridgeCore } from './bridgeCore';
import type { useNavTarget } from './bridgeNav';
import type { useSnapshot } from './bridgeSnapshot';
import type { useStepSending } from './bridgeSteps';

const AUTOLAUNCH_KEY = STORAGE_KEYS.runeliteAutolaunch;

/** Auto-launch — once per app launch (in development StrictMode runs the effects twice). */
let autoLaunchDone = false;

function loadAutoLaunch(): boolean {
  try {
    return localStorage.getItem(AUTOLAUNCH_KEY) !== '0';
  } catch {
    return true;
  }
}

const LAUNCH_TEXT: Partial<Record<RuneliteLaunch['state'], string>> = {
  started: 'Starting RuneLite with the OSRS Path Bridge…',
  starting: 'RuneLite is already starting…',
  running: 'RuneLite with the bridge is already running',
};

/** Status requests and the event stream fill the game facts, and a restart of either side sends the step again. */
export function useLink({ enabled, setEnabledState, setState, setInGame, setStats, setOwned, setShortestPath, setGear, setPacing, setXp, setQuestsDone, setQuestStates, setMoves, setPlayer, setPosition, liveIdentity, sessionEpoch, tracker, setNavTargetState, setQuestInstruction, setChronicleCharges, setSpellbook, setQuestPoints, setCombatLog, setTotalLevel, setAccountType, setPlugin, bankSent, navSeq, pluginProtocol, snapshot, latest, handled }: BridgeCore, { flushSnapshot }: ReturnType<typeof useSnapshot>, { sendStep, onCompleted }: ReturnType<typeof useStepSending>, { setNavFromPlugin, onNavDone }: ReturnType<typeof useNavTarget>) {
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* it is remembered until a restart */ }
  }, []);

  useEffect(() => {
    const freshness = new BridgeFreshness();
    let questObservation: QuestObservation | null = null;
    const acceptQuests = (raw: unknown, player: string | null, authoritative = false): boolean => {
      if (raw == null) return questObservation === null; // Legacy lists cannot downgrade an admitted versioned observation.
      const parsed = parseQuestObservation(raw);
      if (!parsed) return false;
      const admitted = admitQuestObservation(parsed, questObservation, player, authoritative);
      if (admitted !== parsed) return false;
      questObservation = admitted;
      setQuestStates(admitted);
      return true;
    };
    const clearCharacter = () => {
      questObservation = null;
      sessionEpoch.current++;
      handled.current.clear();
      liveIdentity.current = { inGame: false, player: null };
      setQuestInstruction(null);
      setInGame(false);
      setChronicleCharges(null);
      setSpellbook(null);
      setStats(null);
      setOwned(null);
      setShortestPath(false);
      setGear(null);
      setPacing(null);
      setXp(null);
      setQuestsDone(null);
      setQuestStates(null);
      setPlayer(null);
      setPosition(null);
      setQuestPoints(null);
      setTotalLevel(null);
      setAccountType(null);
      setCombatLog(null);
      tracker.current.reset();
    };
    const forget = () => {
      freshness.reset();
      clearCharacter();
      setPlugin(null);
      // RuneLite was closed — there is no temporary target there any more.
      setNavFromPlugin(null);
      pluginProtocol.current = null;
      bankSent.current = '';
      // RuneLite was closed — there is nothing in the new plugin: the snapshot goes again when the app connects again.
      snapshot.current.sentKey = null;
      snapshot.current.synced = false;
      if (snapshot.current.timer) { clearTimeout(snapshot.current.timer); snapshot.current.timer = null; }
    };
    if (!enabled) {
      setState('off');
      forget();
      return;
    }
    setState('connecting');
    let alive = true;
    let statusPoll = 0;
    let questPointsPoll = 0;
    const refresh = (resync = false) => {
      const seq = navSeq.current;
      const poll = ++statusPoll;
      questPointsPoll++; // A newer full status owns this fact too.
      const ticket = freshness.capture();
      void checkStatus().then((s) => { if (poll === statusPoll) onStatus(s, resync, seq, ticket); });
    };
    const refreshQuestPoints = () => {
      const poll = ++questPointsPoll, mainPoll = statusPoll, ticket = freshness.capture();
      void checkStatus().then(s => {
        if (!alive || poll !== questPointsPoll || mainPoll !== statusPoll || !freshness.accepts(ticket, 'QUESTS')) return;
        const identity = liveIdentity.current;
        if (!s.online || !s.inGame || !identity.inGame || s.player?.toLowerCase() !== identity.player?.toLowerCase()) return;
        // A legacy event already supplied the latest completed names. This request only fills its missing QP field.
        setQuestPoints(s.questPoints);
      }).catch(() => undefined);
    };
    const onStatus = (s: Awaited<ReturnType<typeof checkStatus>>, resync: boolean, seq: number, ticket: StatusTicket) => {
      if (!alive || !freshness.accepts(ticket)) return;
      if (!s.online) {
        // A request timeout cannot override a live event delivered while it waited.
        if (!freshness.unchanged(ticket)) return;
        setState('offline'); forget(); return;
      }
      const previous = liveIdentity.current;
      if (!s.inGame || (previous.player !== null && previous.player.toLowerCase() !== s.player?.toLowerCase())) clearCharacter();
      liveIdentity.current = { inGame: s.inGame, player: s.inGame ? s.player : null };
      setState(s.online ? 'online' : 'offline');
      setInGame(s.inGame);
      setQuestInstruction(s.questInstruction);
      setShortestPath(s.shortestPath);
      setPlugin(s.online ? { protocol: s.protocol, version: s.pluginVersion, compat: pluginCompat(s.protocol) } : null);
      pluginProtocol.current = s.online ? s.protocol : null;
      // The arrow target — whichever is in the game now (it could have been chosen in the game or before the app restart). An old plugin
      // (before 2.11) does not report the target — then we keep the one the app knows. If an event about the target came while waiting
      // for the reply — it is newer than the reply.
      if (s.online && s.protocol !== null && s.protocol >= 4 && seq === navSeq.current) setNavTargetState(s.navTarget);
      if (freshness.accepts(ticket, 'STATS')) setStats(s.inGame ? s.stats : null);
      if (freshness.accepts(ticket, 'XP')) {
        setXp(s.inGame ? s.xp : null);
        if (s.inGame && s.xp) tracker.current.push(s.xp, Date.now());
        else tracker.current.reset();
      }
      if (freshness.accepts(ticket, 'QUESTS')) {
        if (!s.inGame) setQuestStates(null);
        if (acceptQuests(s.questStates, s.player, true)) {
          setQuestsDone(s.inGame ? s.questsDone : null);
          setQuestPoints(s.inGame ? s.questPoints : null);
        }
      }
      setPlayer(s.inGame ? s.player : null);
      if (freshness.accepts(ticket, 'GEAR')) setGear(s.inGame ? s.gear : null);
      if (freshness.accepts(ticket, 'MOVED')) setPosition(s.inGame ? s.pos : null);
      setChronicleCharges(s.inGame ? s.chronicleCharges : null);
      setSpellbook(s.inGame ? s.spellbook : null);
      setTotalLevel(s.inGame ? s.totalLevel : null);
      setAccountType(s.inGame ? s.accountType ?? null : null);
      setCombatLog((prev) => (s.inGame && s.combatLog ? (JSON.stringify(prev) === JSON.stringify(s.combatLog) ? prev : s.combatLog) : null));
      // RuneLite was restarted (or the app) — the plugin does not know the step: we send it again. We do not
      // send the same step twice, so as not to reset the waypoints and the pace measurement in the plugin.
      const want = latest.current.activeStepId;
      if (!gateAllows(profileGate(readProfiles(), s.player))) return;
      if (s.online && supportsSnapshot(s.protocol)) {
        // Protocol 6: the snapshot is full and the plugin does not re-reset the same step — after a restart of either side we simply
        // send everything anew: the step, shopping, the bank highlight, the advice and the plan.
        const sn = snapshot.current;
        if (!sn.synced || resync) {
          const step = want ? latest.current.steps.find((x) => x.id === want) : undefined;
          sn.synced = true;
          if (!sn.parts.shopping) sn.parts = { ...sn.parts, shopping: loadJson<ShoppingPlanPayload>(PLAN_KEY, null) };
          sn.sentKey = null;
          if (step) void sendStep(step, chosenBranch(step, latest.current.branchChoice));
          else void flushSnapshot();
        }
      } else if (resync && s.online) {
        if (want && s.activeStepId !== want) {
          const step = latest.current.steps.find((x) => x.id === want);
          if (step) void sendStep(step, chosenBranch(step, latest.current.branchChoice));
        }
        // RuneLite could have been restarted — we send the exchange bulk list again (protocol 6 sends it in the snapshot).
        const plan = loadJson<ShoppingPlanPayload>(PLAN_KEY, null);
        if (Array.isArray(plan?.items) && plan.items.length) void syncShoppingPlan(plan);
      }
    };
    const onEvent = (e: BridgeEvent) => {
      if (!alive) return;

      if (e.type !== 'STATUS' && liveIdentity.current.inGame === false
        && ['XP', 'QUESTS', 'STATS', 'OWNED', 'GEAR', 'PACING', 'MOVED', 'STEP_AUTO_COMPLETED'].includes(e.type)) return;
      freshness.event(e.type);
      if (e.type === 'XP') {
        const next = parseXp((e as { xp?: unknown }).xp);
        setXp(next);
        if (next) tracker.current.push(next, Date.now());
        else tracker.current.reset();
      } else if (e.type === 'QUESTS') {
        if (acceptQuests(e.questStates, liveIdentity.current.player)) {
          setQuestsDone(parseQuests((e as { done?: unknown }).done));
          const points = questObservation?.questPoints ?? null;
          setQuestPoints(points);
          if (points === null) refreshQuestPoints(); // Never infer QP from quest rewards or overwrite the event's other facts.
        }
      }
      else if (e.type === 'STATUS') {
        const loggedIn = (e as { inGame?: unknown }).inGame === true;
        const nextPlayer = loggedIn ? parsePlayer((e as { player?: unknown }).player) : null;
        freshness.reset();
        if (!loggedIn || liveIdentity.current.player?.toLowerCase() !== nextPlayer?.toLowerCase()) clearCharacter();
        liveIdentity.current = { inGame: loggedIn, player: nextPlayer };
        setPlayer(nextPlayer);
        setInGame(loggedIn);
        // Entering and leaving the game is a reason to ask about Shortest Path again.
        refresh();
      } else if (e.type === 'STATS') setStats(parseStats((e as { stats?: unknown }).stats));
      else if (e.type === 'OWNED') setOwned(parseOwned(e));
      else if (e.type === 'GEAR') setGear(parseGear((e as { gear?: unknown }).gear));
      else if (e.type === 'PACING') setPacing(parsePacing(e));
      else if (e.type === 'MOVED') {
        const m = parseMove(e);
        if (m) {
          setPosition(m.to);
          setMoves((prev) => {
            const next = [...prev, { ...m, at: Date.now() }].slice(-8);
            saveJson(MOVES_KEY, { list: next });
            return next;
          });
        }
      }
      else if (e.type === 'NAV_SET') setNavFromPlugin(parseNavTarget((e as { target?: unknown }).target));
      else if (e.type === 'NAV_DONE') onNavDone(e);
      else if (e.type === 'STEP_AUTO_COMPLETED' && typeof (e as { stepId?: unknown }).stepId === 'string') onCompleted((e as { stepId: string }).stepId);
    };
    const handle = connectEvents(onEvent, (online) => {
      if (!alive) return;
      if (!online) {
        setState('offline');
        forget();
        return;
      }
      freshness.reset();
      // The stream is open — we check against /status: the indicator must show what the plugin answers,
      // and the step shown in the game must be in the plugin too.
      refresh(true);
    });
    return () => {
      alive = false;
      freshness.reset();
      sessionEpoch.current++;
      handle.close();
    };
  }, [enabled, onCompleted, onNavDone, sendStep, setNavFromPlugin, flushSnapshot]);

  const locate = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const st = await checkStatus();
    return epoch === sessionEpoch.current && gateAllows(profileGate(readProfiles(), st.player)) && st.online && st.inGame ? st.pos : null;
  }, []);
  return { setEnabled, locate };
}

/** Starting RuneLite from the app, and once per app launch when auto-launch is on. */
export function useLaunch({ notify, enabled }: BridgeCore) {
  const [autoLaunch, setAutoLaunchState] = useState(loadAutoLaunch);
  const runelite = desktop()?.runelite;

  const setAutoLaunch = useCallback((on: boolean) => {
    setAutoLaunchState(on);
    try { localStorage.setItem(AUTOLAUNCH_KEY, on ? '1' : '0'); } catch { /* it is remembered until a restart */ }
  }, []);

  const launchRuneLite = useCallback(async (quiet = false): Promise<RuneliteLaunch | null> => {
    if (!runelite) return null;
    const r = await runelite.launch().catch(() => null);
    if (!r) return null;
    const text = r.ok ? LAUNCH_TEXT[r.state] : `RuneLite did not start: ${r.problems?.[0] ?? 'details in settings'}`;
    // The auto-launch is silent if RuneLite is already running; we always show an error — otherwise it is unclear why there is no link.
    if (text && !(quiet && r.state === 'running')) notify(text);
    return r;
  }, [runelite, notify]);

  // With the app launch — RuneLite with the plugin, if the link and auto-launch are on.
  useEffect(() => {
    if (autoLaunchDone || !runelite || !enabled || !autoLaunch) return;
    autoLaunchDone = true;
    void launchRuneLite(true);
  }, [runelite, enabled, autoLaunch, launchRuneLite]);
  return { runelite, autoLaunch, setAutoLaunch, launchRuneLite };
}
