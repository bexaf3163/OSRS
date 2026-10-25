// The wiki's aggression rule ("Aggressiveness"): a monster aggressive by level attacks a player whose combat level is at most twice its own. After ten
// minutes in the area it becomes tolerant; that is not counted here, so a spot is judged by its first minutes. One rule for every spot that has
// aggressive NPCs (data/skilling.json hostiles, read from each NPC's own spawn lines).

/** Whether a monster of this level attacks the player; an unknown combat level counts as attacked (unknown is never safe). */
export function attacksPlayer(npcLevel: number, combat: number | null): boolean {
  return combat === null || combat <= 2 * npcLevel;
}

/** One line for the player: "Scorpions (level 14) attack players of combat level 28 or lower". */
export function hostileText(npc: string, level: number): string {
  return `${npc.endsWith('s') ? npc : `${npc}s`} (level ${level}) attack players of combat level ${2 * level} or lower`;
}
