// Shared source admission for the renderer and native backup selection.
// Field normalization and route migrations remain in progress.ts / profiles.ts.
export const EXPORT_APP = 'osrs-put';
export const PROGRESS_VERSION = 3;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function inspectProgress(data) {
  if (!object(data) || (data.app !== undefined && data.app !== EXPORT_APP)) return 'invalid';
  if (data.version !== undefined && ![1, 2, PROGRESS_VERSION].includes(data.version)) return 'unsupported';
  return ['steps', 'levels', 'notes'].some(key => object(data[key])) ? 'valid' : 'invalid';
}

export function validProfileText(raw) {
  try {
    const data = JSON.parse(raw);
    if (!object(data) || Object.hasOwn(data, 'version') || !Array.isArray(data.list) || data.list.length > 8) return false;
    const seen = new Set();
    for (const row of data.list) {
      if (!object(row) || typeof row.id !== 'string' || !/^[a-z0-9]{1,12}$/.test(row.id) || seen.has(row.id)) return false;
      seen.add(row.id);
      if (row.name !== undefined && typeof row.name !== 'string') return false;
      if (row.player !== undefined && (typeof row.player !== 'string' || row.player.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12) !== row.player)) return false;
    }
    // A legacy list may omit Main, provided adding it cannot evict a saved character.
    if (!seen.has('main') && seen.size === 8) return false;
    return data.active === undefined || data.active === 'main' || (typeof data.active === 'string' && seen.has(data.active));
  } catch { return false; }
}

export function validSavedText(name, raw) {
  if (name === 'profiles.json') return validProfileText(raw);
  try { return inspectProgress(JSON.parse(raw)) === 'valid'; } catch { return false; }
}
