/** Legacy equipment rows prove one worn item, but not the size of a stack. */
export interface WornItem { name: string; count?: number }

export function countWorn(items: readonly WornItem[] | null | undefined, accepts: (name: string) => boolean): { count: number; known: boolean } {
  if (!items) return { count: 0, known: false };
  let count = 0;
  let known = true;
  for (const item of items) {
    if (!accepts(item.name)) continue;
    if (item.count === undefined) { count++; known = false; }
    else if (Number.isSafeInteger(item.count) && item.count > 0 && Number.isSafeInteger(count + item.count)) count += item.count;
    else known = false;
  }
  return { count, known };
}
