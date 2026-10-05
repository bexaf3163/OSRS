// The registry of the skill leveling guides: one JSON file per skill in ./skills (built by tools/skill-guides from the OSRS Wiki), typed once here.

import type { SkillGuideFile, SkillName } from '../lib/skillGuide';

import attack from './skills/attack.json';
import strength from './skills/strength.json';
import defence from './skills/defence.json';
import ranged from './skills/ranged.json';
import prayer from './skills/prayer.json';
import magic from './skills/magic.json';
import runecraft from './skills/runecraft.json';
import construction from './skills/construction.json';
import hitpoints from './skills/hitpoints.json';
import agility from './skills/agility.json';
import herblore from './skills/herblore.json';
import thieving from './skills/thieving.json';
import crafting from './skills/crafting.json';
import fletching from './skills/fletching.json';
import slayer from './skills/slayer.json';
import hunter from './skills/hunter.json';
import mining from './skills/mining.json';
import smithing from './skills/smithing.json';
import fishing from './skills/fishing.json';
import cooking from './skills/cooking.json';
import firemaking from './skills/firemaking.json';
import woodcutting from './skills/woodcutting.json';
import farming from './skills/farming.json';

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
