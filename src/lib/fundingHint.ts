// The running funding plan for the game (snapshot part "funding", plugin 2.64.1 and later): the one line the HUD adds while the player is raising coins -
// what to do now and how far it has gone. The plan is the app's (lib/funding/plan.ts); this is its FundingView, the same one the Preparation panel draws,
// so the app and the game never say different things. The plugin only draws it: it recomputes nothing, and an older plugin ignores the field.

import { clipText } from './prepEnvelope';
import type { FundingPlanState, FundingView } from './funding/plan';

export interface FundingHintPayload {
  /** The character the plan belongs to: the plugin shows the line only while that character is logged in. */
  player: string;
  planId: string;
  version: number;
  status: 'ACTIVE';
  title: string;
  /** What to do now, one short sentence. */
  action: string;
  /** The same in a few words for the HUD's narrow plate: the activity's name while working, the first sentence otherwise. */
  brief: string;
  /** "12 / 27 Cowhide", "425 gp to go"; absent when there is nothing to count. */
  progress?: string;
  /** The progress is an estimate (loot not yet sold). */
  estimated?: boolean;
  stepIndex: number;
  stepCount: number;
  /** Only the player can say this sub-step is done (a sale at the exchange): the app shows the button, the game just says so. */
  needsConfirm?: boolean;
}

/** As FundingHint.MAX_TEXT in the plugin. */
export const MAX_FUNDING_TEXT = 120;
/** The HUD plate is narrow: its line is a few words. */
export const MAX_FUNDING_BRIEF = 48;

/** What to do now in a few words: while the work itself is in hand its name ("Kill cows for cowhide"), otherwise the first sentence of the action. */
export function briefOf(view: Pick<FundingView, 'kind' | 'title' | 'action'>): string {
  const text = view.kind === 'perform' ? view.title : view.action;
  return clipText(text.split(/(?<=[.!?])\s/)[0] ?? text, MAX_FUNDING_BRIEF);
}

/**
 * The line for a plan that is running. Nothing for a paused plan (its arrow is down and the HUD stays quiet), for no plan, or for a character that is not
 * known: a plan is shown to the game only under the name it was made for.
 */
export function fundingHintPayload(plan: FundingPlanState | null, view: FundingView | null, player: string | null): FundingHintPayload | null {
  if (!plan || !view || plan.status !== 'ACTIVE' || view.status !== 'ACTIVE' || !player || plan.character !== player) return null;
  return {
    player,
    planId: clipText(plan.id, 80),
    version: view.version,
    status: 'ACTIVE',
    title: clipText(view.title, 60),
    action: clipText(view.action, MAX_FUNDING_TEXT),
    brief: briefOf(view),
    ...(view.progress ? { progress: clipText(view.progress, 60) } : {}),
    ...(view.estimated && view.progress ? { estimated: true } : {}),
    stepIndex: view.stepIndex,
    stepCount: view.stepCount,
    ...(view.needsConfirm ? { needsConfirm: true } : {}),
  };
}
