// The word form of an action count ("1 log", "11 logs"). The pace line itself ("34 shrimps to 20 Fishing") is the plugin's (PacingSet.java).

/** The word form for a number from "shrimp|shrimps": the first for 1, the last otherwise; a single form as is. */
export function actionForm(forms: string, n: number): string {
  const f = forms.split('|');
  return n === 1 ? f[0] : f[f.length - 1];
}
