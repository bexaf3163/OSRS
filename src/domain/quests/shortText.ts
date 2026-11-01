// Short text for the game screen: one line instead of a paragraph. The game needs "what to do now", while the details (dialogues,
// explanations, warnings) stay in the app and in the hover hint.
// Quest steps (data/questStages.json) carry a ready short text in the field s: a human writes it, and it is more exact than any rule.
// This shortening is a fallback, for lines without s (new steps, a step's quick paths):
//  1) "Dialogue: ..." at the end of a line is dropped: the game itself highlights the right answer option;
//  2) the first sentence is taken;
//  3) longer than the limit it is cut at " — " or a comma, otherwise by a word, with an ellipsis.
// The same rules are in the plugin (ShortText.java): the app and the plugin shorten the same way.

/** Longer than this we cut: exactly this much fits in a line of the in-game list. */
export const SHORT_MAX = 64;

const MIN_CUT = 24;

export function shortLine(text: string, max = SHORT_MAX): string {
  let t = text.replace(/\s*Dialogue:[\s\S]*$/, '').trim();
  const first = t.split(/(?<=[.!?])\s+/)[0];
  if (first && first.length >= 12) t = first;
  t = t.replace(/[.\s]+$/, '');
  if (t.length <= max) return t;
  const dash = t.lastIndexOf(' — ', max);
  if (dash >= MIN_CUT) return t.slice(0, dash);
  const comma = t.lastIndexOf(', ', max);
  if (comma >= MIN_CUT) return t.slice(0, comma);
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MIN_CUT))}…`;
}
