// The game has a different character than the active profile: levels and marks from the game are not written until the player chooses.

import { useBridge } from '../bridge';
import { addProfile, readProfiles, switchProfile, writeProfiles } from '../lib/profiles';

export function ProfileBanner() {
  const { gate } = useBridge();
  if (gate.kind !== 'switch' && gate.kind !== 'new') return null;
  const create = () => {
    const r = addProfile(readProfiles(), gate.player, gate.player);
    if (!r) return;
    writeProfiles(r.state);
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
