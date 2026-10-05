// How to explain an automatic step mark: "The step will be marked by itself when …". One phrase for any condition —
// a quest, levels, items or a combination of them.

import type { CompletionTrigger, OwnedItem } from '../types';

/** "Fishing 30": skills are named as in the game's skills tab and in "Done when". */
function skillName(skill: string): string {
  return skill.charAt(0).toUpperCase() + skill.slice(1);
}

function list(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/** "Maze key", "50 × Shrimps or Anchovies", "20,000 × Coins". */
export function ownedText(i: OwnedItem): string {
  const names = i.names.join(' or ');
  return i.count > 1 ? `${i.count.toLocaleString('en-US')} × ${names}` : names;
}

/** The tail of the phrase after "The step will be marked by itself when …". */
export function triggerText(t: CompletionTrigger): string {
  const items = t.items?.length ? `you will have ${list(t.items.map(ownedText))} (bag, equipped and bank together)` : '';
  const and = (head: string) => (items ? `${head}, and ${items}` : head);
  switch (t.type) {
    case 'QUEST_COMPLETED':
      return and('the quest is counted in the game');
    case 'SKILL_LEVEL':
      return and(`you reach ${list((t.levels ?? []).map((l) => `${skillName(l.skill)} ${l.level}`))} in the game`);
    case 'ITEM_OWNED':
      return items || 'the item appears in your possession';
    case 'CHAT_MESSAGE':
      return 'the needed message appears in the game chat';
    case 'VARBIT_CHANGED':
      return 'the game counts this stage';
  }
}
