import type { Progress } from '../types';
import type { DesktopBridge } from './desktop';
import { saveProgress } from './progress';

/** Persist independently to both stores. A file's acknowledgement is a write result, not a receipt for the IPC message. */
export async function persistProgress(p: Progress, storage: Pick<Storage, 'setItem'> | undefined, key: string, api: Pick<DesktopBridge, 'saveProgressFile' | 'saveProgressFileChecked'> | undefined, profile: string): Promise<string | null> {
  const local = saveProgress(storage, p, key);
  let file: boolean | null = null;
  let fileError: string | null = null;
  try {
    if (api?.saveProgressFileChecked) {
      const receipt = await api.saveProgressFileChecked(JSON.stringify(p), profile);
      file = receipt.ok === true;
      fileError = receipt.error;
    }
    else api?.saveProgressFile(JSON.stringify(p), profile);
  } catch { file = false; }
  if (local && (file === true || file === null)) return null;
  if (local && (fileError === 'EXTERNAL_CHANGE' || fileError === 'NATIVE_NOT_LOADED')) {
    const reason = fileError === 'EXTERNAL_CHANGE' ? 'The desktop file changed outside this app' : 'The desktop file has not been read';
    return `Your edits are saved in browser storage. ${reason}; it was not overwritten. Export your edits in Settings, then reload to review the desktop file.`;
  }
  if (local) return 'Progress is saved in browser storage, but its desktop file could not be written. Export a backup in Settings before closing.';
  if (file === true) return 'Progress is saved to its desktop file, but browser storage is unavailable. Export a backup in Settings.';
  return 'Progress could not be saved to a confirmed persistent copy. Changes are in memory; export a backup in Settings before closing.';
}
