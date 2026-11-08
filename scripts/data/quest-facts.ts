import { num, templates } from './wiki.ts';
import type { WikiArticle } from './wiki.ts';
import type { QuestFact } from '../../src/domain/planning/catalogue.ts';

/** Factual fields only. Guide length is not a measured duration; lamps never become assigned XP. */
export function questFacts(article: WikiArticle, stepIds: string[], retrievedAt: string) {
  const details = templates(article.wikitext, 'Quest details')[0];
  const reward = templates(article.wikitext, 'Quest rewards')[0];
  if (!details || !reward || !Number.isInteger(num(reward.qp))) throw new Error(`${article.title}: missing quest facts`);
  const requirements = details.requirements ?? '';
  const skills: Record<string, number> = {}, xp: Record<string, number> = {};
  let questPoints = 0;
  for (const t of templates(requirements, 'SCP')) {
    const skill = t['1']?.toLowerCase(), min = num(t['2']);
    if (!skill || !Number.isInteger(min) || min < 1) throw new Error(`${article.title}: unparsed skill requirement`);
    if (skill === 'quest') questPoints = Math.max(questPoints, min);
    else skills[skill] = Math.max(skills[skill] ?? 0, min);
  }
  // SCP also annotates skill requirements inside unlock descriptions (e.g. Sailing 60), not just XP.
  const xpLines = (reward.rewards ?? '').split(/\r?\n/).filter(line => /^\*+\s*\{\{SCP\|/i.test(line) && /experience|\bXP\b/i.test(line));
  for (const t of templates(xpLines.join('\n'), 'SCP')) {
    const skill = t['1']?.toLowerCase(), amount = num(t['2']);
    if (!skill || !Number.isFinite(amount) || amount < 0) throw new Error(`${article.title}: unparsed XP reward`);
    xp[skill] = (xp[skill] ?? 0) + amount;
  }
  // Only a direct reward bullet is immediate cash. Chest access, retrieval fees and later claims are not liquid quest rewards.
  let coins: number | null = 0;
  for (const line of (reward.rewards ?? '').split(/\r?\n/).filter(line => /\bcoins\b/i.test(line))) {
    const direct = line.match(/^\*+\s*([\d,]+)\s+(?:\[\[coins(?:\|coins)?]]|coins)\s*\.?$/i);
    if (!direct) { coins = null; break; }
    const amount = num(direct[1]);
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(coins + amount)) throw new Error(`${article.title}: unparsed cash reward`);
    coins += amount;
  }
  const quests = templates(requirements, 'Questreq').map(t => t['1']).filter((v): v is string => !!v);
  const manual = /\btrustworthy friend or partner\b/i.test(requirements) ? ['partner'] : [];
  const capabilities: string[] = [];
  const alternativeEscape = /\b(?:defeat|killing) or run(?:ning)? away\b/i.test(requirements);
  if (alternativeEscape) capabilities.push('survival'); // Fighting OR escaping, never an invented requirement to do both.
  else if (/\b(?:defeat|killing|defend)\b/i.test(requirements)) capabilities.push('combat');
  if (!alternativeEscape && /\b(?:running away|run from|get past|evade)\b/i.test(requirements)) capabilities.push('evasion');
  if (/\bhealth (?:recovery|regeneration)\b/i.test(requirements)) capabilities.push('regeneration');
  // Review each clause: recognising one skill must not hide another, unsupported prerequisite.
  const unparsed = requirements.split(/\r?\n/).map(line => line.replace(/^\*+\s*/, '').trim()).filter(Boolean).filter(line => {
    if (/^none\.?$/i.test(line)) return false;
    const structure = line.replace(/\{\{(?:SCP|Questreq|Boostable|Questreqstart)\|[^{}]*}}/gi, '')
      .replace(/\[\[(?:Quest points)(?:\|[^\]]*)?]]/gi, '').trim();
    if (!structure) return false;
    // Exact reviewed clauses deliberately fail closed if the source introduces another mechanic.
    return !REVIEWED_CLAUSES.has(structure.toLowerCase());
  }).join('\n') || null;
  return {
    id: article.title, stepIds, members: /^yes$/i.test(details.members ?? 'no'),
    requirements: { skills, questPoints, quests, manual, capabilities, unparsed, text: requirements },
    rewards: { questPoints: num(reward.qp), xp, coins },
    // A changed revision needs review; item requirements alone do not establish consumption or guaranteed rewards.
    resourceFlow: REVIEWED_FLOWS[article.title]?.revision === article.revision ? REVIEWED_FLOWS[article.title].flow : null,
    length: details.length ?? null,
    // Raw requirements remain available for source review. No text heuristic silently declares them satisfied.
    source: { url: `https://oldschool.runescape.wiki/w/Special:Redirect/revision/${article.revision}`, title: article.title, revision: article.revision, retrievedAt },
  };
}

/** Reviewed walkthrough deliveries, not inferred from item names or the reusable-equipment registry. */
const REVIEWED_FLOWS: Record<string, { revision: number; flow: NonNullable<QuestFact['resourceFlow']> }> = {
  "Cook's Assistant": { revision: 15375073, flow: {
    consumes: [{ name: 'Egg', count: 1 }, { name: 'Bucket of milk', count: 1 }, { name: 'Pot of flour', count: 1 }],
    receives: [], uncertainReceipts: ['Bucket', 'Pot'], partialDelivery: true,
  } },
  "Doric's Quest": { revision: 15367060, flow: {
    consumes: [{ name: 'Clay', count: 6 }, { name: 'Copper ore', count: 4 }, { name: 'Iron ore', count: 2 }],
    receives: [{ name: 'Bronze pickaxe', count: 1, when: 'start' }], partialDelivery: false,
  } },
  'Imp Catcher': { revision: 15375330, flow: {
    consumes: ['Black bead', 'Yellow bead', 'Red bead', 'White bead'].map(name => ({ name, count: 1 })),
    receives: [{ name: 'Amulet of accuracy', count: 1, when: 'complete' }], partialDelivery: false,
  } },
  'Sheep Shearer': { revision: 15367050, flow: {
    consumes: [{ name: 'Ball of wool', count: 20 }], receives: [], acquisitionTools: ['Shears'], partialDelivery: true,
  } },
  'Rune Mysteries': { revision: 15390926, flow: {
    // The newly given talisman is handed over and returned: one net new talisman, never a purchase of the player's old one.
    consumes: [], receives: [{ name: 'Air talisman', count: 1, when: 'complete' }],
    unknownItems: ['Research package', 'Notes'], partialDelivery: false, fromStartOnly: true,
  } },
  'Romeo & Juliet': { revision: 15390733, flow: {
    consumes: [{ name: 'Cadava berries', count: 1 }], receives: [],
    unknownItems: ['Message', 'Cadava potion'], partialDelivery: false, fromStartOnly: true,
  } },
  'X Marks the Spot': { revision: 15367156, flow: {
    consumes: [], receives: [], unknownItems: ['Treasure scroll', 'Mysterious orb', 'Ancient casket'],
    // The lamp is not assigned XP; the beginner scroll box is conditional on existing possession.
    uncertainReceipts: ['Antique lamp', 'Scroll box (beginner)'], partialDelivery: false, fromStartOnly: true,
  } },
  'The Restless Ghost': { revision: 15390078, flow: {
    // Escape the skeleton; no bought ingredient or mandatory kill. The giver may reuse an existing amulet.
    consumes: [], receives: [], unknownItems: ["Ghost's skull"], uncertainReceipts: ['Ghostspeak amulet'],
    partialDelivery: false, fromStartOnly: true,
  } },
  'Ernest the Chicken': { revision: 15390916, flow: {
    // All puzzle parts are obtained within the manor; a spade is reused, not handed in.
    consumes: [], receives: [], unknownItems: ['Fish food', 'Poison', 'Poisoned fish food', 'Pressure gauge', 'Rubber tube', 'Oil can', 'Key'],
    uncertainReceipts: ['Spade', 'Antique lamp'], partialDelivery: false, fromStartOnly: true,
  } },
};

// Source wording is retained here so changed/new prerequisite prose requires a source review,
// rather than an increasingly permissive text heuristic silently asserting eligibility.
const REVIEWED_CLAUSES = new Set([
  'Capable of killing or running away from a [[combat level]] 13 [[skeleton]].',
  'Able to defeat a [[combat level]] 34 [[Count Draynor|vampyre]] with a very high health recovery rate.',
  'Able to defeat or run away from a [[Combat level]] 4 [[gardener]].',
  'The ability to run from [[combat level|level]] 57 [[ice warrior]]s and level 53 [[ice giant]]s could help.',
  'The ability to get past [[aggressive]] [[combat level]] 26 [[jail guard]]s.',
  'The ability to defend from a level 22 [[Skeleton]].',
  'The ability to evade level 33 [[Black Knight]]s',
  'The ability to defeat a level 27 [[Delrith|demon]] aided by three level 20 [[Dark wizard]]s and two level 7 Dark wizards using the [[Silverlight]] in melee.',
  'The ability to defeat a level 83 [[Elvarg|dragon]]',
  'A trustworthy friend or partner. Players can join the official [[chat-channel]] "OSRS SOA" to look for a partner.',
  "to enter the Champions' Guild",
].map(clause => clause.toLowerCase()));
