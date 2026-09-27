// Как объяснить автоотметку шага: «Шаг отметится сам, когда …». Одна фраза на любое условие —
// квест, уровни, предметы или их сочетание.

import type { CompletionTrigger, OwnedItem } from '../types';

/** «Fishing 30» — навыки названы так же, как во вкладке навыков игры и в «Готово, когда». */
function skillName(skill: string): string {
  return skill.charAt(0).toUpperCase() + skill.slice(1);
}

function list(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/** «Maze key», «50 × Shrimps или Anchovies», «20 000 × Coins». */
export function ownedText(i: OwnedItem): string {
  const names = i.names.join(' или ');
  return i.count > 1 ? `${i.count.toLocaleString('ru-RU')} × ${names}` : names;
}

/** Хвост фразы после «Шаг отметится сам, когда …». */
export function triggerText(t: CompletionTrigger): string {
  const items = t.items?.length ? `у тебя будет ${list(t.items.map(ownedText))} (сумка, надетое и банк вместе)` : '';
  const and = (head: string) => (items ? `${head}, и ${items}` : head);
  switch (t.type) {
    case 'QUEST_COMPLETED':
      return and('квест засчитается в игре');
    case 'SKILL_LEVEL':
      return and(`в игре будет ${list((t.levels ?? []).map((l) => `${skillName(l.skill)} ${l.level}`))}`);
    case 'ITEM_OWNED':
      return items || 'предмет появится у тебя';
    case 'CHAT_MESSAGE':
      return 'в чате игры появится нужное сообщение';
    case 'VARBIT_CHANGED':
      return 'игра засчитает этот этап';
  }
}
