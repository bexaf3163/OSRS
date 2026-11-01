// Small text helpers shared by the engines.

/** English plural: plural(21, 'item', 'items') gives "items"; plural(1, ...) gives "item". */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const MAX_TEXT = 200;
/** A string no longer than the plugin's limit: cut at a word, with an ellipsis. */
export function clipText(s: string, max = MAX_TEXT): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2)))}…`;
}
