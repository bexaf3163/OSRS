// The item name as a comparison key, the same way as ActiveTarget.nameKey in the plugin. Memoized (bounded).
// Import-free leaf module: safe to call at module load from anywhere, including former import cycles.
const NAME_KEYS = new Map<string, string>();
export function nameKey(s: string): string {
  let k = NAME_KEYS.get(s);
  if (k === undefined) {
    k = s.replace(/<[^>]*>/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (NAME_KEYS.size >= 20000) NAME_KEYS.clear();
    NAME_KEYS.set(s, k);
  }
  return k;
}
