// The sub-step the player is on right now inside a quest step: found from the arrow target the game plugin follows (it points at the current stage line),
// so the desktop can show that one line as the hero card instead of the whole walkthrough.
//
// Nothing is guessed: with no link, another step's target or a detour (a label that is none of the step's lines), there is no sub-step and the card falls back.

import type { Step, StepNpcInfo, QuestStage, QuestStageLine } from '../types';
import type { NavTargetPayload } from '../services/runeliteBridge';
import { nameKey } from './checklist';
import { shortLine } from './shortText';
import { npcSpot } from './stepPlaces';
import { heldOf, type PlayerState } from './playerState';

export interface SubStepItem {
  name: string;
  count: number;
  iconUrl?: string;
}

export interface SubStep {
  /** 1-based number of the line within its stage, and how many lines the stage has. */
  index: number;
  size: number;
  stage: QuestStage;
  line: QuestStageLine;
  /** The short one-line title and the full action text without the dialogue. */
  title: string;
  action: string;
  /** What to pick in the dialogue, in order. */
  dialogue: string[];
  /** The tile to lead to, when the line (or the NPC) has one. */
  target?: { x: number; y: number; plane: number; label: string; npcNames?: string[] };
}

const flat = (s: string) => nameKey(s).replace(/[….]+$/, '');

/** "Dialogue: “A?” → “B”." gives ["A?", "B"]; no dialogue gives []. */
export function dialogueOf(text: string): string[] {
  const m = /Dialogue:\s*([\s\S]*)$/.exec(text);
  if (!m) return [];
  return m[1].split('→')
    .map((o) => o.trim().replace(/^[“"'‘]+/, '').replace(/[”"'’]*\.?\s*$/, '').trim())
    .filter(Boolean);
}

/** The action text without the "Dialogue: ..." tail. */
export function actionOf(text: string): string {
  return text.replace(/\s*Dialogue:[\s\S]*$/, '').trim();
}

const titleOf = (l: QuestStageLine) => (l.s?.trim() || shortLine(l.t)).trim();

/** The sub-step the arrow is on, or null. */
export function findSubStep(step: Step, nav: NavTargetPayload | null): SubStep | null {
  const qs = step.questStages;
  if (!qs || !nav || nav.stepId !== step.id) return null;
  const label = flat(nav.label);
  if (!label) return null;
  let both: SubStep | null = null;
  let byLabel: SubStep | null = null;
  let byTile: SubStep | null = null;
  for (const stage of [...qs.stages].sort((a, b) => a.at - b.at)) {
    stage.do.forEach((line, i) => {
      const tileHit = !!line.at && line.at[0] === nav.x && line.at[1] === nav.y && line.at[2] === nav.plane;
      const labelHit = flat(titleOf(line)) === label || flat(line.t) === label || flat(line.t).startsWith(label);
      if (!tileHit && !labelHit) return;
      const sub = build(step, stage, line, i);
      if (labelHit && tileHit) both ??= sub;
      else if (labelHit) byLabel ??= sub;
      else byTile ??= sub;
    });
  }
  // The label and the tile together are the surest; a label alone next; a bare tile only when the plugin shortened the label in its own way.
  return both ?? byLabel ?? byTile;
}

function build(step: Step, stage: QuestStage, line: QuestStageLine, i: number): SubStep {
  const npc = subStepNpc(step, stage, line);
  const spot = npc ? npcSpot(npc, step.id) : undefined;
  const title = titleOf(line);
  const target = line.at
    ? { x: line.at[0], y: line.at[1], plane: line.at[2], label: title, ...(npc ? { npcNames: [npc] } : {}) }
    : spot ? { x: spot.x, y: spot.y, plane: spot.plane, label: title, ...(npc ? { npcNames: [npc] } : {}) } : undefined;
  return { index: i + 1, size: stage.do.length, stage, line, title, action: actionOf(line.t), dialogue: dialogueOf(line.t), ...(target ? { target } : {}) };
}

/** The name of the NPC the sub-step is about, if the dictionary knows where it stands. */
export function subStepNpc(step: Step, stage: QuestStage, line: QuestStageLine): string | null {
  const known = (name: string) => (npcSpot(name, step.id) ? name : null);
  if (typeof stage.go === 'string' && /talk|speak|ask|hassan|osman/i.test(line.t) && known(stage.go)) return stage.go;
  const candidates: string[] = [];
  const colon = /^([A-Z][\w'’. -]{2,28}):/.exec(line.s ?? '');
  if (colon) candidates.push(colon[1].trim());
  const talk = /\b(?:Talk to|Speak to|Ask|Return to|Give [^.]*? to)\s+((?:[A-Z][\w'’.-]*\s?){1,3})/.exec(line.t);
  if (talk) candidates.push(talk[1].trim());
  for (const c of candidates) {
    const direct = known(c);
    if (direct) return direct;
    const noTitle = c.replace(/^(Lady|Lord|King|Queen|Captain|Dr\.?|Sir)\s+/i, '');
    if (noTitle !== c && known(noTitle)) return noTitle;
  }
  return null;
}

const FLOORS = ['Ground floor', '1st floor', '2nd floor', '3rd floor'];

/** The dossier card for the sub-step's NPC, from the place dictionary. */
export function subStepNpcInfo(step: Step, sub: SubStep): StepNpcInfo | null {
  const name = subStepNpc(step, sub.stage, sub.line);
  const spot = name ? npcSpot(name, step.id) : undefined;
  if (!name || !spot) return null;
  return {
    nameEn: name,
    location: spot.area,
    floor: spot.plane === 0 && spot.y >= 6400 ? 'Underground' : FLOORS[spot.plane] ?? `Level ${spot.plane}`,
    wikiUrl: `https://oldschool.runescape.wiki/w/${encodeURIComponent(name.replace(/ /g, '_'))}`,
  };
}

const singular = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map(singular);
const bareName = (n: string) => n.replace(/\s*[×x]\s*\d+\+?\s*$/, '').trim();

function mentions(text: string, name: string): boolean {
  const t = words(text);
  const n = words(bareName(name));
  if (!n.length) return false;
  for (let i = 0; i + n.length <= t.length; i++) if (n.every((w, k) => t[i + k] === w)) return true;
  return false;
}

/** What this very sub-step asks for: the item to hand in, the items it highlights, and the stage's items its text names. At most six. */
export function subStepItems(step: Step, sub: SubStep): SubStepItem[] {
  const out = new Map<string, SubStepItem>();
  const icon = (name: string) => step.itemsRequired?.find((i) => nameKey(i.nameEn) === nameKey(name))?.iconUrl;
  const add = (name: string, count = 1) => {
    const key = nameKey(name);
    if (!key || out.has(key)) return;
    out.set(key, { name, count, ...(icon(name) ? { iconUrl: icon(name) } : {}) });
  };
  const text = `${sub.line.t} ${sub.line.s ?? ''}`;
  if (sub.line.need) add(sub.line.need);
  for (const n of sub.line.hl?.item ?? []) add(n);
  for (const i of sub.stage.items ?? []) if (!i.inStep && mentions(text, i.name)) add(i.name, i.count ?? 1);
  for (const i of step.itemsRequired ?? []) {
    if (!mentions(text, i.nameEn)) continue;
    const n = typeof i.amount === 'number' ? i.amount : /^\d+/.test(i.amount) ? parseInt(i.amount, 10) : 1;
    add(i.nameEn, n);
  }
  return [...out.values()].slice(0, 6);
}

export type ItemStatus = 'bag' | 'bank' | 'missing' | 'unknown';

/**
 * Where an item is, three-valued: "missing" only when the game knows both the bag and the bank; the bag known and the bank not opened is "unknown" (not checked),
 * never "missing". Reads the whole bag the plugin sends, not only the tracked items.
 */
export function itemStatus(state: Pick<PlayerState, 'bagItems' | 'owned' | 'equipment' | 'manual' | 'bankSeen'>, name: string): ItemStatus {
  const key = nameKey(name);
  const inBag = state.bagItems.known ? state.bagItems.value.find((i) => nameKey(i.name) === key)?.count ?? 0 : 0;
  if (inBag > 0) return 'bag';
  const held = heldOf(state, name);
  if ((held.bag ?? 0) > 0 || held.equipped > 0) return 'bag';
  if ((held.bank ?? 0) > 0) return 'bank';
  return held.presence === 'MISSING' ? 'missing' : 'unknown';
}
