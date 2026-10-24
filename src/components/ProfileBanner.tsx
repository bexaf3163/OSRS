// The game has a different character than the active profile: levels and marks from the game are not written until the player chooses.

import { useBridge } from '../bridge';
import { addProfile, profileConflict, readProfiles, resolveProfileConflict, retryProfileSave, switchProfile, useProfileSaveError, writeProfiles, type ProfilesState } from '../lib/profiles';

export function ProfileBanner() {
  const { gate } = useBridge();
  const saveError = useProfileSaveError();
  const conflict = gate.kind === 'protected' && gate.reason === 'conflict' ? profileConflict() : null;
  if (conflict) return <ProfileConflict local={conflict.local} file={conflict.file} merged={conflict.merged} failed={saveError} />;
  if (gate.kind === 'protected') return (
    <div className="plaque plaque-warning profile-storage-warning" role="alert">
      <p><strong>Character data is protected</strong></p>
      <p className="small">{gate.reason === 'conflict'
        ? 'The saved profile lists disagree. Profile saving and game sync are paused so neither list is overwritten. Both originals are retained for recovery.'
        : 'Profile saving and game sync are paused. Restore a compatible profiles.json backup, or use the app version that supports your saved format, then restart. Original sources are retained.'}</p>
    </div>
  );
  if (saveError) return (
    <div className="plaque plaque-warning profile-write-warning" role="alert">
      <p><strong>Profile change was not saved</strong></p>
      <p className="small">{saveError}</p>
      <button type="button" className="btn btn-sm" onClick={retryProfileSave}>Retry profile save</button>
    </div>
  );
  if (gate.kind !== 'switch' && gate.kind !== 'new') return null;
  const create = () => {
    const r = addProfile(readProfiles(), gate.player, gate.player);
    if (!r) return;
    if (!writeProfiles(r.state)) return;
    switchProfile(r.id);
  };
  return (
    <div className="plaque plaque-warning" role="alert">
      {gate.kind === 'switch'
        ? (
          <>
            <p><strong>The character {gate.player} is in the game — that is the profile "{gate.profile.name}"</strong></p>
            <p className="small">While another profile is open, levels and marks from the game are not written into it.</p>
            <div className="actions"><button type="button" className="btn btn-primary" onClick={() => switchProfile(gate.profile.id)}>Switch to "{gate.profile.name}"</button></div>
          </>
        )
        : (
          <>
            <p><strong>A new character is in the game: {gate.player}</strong></p>
            <p className="small">The active profile is tied to another character, so levels and marks from the game are not written here. Create a separate profile — it will have its own progress.</p>
            <div className="actions"><button type="button" className="btn btn-primary" onClick={create}>Create the profile "{gate.player}"</button></div>
          </>
        )}
    </div>
  );
}

const names = (s: ProfilesState): string => s.list.map((p) => `${p.name}${p.player ? ` (${p.player})` : ''}`).join(', ');

/** Two saved profile lists disagree: the player picks, nothing is written before that and both originals stay as recovery copies. */
function ProfileConflict({ local, file, merged, failed }: { local: ProfilesState; file: ProfilesState; merged: ProfilesState | null; failed: string | null }) {
  return (
    <div className="plaque plaque-warning profile-storage-warning profile-conflict" role="alert">
      <p><strong>Two saved profile lists disagree</strong></p>
      <p className="small">Profile saving and game sync are paused until you choose. Both originals are kept as recovery copies.</p>
      <ul className="small">
        <li>This window: {names(local)}</li>
        <li>The app's file: {names(file)}</li>
      </ul>
      <div className="actions">
        {merged && <button type="button" className="btn btn-primary btn-sm" onClick={() => resolveProfileConflict('merge')}>Merge both lists</button>}
        <button type="button" className={`btn btn-sm ${merged ? 'btn-ghost' : ''}`} onClick={() => resolveProfileConflict('local')}>Keep this window's list</button>
        <button type="button" className={`btn btn-sm ${merged ? 'btn-ghost' : ''}`} onClick={() => resolveProfileConflict('file')}>Keep the file's list</button>
      </div>
      {!merged && <p className="small muted">They cannot be merged: one profile is bound to two different characters.</p>}
      {failed && <p className="small">{failed}</p>}
    </div>
  );
}
