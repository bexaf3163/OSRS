// Slayer XP an hour at a Slayer master (owner, 2026-11-24): the Wiki's on-task melee rate of each task the master
// can give this player, weighted by how often the master gives it, each capped by the damage this player's melee
// deals an hour (Slayer XP is the damage dealt). Tasks, weights and rates come from scripts/data/build-slayer.ts.
import { slayerJson } from '../../data';
import { levelOf, questOf, type PlayerState } from '../player/playerState';
import { meleeDamagePerHour } from './combatRates';
import type { ModelRate } from '../training/methodRates';
import type { TrainingMethod } from '../training/trainingRouter';

interface Task { monster: string; weight: number; skills: Record<string, number | undefined>; quests: string[]; anyQuest?: boolean }
const MASTERS: Record<string, { name: string; tasks: Task[] }> = slayerJson.masters;
const RATES: Record<string, number[]> = slayerJson.rates;
/** Below this share of the assignable weight rated by the Wiki, the mean would rest on a minority of the tasks. */
const RATED_SHARE = 0.5;

const assignable = (t: Task, state: PlayerState) =>
  Object.entries(t.skills).every(([skill, min]) => (levelOf(state, skill) ?? 0) >= (min ?? 0)) &&
  (t.anyQuest ? t.quests.some((q) => questOf(state, q) === 'DONE') : t.quests.every((q) => questOf(state, q) === 'DONE'));

export function slayerRate(m: TrainingMethod, skill: string, state: PlayerState): ModelRate | null {
  const master = MASTERS[m.id];
  if (!master || skill !== 'slayer' || state.mode !== 'members' || state.equipmentKnown !== true || levelOf(state, 'slayer') === undefined) return null;
  const cap = meleeDamagePerHour(state);
  if (cap === null) return null;
  let all = 0, rated = 0, low = 0, high = 0;
  for (const t of master.tasks.filter((t) => assignable(t, state))) {
    all += t.weight;
    const rate = RATES[t.monster.toLowerCase()];
    if (!rate?.[0]) continue;
    rated += t.weight;
    low += t.weight * Math.min(rate[0], cap);
    high += t.weight * Math.min(rate[1], cap);
  }
  if (!all || rated / all < RATED_SHARE) return null;
  return { xph: [low / rated, high / rated], costPerHour: null, basis: `${master.name}'s tasks` };
}
