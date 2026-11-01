// The registry of the skill leveling guides: one JSON file per skill in ./generated/skills (built by tools/skill-guides from the OSRS Wiki), typed once here.

import type { SkillGuideFile, SkillName } from '../domain/training/skillGuide';

import attack from './generated/skills/attack.json';
import strength from './generated/skills/strength.json';
import defence from './generated/skills/defence.json';
import ranged from './generated/skills/ranged.json';
import prayer from './generated/skills/prayer.json';
import magic from './generated/skills/magic.json';
import runecraft from './generated/skills/runecraft.json';
import construction from './generated/skills/construction.json';
import hitpoints from './generated/skills/hitpoints.json';
import agility from './generated/skills/agility.json';
import herblore from './generated/skills/herblore.json';
import thieving from './generated/skills/thieving.json';
import crafting from './generated/skills/crafting.json';
import fletching from './generated/skills/fletching.json';
import slayer from './generated/skills/slayer.json';
import hunter from './generated/skills/hunter.json';
import mining from './generated/skills/mining.json';
import smithing from './generated/skills/smithing.json';
import fishing from './generated/skills/fishing.json';
import cooking from './generated/skills/cooking.json';
import firemaking from './generated/skills/firemaking.json';
import woodcutting from './generated/skills/woodcutting.json';
import farming from './generated/skills/farming.json';

/** All 23 guides by skill. The JSON is checked against the schema by tests/skillsGuide.test.ts. */
export const skillGuides = {
  attack: attack as unknown as SkillGuideFile,
  strength: strength as unknown as SkillGuideFile,
  defence: defence as unknown as SkillGuideFile,
  ranged: ranged as unknown as SkillGuideFile,
  prayer: prayer as unknown as SkillGuideFile,
  magic: magic as unknown as SkillGuideFile,
  runecraft: runecraft as unknown as SkillGuideFile,
  construction: construction as unknown as SkillGuideFile,
  hitpoints: hitpoints as unknown as SkillGuideFile,
  agility: agility as unknown as SkillGuideFile,
  herblore: herblore as unknown as SkillGuideFile,
  thieving: thieving as unknown as SkillGuideFile,
  crafting: crafting as unknown as SkillGuideFile,
  fletching: fletching as unknown as SkillGuideFile,
  slayer: slayer as unknown as SkillGuideFile,
  hunter: hunter as unknown as SkillGuideFile,
  mining: mining as unknown as SkillGuideFile,
  smithing: smithing as unknown as SkillGuideFile,
  fishing: fishing as unknown as SkillGuideFile,
  cooking: cooking as unknown as SkillGuideFile,
  firemaking: firemaking as unknown as SkillGuideFile,
  woodcutting: woodcutting as unknown as SkillGuideFile,
  farming: farming as unknown as SkillGuideFile,
} satisfies Record<SkillName, SkillGuideFile>;

export function guideFor(skill: SkillName): SkillGuideFile {
  return skillGuides[skill];
}
