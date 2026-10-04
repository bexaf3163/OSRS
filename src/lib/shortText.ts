// Короткий текст для экрана игры: одна строка вместо абзаца. Игре нужно «что сделать сейчас», а подробности (диалоги,
// пояснения, предупреждения) остаются в программе и в подсказке при наведении.
// Шаги квестов (data/questStages.json) несут готовый короткий текст в поле s — его пишет человек, и он точнее любого правила.
// Это сокращение — запасное, для строк без s (новые шаги, быстрые пути шагов):
//  1) «Диалог: …» — в конце строки — отбрасывается: нужный вариант ответа подсвечивает сама игра;
//  2) берётся первое предложение;
//  3) длиннее предела — режется по « — » или запятой, иначе по слову, с многоточием.
// Те же правила в плагине (ShortText.java): программа и плагин сокращают одинаково.

/** Длиннее этого — режем: ровно столько помещается в строку списка в игре. */
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
