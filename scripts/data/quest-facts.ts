import { num, templates } from './wiki.ts';
import type { WikiArticle } from './wiki.ts';
import type { QuestFact } from '../../src/domain/planning/catalogue.ts';

/** Factual fields only. Guide length is not a measured duration; lamps never become assigned XP. */
export function questFacts(article: WikiArticle, stepIds: string[], retrievedAt: string) {
  const details = templates(article.wikitext, 'Quest details')[0];
  // Miniquests (Alfred Grimhand's Barcrawl) have no rewards box and give no quest points.
  const reward = templates(article.wikitext, 'Quest rewards')[0]
    ?? (templates(article.wikitext, 'Infobox Miniquest').length ? { qp: '0' } : undefined);
  if (!details || !reward || !Number.isInteger(num(reward.qp))) throw new Error(`${article.title}: missing quest facts`);
  // Editor comments (<!-- ... -->) are notes to Wiki editors, not requirements.
  const requirements = (details.requirements ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const skills: Record<string, number> = {}, xp: Record<string, number> = {};
  let questPoints = 0;
  for (const t of templates(requirements, 'SCP')) {
    const skill = t['1']?.toLowerCase(), min = num(t['2']);
    // "{{SCP|Quest}} [[Gertrude's Cat]]" is only the quest icon before a quest name.
    if (skill === 'quest' && t['2'] === undefined) continue;
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
  // Members cards write "Completion of [[A]]" or "Completion of the following quests:" with "** [[A]]" under it;
  // deeper "***" lines are the prerequisites' own prerequisites.
  const lines = requirements.split(/\r?\n/);
  // Only exact forms are read (and left out of `unparsed`); a clause with anything more stays unparsed.
  const firstLink = (line: string) => /\[\[([^\]|#]+)/.exec(line)?.[1] ?? [];
  const consumed = new Set<number>();
  const listed = lines.flatMap((line, i) => {
    // A partial start (Creature of Fenkenstrain's Restless Ghost) is kept as the whole quest: stricter, and its keepsakes count.
    // The quest icon ({{SCP|Quest}}) and the start marker ({{Questreqstart|..}}) around the link add nothing.
    const bare = line.replace(/\{\{(?:SCP\|Quest|Questreqstart\|[^{}]*)\}\}/gi, '').replace(/ +/g, ' ');
    if (/^\*\s*(?:Partial c|C)omplet(?:ion of|ed) \[\[[^\]]+\]\](?: quest)?\.?\s*$/i.test(bare)) return consumed.add(i), firstLink(bare);
    if (/^\*\s*Completion of the following quests?:?\s*$/i.test(line)) return consumed.add(i), [];
    const head = lines.slice(0, i).reverse().find(l => /^\*(?!\*)/.test(l)) ?? '';
    if (!/^\*\*+\s*\[\[[^\]]+\]\]\s*$/.test(line) || !/Completion of the following quests?/i.test(head)) return [];
    consumed.add(i);
    return /^\*\*(?!\*)/.test(line) ? firstLink(line) : [];
  });
  const quests = [...new Set([...templates(requirements, 'Questreq').map(t => t['1']).filter((v): v is string => !!v), ...listed])];
  const manual = /\b(?:trustworthy friend or )?partner\b/i.test(requirements) ? ['partner'] : [];
  const capabilities: string[] = [];
  const alternativeEscape = /\b(?:defeat|killing) or run(?:ning)? away\b/i.test(requirements);
  if (alternativeEscape) capabilities.push('survival'); // Fighting OR escaping, never an invented requirement to do both.
  else if (/\b(?:defeat|killing|defend)\b/i.test(requirements)) capabilities.push('combat');
  if (!alternativeEscape && /\b(?:running away|run from|run past|get past|evade)\b/i.test(requirements)) capabilities.push('evasion');
  if (/\bhealth (?:recovery|regeneration)\b/i.test(requirements)) capabilities.push('regeneration');
  // Review each clause: recognising one skill must not hide another, unsupported prerequisite.
  const unparsed = lines.filter((_, i) => !consumed.has(i)).map(line => line.replace(/^\*+\s*/, '').trim()).filter(Boolean).filter(line => {
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
  'Rune Mysteries': { revision: 15403897, flow: {
    // The newly given talisman is handed over and returned: one net new talisman, never a purchase of the player's old one.
    consumes: [], receives: [{ name: 'Air talisman', count: 1, when: 'complete' }],
    unknownItems: ['Research package', 'Notes'], partialDelivery: false, fromStartOnly: true,
  } },
  'Romeo & Juliet': { revision: 15403888, flow: {
    consumes: [{ name: 'Cadava berries', count: 1 }], receives: [],
    unknownItems: ['Message', 'Cadava potion'], partialDelivery: false, fromStartOnly: true,
  } },
  'X Marks the Spot': { revision: 15367156, flow: {
    consumes: [], receives: [], unknownItems: ['Treasure scroll', 'Mysterious orb', 'Ancient casket'],
    // The lamp is not assigned XP; the beginner scroll box is conditional on existing possession.
    uncertainReceipts: ['Antique lamp', 'Scroll box (beginner)'], partialDelivery: false, fromStartOnly: true,
  } },
  'The Restless Ghost': { revision: 15390078, flow: {
    // Escape the skeleton; no bought ingredient or mandatory kill. The giver may reuse an existing amulet,
    // but the ghost is only talked to while it is worn, so one is held at the end.
    consumes: [], receives: [], unknownItems: ["Ghost's skull"], ensures: ['Ghostspeak amulet'],
    partialDelivery: false, fromStartOnly: true,
  } },
  'Lost City': { revision: 15398217, flow: {
    // The Dramen branch is cut after the Tree spirit and carved into the staff that opens Zanaris; the quest ends wielding it.
    consumes: [], receives: [], unknownItems: ['Dramen branch'], ensures: ['Dramen staff'], partialDelivery: false, fromStartOnly: true,
  } },
  "Merlin's Crystal": { revision: 15393586, flow: {
    // The beggar takes the bread; the wax becomes the black candle, which burns with the bat bones in the star; Excalibur is kept.
    consumes: [{ name: 'Bread', count: 1 }, { name: 'Bucket of wax', count: 1 }, { name: 'Bat bones', count: 1 }], receives: [], unknownItems: ['Black candle'],
    ensures: ['Excalibur'], partialDelivery: false, fromStartOnly: true,
  } },
  'Nature Spirit': { revision: 15372142, flow: {
    // The silver sickle is blessed at the grotto; the druid pouch is first obtained here (Wiki Druid pouch). Both are kept.
    consumes: [{ name: 'Silver sickle', count: 1 }], receives: [], unknownItems: [],
    ensures: ['Silver sickle (b)', 'Druid pouch'], partialDelivery: false, fromStartOnly: true,
  } },
  // The feather becomes the quill; the scroll, quill and orb are quest items. The two lamps are spent at once.
  'Client of Kourend': { revision: 15384473, flow: {
    consumes: [{ name: 'Feather', count: 1 }], receives: [], unknownItems: ['Enchanted scroll', 'Enchanted quill', 'Mysterious orb'],
    uncertainReceipts: ['Antique lamp'], partialDelivery: false, fromStartOnly: true,
  } },
  // Tenzing takes the food and the spiked boots (made from the bought climbing boots and the bar). The ale comes
  // from the pub's bar during the quest; lost bets with Harold are not counted. Steel claws are the reward.
  'Death Plateau': { revision: 15382205, flow: {
    consumes: [{ name: 'Bread', count: 10 }, { name: 'Trout', count: 10 }, { name: 'Iron bar', count: 1 }, { name: 'Coins', count: 12 }],
    receives: [{ name: 'Steel claws', count: 1, when: 'complete' }],
    unknownItems: ['Asgarnian ale', 'IOU', 'Combination', 'Stone ball', 'Certificate', 'Climbing boots', 'Spiked boots', 'Secret way map'],
    partialDelivery: false, fromStartOnly: true,
  } },
  // Nothing is used up; the Varlamore Envoy is a quest book. The reward coins are paid at the end.
  'The Depths of Despair': { revision: 15365598, flow: {
    consumes: [], receives: [], unknownItems: ['The Varlamore Envoy'], partialDelivery: false, fromStartOnly: true,
  } },
  // The address label and the totem are quest items; only boat fares are paid.
  'Tribal Totem': { revision: 15240951, flow: {
    consumes: [], receives: [], unknownItems: ['Address label', 'Totem'], partialDelivery: false, fromStartOnly: true,
  } },
  // The bellows take the leather and thread; four coal smelt the elemental ore. The knife and needle are kept.
  'Elemental Workshop I': { revision: 15360762, flow: {
    consumes: [{ name: 'Coal', count: 4 }, { name: 'Leather', count: 1 }, { name: 'Thread', count: 1 }],
    receives: [{ name: 'Elemental shield', count: 1, when: 'complete' }],
    unknownItems: ['Battered book', 'Battered key', 'Stone bowl', 'Elemental ore', 'Elemental metal'], partialDelivery: false, fromStartOnly: true,
  } },
  // Feathers and wolf bones become the ogre arrows Rantz keeps; you keep his ogre bow and the bellows (Freeing Skrach Uglogwee needs both).
  'Big Chompy Bird Hunting': { revision: 15367289, flow: {
    consumes: [{ name: 'Feather', count: 100 }, { name: 'Wolf bones', count: 4 }], receives: [{ name: 'Ogre bow', count: 1, when: 'complete' }, { name: 'Ogre bellows', count: 1, when: 'complete' }],
    unknownItems: ['Achey tree logs', 'Ogre arrow shaft', 'Ogre arrow', 'Bloated toad', 'Raw chompy', 'Seasoned chompy'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // The beer, the berries and vial (the dye), the lens, the earth runes and the sand are all handed over or used up.
  'The Hand in the Sand': { revision: 15355846, flow: {
    consumes: [{ name: 'Beer', count: 1 }, { name: 'Vial', count: 1 }, { name: 'Redberries', count: 1 }, { name: 'White berries', count: 1 },
      { name: 'Lantern lens', count: 1 }, { name: 'Earth rune', count: 5 }, { name: 'Bucket of sand', count: 1 }],
    receives: [], unknownItems: ['Rota', 'Sand', "Wizard's head", 'Truth serum', 'Magical orb', 'Pink dye', 'Rose-tinted lens', "Sandy's rota"],
    partialDelivery: true, fromStartOnly: true,
  } },
  // Everything but the tinderbox goes into the balloon, its sandbags and the flight (logs burn on the way).
  'Enlightened Journey': { revision: 15375125, flow: {
    consumes: [{ name: 'Papyrus', count: 3 }, { name: 'Ball of wool', count: 1 }, { name: 'Potatoes(10)', count: 1 }, { name: 'Empty sack', count: 8 },
      { name: 'Candle', count: 1 }, { name: 'Yellow dye', count: 1 }, { name: 'Red dye', count: 1 }, { name: 'Silk', count: 10 },
      { name: 'Bowl', count: 1 }, { name: 'Logs', count: 10 }, { name: 'Willow branch', count: 12 }],
    receives: [], unknownItems: ['Balloon structure', 'Origami balloon', 'Sandbag'], partialDelivery: true, fromStartOnly: true,
  } },
  // Robert O'Reilly takes the stew; the poison, letter and chest contents stay quest items. The 2,000 coins come at the end.
  'The Queen of Thieves': { revision: 15380705, flow: {
    consumes: [{ name: 'Stew', count: 1 }], receives: [], unknownItems: ['Poison', 'Letter', "Hughes' letter"], partialDelivery: false, fromStartOnly: true,
  } },
  // The clay mends the golem; the vial becomes ink and the papyrus the program. The phoenix feather is grabbed in the quest; the gate keeps the pass.
  'The Golem': { revision: 15321144, flow: {
    consumes: [{ name: 'Soft clay', count: 4 }, { name: 'Vial', count: 1 }, { name: 'Papyrus', count: 1 }, { name: 'Shantay pass', count: 1 }], receives: [],
    unknownItems: ['Letter', 'Statuette', 'Black mushroom', 'Black mushroom ink', 'Phoenix quill', 'Golem program', 'Display cabinet key', 'Strange implement'], partialDelivery: true, fromStartOnly: true,
  } },
  // The Male Slave keeps the desert shirt and robe; one bar and the feathers become the prototype dart. Spare bars cover failed attempts.
  'The Tourist Trap': { revision: 15396485, flow: {
    consumes: [{ name: 'Desert shirt', count: 1 }, { name: 'Desert robe', count: 1 }, { name: 'Bronze bar', count: 1 }, { name: 'Feather', count: 10 }, { name: 'Shantay pass', count: 1 }], receives: [],
    unknownItems: ['Metal key', 'Slave shirt', 'Slave robe', 'Slave boots', 'Technical plans', 'Prototype dart tip', 'Prototype dart', 'Barrel', 'Ana in a barrel', 'Wrought iron key', 'Bedabin key'],
    uncertainReceipts: ['Bronze bar'], partialDelivery: true, fromStartOnly: true,
  } },
  // A short Varlamore tale: nothing is brought or used up.
  'Children of the Sun': { revision: 15391674, flow: {
    consumes: [], receives: [], unknownItems: [], partialDelivery: false, fromStartOnly: true,
  } },
  // The pickaxe and lit candle are kept; the brooch, book, key and silverware stay quest items.
  'The Lost Tribe': { revision: 15392360, flow: {
    consumes: [], receives: [], unknownItems: ['Brooch', 'Goblin symbol book', 'Key', 'Silverware', 'Peace treaty'], partialDelivery: false, fromStartOnly: true,
  } },
  // The rope stays on the boulder and the plank may stay at the flat stone; mud, fruit and rocks are quest items.
  'Mountain Daughter': { revision: 15389202, flow: {
    consumes: [{ name: 'Rope', count: 1 }, { name: 'Plank', count: 1 }], receives: [],
    unknownItems: ['Mud', 'Thorny bushes fruit', 'Necklace', 'Corpse of woman', 'Muddy rocks', 'Bearhead'], uncertainReceipts: ['Plank'], partialDelivery: true, fromStartOnly: true,
  } },
  // The bear fur goes into the fake head; the farm supplies the rest of the kit (inStep items).
  'Getting Ahead': { revision: 15367125, flow: {
    consumes: [{ name: 'Bear fur', count: 1 }], receives: [], unknownItems: ['Soft clay', 'Clay head', 'Fur head', 'Bloody head'], partialDelivery: true, fromStartOnly: true,
  } },
  // Each of the ten drinks is paid for at the bar; the card stays a quest item.
  "Alfred Grimhand's Barcrawl": { revision: 15366023, flow: {
    consumes: [{ name: 'Coins', count: 208 }], receives: [], unknownItems: ['Barcrawl card'], partialDelivery: true, fromStartOnly: true,
  } },
  // Thormac lends the cage; the jail key opens Velrak's cell and Velrak's dusty key is kept.
  'Scorpion Catcher': { revision: 15363122, flow: {
    consumes: [], receives: [], unknownItems: ['Scorpion cage', 'Jail key'], partialDelivery: false, fromStartOnly: true,
  } },
  // The logs, salt, sap, linen and a waterskin go into the embalming and the guardian; the gate keeps the pass; the kitten stays yours and the catspeak amulet is the reward.
  "Icthlarin's Little Helper": { revision: 15401465, flow: {
    consumes: [{ name: 'Willow logs', count: 1 }, { name: 'Bag of salt', count: 1 }, { name: 'Bucket of sap', count: 1 }, { name: 'Linen', count: 1 },
      { name: 'Waterskin(4)', count: 1 }, { name: 'Shantay pass', count: 1 }], receives: [{ name: 'Catspeak amulet', count: 1, when: 'complete' }],
    unknownItems: ['Holy symbol', 'Canopic jar', 'Crondis canopic jar', 'Het canopic jar', 'Apmeken canopic jar', 'Scabaras canopic jar'], partialDelivery: true, fromStartOnly: true,
  } },
  // The coins buy the clothes; the runes cast Telekinetic Grab; logs, coal and the bar feed the spinning machine and the axe; the pie and sapphires are handed in.
  'The Giant Dwarf': { revision: 15375425, flow: {
    consumes: [{ name: 'Coins', count: 200 }, { name: 'Air rune', count: 1 }, { name: 'Law rune', count: 1 }, { name: 'Logs', count: 1 }, { name: 'Coal', count: 1 },
      { name: 'Iron bar', count: 1 }, { name: 'Sapphire', count: 3 }, { name: 'Redberry pie', count: 1 }], receives: [],
    unknownItems: ['Book on costumes', 'Exquisite clothes', 'Exquisite boots', 'Dwarven battleaxe', 'Left boot', 'Right boot'], partialDelivery: true, fromStartOnly: true,
  } },
  // Nothing is brought; the poison, scrolls, key and armour are quest items.
  'Hazeel Cult': { revision: 15328196, flow: {
    consumes: [], receives: [], unknownItems: ['Poison', 'Hazeel scroll', 'Chest key', 'Carnillean armour'], partialDelivery: false, fromStartOnly: true,
  } },
  // The climbing boots are kept; the prison and cell keys are quest items.
  'Troll Stronghold': { revision: 15395347, flow: {
    consumes: [], receives: [], unknownItems: ['Prison key', 'Cell key 1', 'Cell key 2'], partialDelivery: false, fromStartOnly: true,
  } },
  // Nothing is brought (the Wilderness visit carries nothing to lose); the scrying orb is a quest item.
  'Enter the Abyss': { revision: 15292255, flow: {
    consumes: [], receives: [], unknownItems: ['Scrying orb'], partialDelivery: false, fromStartOnly: true,
  } },
  // The vodka and pineapple make the drunk parrot; the logs, grain, chickens and ranarr potion go to Eadgar and Sanfew. The boots and pestle are kept.
  "Eadgar's Ruse": { revision: 15376618, flow: {
    consumes: [{ name: 'Vodka', count: 1 }, { name: 'Pineapple chunks', count: 1 }, { name: 'Logs', count: 1 }, { name: 'Grain', count: 10 },
      { name: 'Raw chicken', count: 5 }, { name: 'Ranarr potion (unf)', count: 1 }], receives: [],
    unknownItems: ['Parrot', 'Drunk parrot', 'Dirty robe', 'Fake man', 'Goutweed', 'Troll thistle', 'Dried thistle', 'Ground thistle', 'Troll potion'], partialDelivery: true, fromStartOnly: true,
  } },
  // The lantern, tools and rope are kept; the magic stone and stone bowl are quest items.
  'Tears of Guthix': { revision: 15292296, flow: {
    consumes: [], receives: [], unknownItems: ['Magic stone', 'Stone bowl'], partialDelivery: false, fromStartOnly: true,
  } },
  // The runes are cast at the Strange Device and the rope tied on the way; darts and food are spent in fights.
  'Tale of the Righteous': { revision: 15402882, flow: {
    consumes: [{ name: 'Air rune', count: 6 }, { name: 'Mind rune', count: 3 }, { name: 'Rope', count: 1 }], receives: [],
    unknownItems: [], uncertainReceipts: ['Bronze dart', 'Trout'], partialDelivery: true, fromStartOnly: true,
  } },
  // Nothing is brought or used up; the 2,000 coins are paid at the end.
  'The Ascent of Arceuus': { revision: 15366179, flow: {
    consumes: [], receives: [], unknownItems: ['Device'], partialDelivery: false, fromStartOnly: true,
  } },
  // The yellow dye, swamp tar and 50 coins pay for the eagle disguise in Varrock; the feathers and seed are quest items.
  "Eagles' Peak": { revision: 15389796, flow: {
    consumes: [{ name: 'Yellow dye', count: 1 }, { name: 'Swamp tar', count: 1 }, { name: 'Coins', count: 50 }], receives: [],
    unknownItems: ['Bird book', 'Metal feather', 'Bronze feather', 'Silver feather', 'Golden feather', 'Odd bird seed', 'Eagle feather', 'Eagle cape', 'Fake beak'],
    partialDelivery: false, fromStartOnly: true,
  } },
  // The milky nettle tea goes to the Old Crone, silk and thread repair the model ship, the slime dyes the bedsheet and the oak longbow
  // is signed for Ak-Haranu; the dyes left over and the tools are kept, the ecto-tokens pay the boat to Dragontooth Island.
  'Ghosts Ahoy': { revision: 15360836, flow: {
    consumes: [{ name: 'Bucket of milk', count: 1 }, { name: 'Nettle tea', count: 1 }, { name: 'Silk', count: 1 }, { name: 'Thread', count: 1 },
      { name: 'Bucket of slime', count: 1 }, { name: 'Oak longbow', count: 1 }],
    receives: [],
    unknownItems: ['Ecto-token', 'Model ship', 'Map scrap', 'Treasure map', 'Book of haricanto', 'Translation manual', 'Bedsheet', 'Petition form', 'Bone key', 'Chest key', 'Robes'],
    uncertainReceipts: ['Red dye', 'Yellow dye', 'Blue dye'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // Nothing is brought or used up; the tinderbox is found in the tower and the puzzle parts are quest items.
  'The Forsaken Tower': { revision: 15316647, flow: {
    consumes: [], receives: [],
    unknownItems: ['Generator crank', '5-gallon jug', '8-gallon jug', 'Old notes', 'Unknown fluid', 'Energy disk', "Dinh's hammer"],
    partialDelivery: false, fromStartOnly: true,
  } },
  // Melina keeps the sapphire amulet; the spade and the ghostspeak amulet are kept, the key, journal, scroll and letter are quest items.
  'Making History': { revision: 15315243, flow: {
    consumes: [{ name: 'Sapphire amulet', count: 1 }], receives: [],
    unknownItems: ['Ecto-token', 'Enchanted key', 'Chest', 'Journal', 'Scroll', 'Letter'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // The pot is filled with flour and kept; the thread, flypaper, prints and items of the suspects are quest items.
  'Murder Mystery': { revision: 15365419, flow: {
    consumes: [], receives: [],
    unknownItems: ['Pungent pot', "Criminal's dagger", 'Flypaper', "Criminal's thread", 'Silver cup', 'Silver pot', 'Silver book', 'Silver bottle', 'Silver necklace', 'Silver needle', 'Killers print'],
    partialDelivery: false, fromStartOnly: true,
  } },
  // The oak logs, wool and nails repair the foundry; the hammer and chisel are kept, the bars and the sword are the foundry's.
  'Sleeping Giants': { revision: 15241064, flow: {
    consumes: [{ name: 'Oak logs', count: 3 }, { name: 'Wool', count: 1 }, { name: 'Steel nails', count: 10 }], receives: [],
    unknownItems: ['Preform', 'Bucket'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // One H.A.M. set is worn by the player, the other goes to Zanik (counted as used up); the lantern and pickaxe are kept.
  'Death to the Dorgeshuun': { revision: 15396862, flow: {
    consumes: ['Ham hood', 'Ham shirt', 'Ham robe', 'Ham gloves', 'Ham boots', 'Ham cloak', 'Ham logo'].map((name) => ({ name, count: 1 })), receives: [],
    unknownItems: ['Zanik'],
    uncertainReceipts: ['Trout'],
    partialDelivery: false, fromStartOnly: true,
  } },
  // Coins, gold bar and death rune go to the guards, the bones to Toban, a rope to the tree and the potion parts into the ogre potion.
  Watchtower: { revision: 15367228, flow: {
    consumes: [{ name: 'Coins', count: 20 }, { name: 'Gold bar', count: 1 }, { name: 'Death rune', count: 1 }, { name: 'Dragon bones', count: 1 },
      { name: 'Rope', count: 1 }, { name: 'Guam potion (unf)', count: 1 }, { name: 'Jangerberries', count: 1 }, { name: 'Bat bones', count: 1 }],
    receives: [],
    unknownItems: ['Fingernails', 'Ogre tooth', 'Relic part 1', 'Relic part 2', 'Relic part 3', 'Ogre relic', 'Rock cake', 'Skavid map', 'Cave nightshade', 'Magic ogre potion', 'Crystal'],
    uncertainReceipts: ['Rope'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // Sandstone and granite become the statue, the logs, candle and coal go on the braziers, the bread to Pentyn and the runes into
  // three spells; the chisel and tinderbox are kept, the spare granite piece too.
  "Enakhra's Lament": { revision: 15404551, flow: {
    consumes: [{ name: 'Sandstone (10kg)', count: 5 }, { name: 'Sandstone (2kg)', count: 1 }, { name: 'Granite (5kg)', count: 1 }, { name: 'Soft clay', count: 1 },
      { name: 'Bread', count: 1 }, { name: 'Candle', count: 1 }, { name: 'Logs', count: 1 }, { name: 'Oak logs', count: 1 }, { name: 'Willow logs', count: 1 },
      { name: 'Maple logs', count: 1 }, { name: 'Coal', count: 1 }, { name: 'Air rune', count: 7 }, { name: 'Fire rune', count: 4 }, { name: 'Earth rune', count: 2 },
      { name: 'Chaos rune', count: 3 }],
    receives: [],
    unknownItems: ['Camel mould', 'Stone head', 'Base', 'Body', 'Statue', 'M sigil', 'Z sigil', 'K sigil', 'R sigil', 'Sandstone base', 'Sandstone body'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // The coal smelts the two elemental ores; the hammer and pickaxe are kept, the ore, bars, cogs, pipe and books are quest items.
  'Elemental Workshop II': { revision: 15271178, flow: {
    consumes: [{ name: 'Coal', count: 8 }], receives: [],
    unknownItems: ['Battered key', 'Elemental ore', 'Elemental metal', 'Primed bar', 'Primed mind bar', 'Mind bar', 'Claw', 'Cog', 'Pipe', 'Beaten book', 'Slashed book'],
    uncertainReceipts: ['Trout'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // The coins pay the camels, beers, urchin and snake pot; headpiece and beard become the kept desert disguise, the bucket of dung
  // goes to the Hag; the gloves are kept, the blackjack, jewels, charm and basket are quest items.
  'The Feud': { revision: 15376145, flow: {
    consumes: [{ name: 'Coins', count: 517 }, { name: 'Kharidian headpiece', count: 1 }, { name: 'Fake beard', count: 1 }, { name: 'Bucket', count: 1 }],
    receives: [],
    unknownItems: ['Desert disguise', 'Oak blackjack', 'Willow blackjack', 'Jewels', 'Snake charm', 'Snake basket', 'Beer', 'Ugthanki dung', 'Poison'],
    uncertainReceipts: ['Trout'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // The sap and mud rune become magic glue, the logs go into Oaknock's machine; the tools are kept, the discs and glue are quest items.
  'The Eyes of Glouphrie': { revision: 15292355, flow: {
    consumes: [{ name: 'Bucket of sap', count: 1 }, { name: 'Mud rune', count: 1 }, { name: 'Maple logs', count: 1 }, { name: 'Oak logs', count: 1 }],
    receives: [],
    unknownItems: ['Ground mud runes', 'Magic glue', 'Disc'],
    uncertainReceipts: ['Trout'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // The candle and rope are lost at the fissure, the wire becomes the Beads of the Dead and the bones open the tomb doors; the spade,
  // chisel, tinderbox and staff are kept.
  'Shilo Village': { revision: 15402098, flow: {
    consumes: [{ name: 'Candle', count: 1 }, { name: 'Rope', count: 1 }, { name: 'Bronze wire', count: 1 }, { name: 'Bones', count: 3 }],
    receives: [],
    unknownItems: ['Wampum belt', 'Stone-plaque', 'Tattered scroll', 'Crumpled scroll', "Zadimus corpse", 'Bone shard', 'Bone key', 'Sword pommel', 'Bone beads', 'Beads of the dead', "Bervirius notes", 'Locating crystal'],
    uncertainReceipts: ['Chaos rune', 'Air rune', 'Trout'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // Only the boat fare is spent; the gas mask, gowns, pigeon cage, apple, distillator and chemicals are free quest items.
  Biohazard: { revision: 15395681, flow: {
    consumes: [{ name: 'Coins', count: 30 }], receives: [],
    unknownItems: ['Gas mask', 'Medical gown', 'Priest gown', 'Pigeon cage', 'Bird feed', 'Rotten apple', 'Key', 'Distillator', 'Plague sample', 'Touch paper', 'Liquid honey', 'Ethenea', 'Sulphuric broline'],
    uncertainReceipts: ['Trout'],
    partialDelivery: true, fromStartOnly: true,
  } },
  // The chisel is kept; the Zealot's key, glowing fungus and crystal are quest items, the lobsters are eaten against Treus Dayth.
  'Haunted Mine': { revision: 15366272, flow: {
    consumes: [], receives: [],
    unknownItems: ["Zealot's key", 'Glowing fungus', 'Innocent-looking key', 'Crystal'],
    uncertainReceipts: ['Lobster'],
    partialDelivery: false, fromStartOnly: true,
  } },
  // Planks, cloth and nails become furniture; the hammer, saw and waxwood are free quest items.
  "Daddy's Home": { revision: 15401680, flow: {
    consumes: [{ name: 'Plank', count: 10 }, { name: 'Bolt of cloth', count: 5 }, { name: 'Steel nails', count: 100 }], receives: [],
    unknownItems: ['Hammer', 'Saw', 'Waxwood log', 'Waxwood plank'],
    uncertainReceipts: ['Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // The axe lies next to Marcellus and the plushy is a quest item; nothing is bought or kept.
  'The Ribbiting Tale of a Lily Pad Labour Dispute': { revision: 15270097, flow: {
    consumes: [], receives: [], unknownItems: ['Bronze axe', 'Frog plushy'],
    uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The butler's uniform and the evidence are quest items; nothing is bought.
  'Death on the Isle': { revision: 15375163, flow: {
    consumes: [], receives: [], unknownItems: ["Butler's uniform", 'Shipping contract', 'Drinking flask', 'Threatening note', 'Wine labels'],
    uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The box trap is kept; the needle, hammer, jerboa tails and poultice are found during the quest.
  'At First Light': { revision: 15391671, flow: {
    consumes: [], receives: [], unknownItems: ['Needle', 'Hammer', 'Jerboa tail', 'Smooth leaf', 'Poultice', 'Toy mouse'],
    uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The secateurs are kept; the tablets, notes and translations are quest items.
  'The Garden of Death': { revision: 15396819, flow: {
    consumes: [], receives: [], unknownItems: ['Stone tablet', 'Note', 'Journal'],
    uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The chaos runes charge the wand and Surok keeps the bowl; the talisman is kept.
  'What Lies Below': { revision: 15373739, flow: {
    consumes: [{ name: 'Chaos rune', count: 15 }, { name: 'Bowl', count: 1 }], receives: [],
    unknownItems: ["Rat's letter", 'Wand', 'Infused wand', 'Folder', 'Used folder', 'Intel', "Surok's letter", 'Beacon ring'],
    uncertainReceipts: ['Trout'], partialDelivery: false, fromStartOnly: false,
  } },
  // Fire Bolts spend runes on the jaguar and the dragon; the tools and eggs are found in Tal Teklan.
  'Scrambled!': { revision: 15373706, flow: {
    consumes: [], receives: [], unknownItems: ['Planks', 'Nails', 'Saw', 'Hammer', 'Bowl of water', 'Damiana leaves', 'Large egg', 'Jaguar egg', 'Dragon egg'],
    uncertainReceipts: ['Trout', 'Chaos rune', 'Air rune'], partialDelivery: false, fromStartOnly: false,
  } },
  // The coins pay the merchants and the shark enchants the lyre; the lyre drops from Lanzig and the tinderbox is kept.
  'The Fremennik Trials': { revision: 15396092, flow: {
    consumes: [{ name: 'Coins', count: 5252 }, { name: 'Raw shark', count: 1 }], receives: [],
    unknownItems: ['Golden fleece', 'Golden wool', 'Branch', 'Unstrung lyre', 'Lyre', 'Enchanted lyre', 'Strange object', 'Lit strange object', 'Low alcohol keg', 'Hunters talisman', 'Charged hunters talisman', 'Fremennik ballad', 'Exotic flower', 'Warriors contract', 'Weather forecast', 'Sea fishing map', 'Promissory note', 'Legendary cocktail', 'Champions token', 'Unusual fish', 'Custom bow string', 'Tracking map', 'Fiscal statement', 'Fremennik blade', 'Pet rock', 'Lalli stew'],
    uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The logs, damp planks, barrels, ropes and keys are found in the caverns; the axe, tinderbox and spade are kept.
  "Olaf's Quest": { revision: 15396084, flow: {
    consumes: [], receives: [], unknownItems: ['Windswept logs', 'Damp planks', 'Unusual fish', 'Rotten barrel', 'Rope', 'Key'],
    uncertainReceipts: ['Lobster', 'Chaos rune', 'Air rune'], partialDelivery: false, fromStartOnly: false,
  } },
  // The repairs, Aurel's crate and the silvthrill rod use up the materials; the tools and the sickle are kept.
  'In Aid of the Myreque': { revision: 15381138, flow: {
    consumes: [{ name: 'Plank', count: 11 }, { name: 'Steel nails', count: 44 }, { name: 'Swamp paste', count: 1 }, { name: 'Raw mackerel', count: 10 },
      { name: 'Bronze axe', count: 10 }, { name: 'Tinderbox', count: 4 }, { name: 'Steel bar', count: 2 }, { name: 'Coal', count: 1 }, { name: 'Soft clay', count: 1 },
      { name: 'Rope', count: 1 }, { name: 'Silver bar', count: 1 }, { name: 'Mithril bar', count: 1 }, { name: 'Sapphire', count: 1 }, { name: 'Cosmic rune', count: 1 },
      { name: 'Water rune', count: 1 }, { name: 'Salmon', count: 1 }],
    receives: [], unknownItems: ['Rod mould', 'Silvthrill rod', 'Rod of Ivandis', 'Book of the Sleeping Seven', 'Library key', 'Crate'],
    uncertainReceipts: ['Salmon'], partialDelivery: false, fromStartOnly: false,
  } },
  // The slop of compromise uses every ingredient; the knife is kept.
  'Recipe for Disaster/Freeing the Goblin generals': { revision: 15361105, flow: {
    consumes: [{ name: 'Bread', count: 1 }, { name: 'Orange', count: 1 }, { name: 'Blue dye', count: 1 }, { name: 'Spice', count: 1 }, { name: 'Fishing bait', count: 1 }, { name: 'Bucket of water', count: 1 }, { name: 'Charcoal', count: 1 }],
    receives: [], unknownItems: ['Soggy bread', 'Orange slices', 'Blue orange slices', 'Spicy maggots', 'Slop of compromise'],
    uncertainReceipts: ['Bucket'], partialDelivery: false, fromStartOnly: false,
  } },
  // Rohak drinks the ales and bakes the rock cake from the ingredients and 300 coins; the gloves are kept.
  'Recipe for Disaster/Freeing the Mountain Dwarf': { revision: 15389712, flow: {
    consumes: [{ name: 'Bucket of milk', count: 1 }, { name: 'Pot of flour', count: 1 }, { name: 'Egg', count: 1 }, { name: 'Bowl of water', count: 1 }, { name: 'Asgarnian ale', count: 4 }, { name: 'Coins', count: 304 }],
    receives: [], unknownItems: ['Asgoldian ale', 'Dwarven rock cake'],
    uncertainReceipts: ['Asgarnian ale', 'Coins', 'Bucket', 'Pot', 'Bowl', 'Trout'], partialDelivery: false, fromStartOnly: false,
  } },
  // Nung makes the diving helmet from the fishbowl and wire; one cod and one bread become the fishcake.
  'Recipe for Disaster/Freeing Pirate Pete': { revision: 15398344, flow: {
    consumes: [{ name: 'Empty fishbowl', count: 1 }, { name: 'Bronze wire', count: 3 }, { name: 'Raw cod', count: 1 }, { name: 'Bread', count: 1 }],
    receives: [], unknownItems: ['Fishbowl helmet', 'Diving apparatus', 'Mudskipper hide', 'Kelp', 'Ground kelp', 'Crab meat', 'Ground crab meat', 'Ground cod', 'Breadcrumbs', 'Raw fishcake', 'Cooked fishcake', 'Rock'],
    uncertainReceipts: ['Raw cod', 'Bread', 'Trout'], partialDelivery: false, fromStartOnly: false,
  } },
  // The chompy is cooked on Karamja and handed to Rantz's kids; one log burns; the Jubbly goes to Skrach; bow, bellows and tools stay.
  'Recipe for Disaster/Freeing Skrach Uglogwee': { revision: 15381314, flow: {
    consumes: [{ name: 'Raw chompy', count: 1 }, { name: 'Logs', count: 1 }, { name: 'Ball of wool', count: 1 }],
    receives: [], unknownItems: ['Skewered chompy', 'Cooked chompy', 'Bloated toad', 'Balloon toad', 'Rock', 'Raw jubbly', 'Cooked jubbly'],
    uncertainReceipts: ['Ball of wool', 'Ogre arrow'], partialDelivery: false, fromStartOnly: false,
  } },
  // Traiborn takes the 25 bones (in increments), the water goes down the drain and Aris takes a coin; you keep Silverlight (Shadow of the Storm needs it).
  'Demon Slayer': { revision: 15398358, flow: {
    consumes: [{ name: 'Bones', count: 25 }, { name: 'Bucket of water', count: 1 }, { name: 'Coins', count: 1 }],
    receives: [{ name: 'Silverlight', count: 1, when: 'complete' }], unknownItems: ['Silverlight key'],
    uncertainReceipts: ['Trout'], partialDelivery: true, fromStartOnly: false,
  } },
  // The silver bar, bronze wire and thread go into the creature and the coins to the gardener; you keep the Ring of Charos (Garden of Tranquillity needs it).
  'Creature of Fenkenstrain': { revision: 15385731, flow: {
    consumes: [{ name: 'Silver bar', count: 1 }, { name: 'Bronze wire', count: 3 }, { name: 'Thread', count: 5 }, { name: 'Coins', count: 50 }],
    receives: [{ name: 'Ring of Charos', count: 1, when: 'complete' }], unknownItems: ['Marble amulet', 'Obsidian amulet', 'Star amulet', 'Decapitated head', 'Pickled brain', 'Cavern key', 'Tower key', 'Conductor mould', 'Lightning conductor'],
    uncertainReceipts: ['Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // The seeds, compost and cures grow the garden; the rune essence becomes the rune dust for the strong plant cure; tools stay.
  'Garden of Tranquillity': { revision: 15403073, flow: {
    consumes: [{ name: 'Marigold seed', count: 1 }, { name: 'Cabbage seed', count: 3 }, { name: 'Onion seed', count: 3 }, { name: 'Ultracompost', count: 2 }, { name: 'Rune essence', count: 1 }, { name: 'Filled plant pot', count: 1 }],
    receives: [], unknownItems: ['Ring of charos(a)', 'Orchid seed', 'Snowdrop seed', 'Delphinium seed', 'White tree shoot', 'White tree sapling', 'Rose seed', 'Vine seed', 'Rune shards', 'Rune dust', 'Magic plant cure', 'Trolley'],
    uncertainReceipts: ['Plant cure'], partialDelivery: false, fromStartOnly: false,
  } },
  // The water brews the strong tea; the chisel and pickaxe stay.
  'Temple of the Eye': { revision: 15304735, flow: {
    consumes: [{ name: 'Bucket of water', count: 1 }], receives: [],
    unknownItems: ['Strong tea', 'Abyssal incantation', 'Unstrung lyre', 'Eye of the abyss'],
    uncertainReceipts: ['Chisel', 'Bronze pickaxe'], partialDelivery: false, fromStartOnly: false,
  } },
  // Traiborn enchants the milk, egg and flour, which become the guide's cake; the tin may come back.
  'Recipe for Disaster/Freeing the Lumbridge Guide': { revision: 15375111, flow: {
    consumes: [{ name: 'Bucket of milk', count: 1 }, { name: 'Egg', count: 1 }, { name: 'Pot of flour', count: 1 }], receives: [],
    unknownItems: ['Enchanted milk', 'Enchanted egg', 'Enchanted flour', 'Raw guide cake', 'Cake of guidance'],
    uncertainReceipts: ['Cake tin'], partialDelivery: false, fromStartOnly: false,
  } },
  // The unfinished potion and slime make the oil that turns the rod oily; the bait catches the eel; the eel, feather and armband go to Achietties; gloves, key and armour stay.
  "Heroes' Quest": { revision: 15385698, flow: {
    consumes: [{ name: 'Harralander potion (unf)', count: 1 }, { name: 'Fishing rod', count: 1 }, { name: 'Fishing bait', count: 1 }],
    receives: [{ name: 'Ice gloves', count: 1, when: 'complete' }],
    unknownItems: ['Blamish snail slime', 'Blamish oil', 'Oily fishing rod', 'Raw lava eel', 'Lava eel', 'Fire feather', 'Jail key', 'Miscellaneous key', 'Candlestick', "Thieves' armband"],
    uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The coins buy the flowers and the support; the ring is given away; the bar becomes the nib and the logs the pen. Only the chosen royal keeps the bow or eats the cake.
  'Throne of Miscellania': { revision: 15403898, flow: {
    consumes: [{ name: 'Coins', count: 1905 }, { name: 'Gold ring', count: 1 }, { name: 'Iron bar', count: 1 }, { name: 'Logs', count: 1 }],
    receives: [], unknownItems: ['Flowers', 'Mixed flowers', 'Giant nib', 'Giant pen', 'Awful anthem', 'Good anthem', 'Treaty'],
    uncertainReceipts: ['Shortbow', 'Cake'], partialDelivery: false, fromStartOnly: false,
  } },
  // The altars turn the dramen staff into the lunar staff; the herbs go into the potion; the thread sews the clothes. Tools, talismans and the lantern stay.
  'Lunar Diplomacy': { revision: 15400334, flow: {
    consumes: [{ name: 'Dramen staff', count: 1 }, { name: 'Guam leaf', count: 1 }, { name: 'Marrentill', count: 1 }, { name: 'Thread', count: 2 }],
    receives: [],
    unknownItems: ['Lunar staff', 'Emerald lens', 'Emerald lantern', 'Suqah tooth', 'Suqah hide', 'Suqah leather', 'Lunar ore', 'Lunar bar', 'Lunar helm', 'Lunar torso', 'Lunar gloves', 'Lunar boots', 'Lunar legs', 'Lunar amulet', 'Lunar ring', 'Lunar cape', 'Special vial', 'Waking sleep vial', 'Seal of passage'],
    uncertainReceipts: ['Coins'], partialDelivery: false, fromStartOnly: false,
  } },
  // Nothing is used up: the lantern and tinderbox stay, and the keris is the prize from the chasm.
  'Contact!': { revision: 15327950, flow: {
    consumes: [], receives: [{ name: 'Keris', count: 1, when: 'complete' }], unknownItems: ["Kaleef's parchment"], uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // Hild's enchantment takes the death runes; the cake, milk, logs and seeds go into Unferth's chores; tools, clothes, cat and amulet stay.
  'A Tail of Two Cats': { revision: 15394232, flow: {
    consumes: [{ name: 'Death rune', count: 5 }, { name: 'Chocolate cake', count: 1 }, { name: 'Bucket of milk', count: 1 }, { name: 'Logs', count: 1 }, { name: 'Potato seed', count: 4 }],
    receives: [], unknownItems: ['Catspeak amulet (e)', "Doctor's hat", 'Nurse hat'], uncertainReceipts: ['Vial of water'], partialDelivery: false, fromStartOnly: false,
  } },
  // The cat's hell-rat spices season the stew, which Dave eats; the cat stays yours.
  'Recipe for Disaster/Freeing Evil Dave': { revision: 15366289, flow: {
    consumes: [{ name: 'Stew', count: 1 }], receives: [],
    unknownItems: ['Red spice', 'Orange spice', 'Brown spice', 'Yellow spice', 'Spicy stew'], uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The water douses Skippy and he drinks the nettle tea; the dust, milk and snape grass make the hangover cure; gloves stay.
  'Skippy and the Mogres': { revision: 15396629, flow: {
    consumes: [{ name: 'Bucket of water', count: 1 }, { name: 'Nettle tea', count: 1 }, { name: 'Chocolate dust', count: 1 }, { name: 'Bucket of milk', count: 1 }, { name: 'Snape grass', count: 1 }],
    receives: [], unknownItems: ['Nettle-water', 'Chocolatey milk', 'Hangover cure'], uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // Sir Tiffy takes 10,000 coins for the Commorb; the Mage of Zamorak takes the essence; the lantern stays.
  'Wanted!': { revision: 15391809, flow: {
    consumes: [{ name: 'Coins', count: 10000 }, { name: 'Rune essence', count: 20 }],
    receives: [], unknownItems: ['Commorb', "Solus's hat"], uncertainReceipts: ['Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // The test rooms allow no items: everything used is found inside and stays there.
  'Recruitment Drive': { revision: 15395322, flow: {
    consumes: [], receives: [], unknownItems: ['Steel warhammer', 'Grain', 'Chicken', 'Fox', 'Vial', 'Cake tin', 'Gypsum', 'Knife', 'Spade', 'Key', 'Bronze key', 'Initiate sallet'],
    uncertainReceipts: [], partialDelivery: false, fromStartOnly: false,
  } },
  // The six elemental runes go on the pillars; Golrie's pebble is kept for Roving Elves (Wiki tip); the rope may stay.
  'Waterfall Quest': { revision: 15357907, flow: {
    consumes: [{ name: 'Air rune', count: 6 }, { name: 'Earth rune', count: 6 }, { name: 'Water rune', count: 6 }],
    receives: [{ name: "Glarial's pebble", count: 1, when: 'complete' }],
    unknownItems: ['Book on baxtorian', 'Large key', "Glarial's amulet", "Glarial's urn", 'Key (Waterfall Dungeon)'],
    uncertainReceipts: ['Rope', 'Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // The consecration seed is planted by the chalice; the pebble, rope and spade stay.
  'Roving Elves': { revision: 15401434, flow: {
    consumes: [], receives: [], unknownItems: ['Consecration seed', 'Key (Waterfall Dungeon)', 'Crystal bow', 'Crystal shield'],
    uncertainReceipts: ["Glarial's pebble", 'Rope', 'Spade', 'Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // Oronwen sews the fur and silk, the gnome takes the crunchies, logs and leather, the dyes colour four toads,
  // the still burns the coal; the mourner gear stays for Part II and the bellows refill.
  "Mourning's End Part I": { revision: 15366066, flow: {
    consumes: [{ name: 'Bear fur', count: 1 }, { name: 'Silk', count: 2 }, { name: 'Red dye', count: 1 }, { name: 'Yellow dye', count: 1 }, { name: 'Green dye', count: 1 }, { name: 'Blue dye', count: 1 }, { name: 'Bucket of water', count: 1 }, { name: 'Feather', count: 1 }, { name: 'Toad crunchies', count: 1 }, { name: 'Magic logs', count: 1 }, { name: 'Leather', count: 1 }, { name: 'Coal', count: 10 }],
    receives: [], unknownItems: ['Mourner letter', 'Gas mask', 'Mourner top', 'Mourner trousers', 'Mourner gloves', 'Mourner boots', 'Mourner cloak', 'Bloody mourner top', 'Ripped mourner trousers', 'Soap', 'Fixed device', 'Red toad', 'Yellow toad', 'Green toad', 'Blue toad', 'Rotten apple', 'Barrel', 'Apple barrel', 'Barrel of coal tar', 'Barrel of naphtha', 'Naphtha apple mix', 'Toxic naphtha', 'Toxic powder', 'Sieve', 'Teleport crystal'],
    uncertainReceipts: ['Ogre bellows'], partialDelivery: false, fromStartOnly: false,
  } },
  // The coal, quicklime (from the limestone) and sulphur fill the barrel bomb, lit with the cloth strip woven from the wool;
  // a lit arrow and a rope go in the pass again, and the rabbit distracts the guard; tools stay.
  'Regicide': { revision: 15396547, flow: {
    consumes: [{ name: 'Coal', count: 8 }, { name: 'Limestone', count: 1 }, { name: 'Ball of wool', count: 4 }, { name: 'Bronze arrow', count: 1 }, { name: 'Rope', count: 1 }, { name: 'Cooked rabbit', count: 1 }],
    receives: [], unknownItems: ['Strip of cloth', 'Fire arrow', 'Quicklime', 'Ground quicklime', 'Sulphur', 'Ground sulphur', 'Barrel', 'Barrel of naphtha', 'Naphtha mix', 'Barrel bomb', 'Big book of bangs', 'Pot of quicklime'],
    uncertainReceipts: ['Rope', 'Bronze arrow', 'Chaos rune', 'Air rune', 'Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // One lit arrow cuts the guide rope and a rope stays over the pit; everything else is found and used inside the pass.
  'Underground Pass': { revision: 15392817, flow: {
    consumes: [{ name: 'Bronze arrow', count: 1 }, { name: 'Rope', count: 1 }],
    receives: [], unknownItems: ['Fire arrow', 'Plank', 'Orb of light', 'Railing', 'Unicorn horn', "Paladin's badge", "Witch's cat", 'Amulet of Doomion', 'Amulet of Holthion', 'Amulet of Othainian',
      'Bucket of dwarf brew', "Klank's gauntlets", "Iban's dove", "Zamorak robe", 'Doll of Iban', "Iban's shadow", "Iban's conscience", "Iban's ashes"],
    uncertainReceipts: ['Rope', 'Bronze arrow', 'Bucket', 'Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // Dunstan builds the sled from the maple logs, iron bar and rope; the tar and wax are mixed in the cake tin and spread on it.
  'Troll Romance': { revision: 15375194, flow: {
    consumes: [{ name: 'Maple logs', count: 1 }, { name: 'Iron bar', count: 1 }, { name: 'Rope', count: 1 }, { name: 'Swamp tar', count: 1 }, { name: 'Bucket of wax', count: 1 }],
    receives: [], unknownItems: ['Wax', 'Sled', 'Trollweiss'],
    uncertainReceipts: ['Cake tin', 'Chaos rune', 'Air rune', 'Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // The silver bar becomes the demonic sigil; two vials of black dye turn the desert shirt and robe black; Silverlight becomes Darklight, which you keep.
  'Shadow of the Storm': { revision: 15375058, flow: {
    consumes: [{ name: 'Silver bar', count: 1 }, { name: 'Shantay pass', count: 1 }, { name: 'Silverlight', count: 1 }, { name: 'Vial', count: 2 }, { name: 'Desert shirt', count: 1 }, { name: 'Desert robe', count: 1 }],
    receives: [{ name: 'Darklight', count: 1, when: 'complete' }], unknownItems: ['Black mushroom', 'Black dye', 'Black desert shirt', 'Black desert robe', 'Strange implement', 'Demonic sigil mould', 'Demonic sigil', 'Demonic tome'],
    uncertainReceipts: ['Lobster'], partialDelivery: false, fromStartOnly: false,
  } },
  // The rope stays in the hole; Spria's goggles and the Sourhog's foot are quest items.
  'A Porcine of Interest': { revision: 15367468, flow: {
    consumes: [{ name: 'Rope', count: 1 }], receives: [], unknownItems: ['Reinforced goggles', 'Sourhog foot'],
    uncertainReceipts: ['Trout'], partialDelivery: false, fromStartOnly: false,
  } },
  // The rum, sandwich and bones go to Tinsay, the potion and poisoned spear to Tamayu; the net, pestle, knife and tinderbox stay.
  'Tai Bwo Wannai Trio': { revision: 15385720, flow: {
    consumes: [{ name: 'Sliced banana', count: 1 }, { name: 'Karamjan rum', count: 1 }, { name: 'Logs', count: 2 }, { name: 'Jogre bones', count: 1 }, { name: 'Seaweed', count: 1 },
      { name: 'Raw karambwan', count: 1 }, { name: 'Agility potion(4)', count: 1 }, { name: 'Iron spear', count: 1 }],
    receives: [], unknownItems: ['Raw karambwanji', 'Karambwan vessel', 'Karambwanji paste', 'Burnt jogre bones', 'Pasty jogre bones', "Marinated j' bones", 'Poison karambwan', 'Karambwan paste', 'Monkey corpse', 'Monkey skin', 'Seaweed sandwich', 'Crafting manual'],
    uncertainReceipts: ['Air rune', 'Mind rune'], partialDelivery: false, fromStartOnly: false,
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
  'The ability to defeat a level 111 [[Tanglefoot]] with limited weaponry',
  'The ability to defeat a level 195 [[Jungle Demon]]',
  'The ability to defeat 4 monsters from level 19 to 53 without a break.',
  'Ability to kill a level 36 [[Sand Snake]]',
  // Feldip Hills: the route passes the wolves and ogres without fighting them (step threats, combat ledger S9-12).
  'The ability to defend against level 64 [[wolves]] and level 53 [[ogre]]s',
  // The note only says another player may mine the rock; Mining 20 stays required.
  '{{Refn|This requirement can be bypassed if another player mines the rock.|group=t}}',
  'The ability to run past two level 14 thieves, and one level 26.',
  'The ability to defend against level 53 [[Jogre]]s and level 46 [[Harpie Bug Swarm]]s.',
  'The ability to run past level 53 [[Ogre]]s',
  'The ability to withstand and evade attacks from level 86 [[Fire Giant]]s and level 84 [[Moss Guardian]] without any equipment.',
  'The ability to defeat level 44, 63 and 137 enemies (all can be [[safespot]]ted)',
  // The Tourist Trap: the level 47 Mercenary Captain (step foes, combat ledger).
  'The ability to defeat a level 47 enemy',
  // Scorpion Catcher: the demons and spiders of Taverley Dungeon are walked past (step threats).
  'The ability to run past level 172 [[black demon]]s and level 64 [[poison spider]]s',
  // Icthlarin's Little Helper: the Possessed Priest (step foes, combat ledger).
  'The ability to defeat a level 91 monster.',
  // Hazeel Cult: the route sides with Ceril and kills Alomone (step foes, combat ledger).
  "Able to defeat a level 13 cultist (this applies only if you're taking Ceril's side)",
  // Troll Stronghold: Agility 15 is the requirement; the Troll General is in the step foes and combat ledger.
  '(47 is recommended)',
  'The ability to defeat a level 113 [[Troll General]] (can be [[safespot]]ted)',
  // Tears of Guthix: the route buys a finished sapphire lantern, so the boost note does not apply.
  '<ref>Adding the sapphire lens to a [[Bullseye lantern (unf)]] is boostable. Adding it to a [[Bullseye lantern (empty)]] or [[Bullseye lantern]] is not boostable.</ref>',
  // Mountain Daughter: the note sits under Agility 20, which covers it; the Kendal is in the step foes and combat ledger.
  '<ref>Entering the Mountain Camp initially requires 10 Agility.</ref>',
  // Tai Bwo Wannai Trio: the route buys the raw karambwan, so Fishing 65 is not needed.
  '<ref>Level 65 is required if you wish to catch the [[Raw karambwan]] yourself.</ref>',
  'The ability to defeat a level 70 [[The Kendal|monster]] (can be [[safespot|safespotted]])',
  'The ability to defeat a level 112 [[Khazard warlord]]',
  // Watchtower: Gorad is in the step foes and the combat ledger; the blue dragons of the enclave are walked past (ledger runPast).
  'The ability to defeat a level 68 [[Ogre]] and run past level 111 [[Blue dragons]]',
  // Watchtower: the route asks for Agility 25, above the trellis's 18.
  '<ref name="Note">Climbing the trellis to begin the quest requires 18 Agility.</ref>',
  // Enakhra's Lament: the route still reaches Firemaking 45 (the skill line), and the planned account stays on the standard spellbook.
  '- bypassable {{Refn|Although Firemaking is listed as a requirement, it is only used during the quest to identify what item needs to go in what brazier. Investigating the braziers is not required, meaning that it is possible to just guess and check which item goes in what brazier, so the Firemaking level is not actually required.|group=q}}',
  'Must be on the [[standard spellbook]]',
  // The Feud: the Tough Guy and the Bandit champion are in the step foes and the combat ledger.
  'The ability to kill a level 70 [[Bandit champion|bandit]] and a level 75 [[Tough Guy|Menaphite]] (both can be safespotted).',
  // Shilo Village: Nazastarool is safespotted with Magic (step foes, fight mechanics, ledger); the undead ones are walked past with food.
  'Must be able to defend from many [[Undead one]]s (level 61-73) and able to defeat three monsters that are about level 90.',
  // Haunted Mine: Treus Dayth is in the step foes and the combat ledger; Priest in Peril (a prerequisite) opens Morytania and the mine.
  'The ability to defeat a level 95 enemy',
  'Access to [[Abandoned Mine]]',
  // Death to the Dorgeshuun: Sigmund is in the step foes and the combat ledger, fought in melee.
  'The ability to defeat a level 50 enemy with [[Melee]] or [[Magic]]',
  'The ability to defeat a level 172 [[Black demon (The Grand Tree)|Black demon]] (safespottable for Ranged and Magic or melee using a [[halberd]]).',
  'Ability to kill a level 101 [[Tree spirit (Lost City)|Tree spirit]] with limited [[armour]] and [[weapons]].',
  'The ability to defeat a level 27 [[Delrith|demon]] aided by three level 20 [[Dark wizard]]s and two level 7 Dark wizards using the [[Silverlight]] in melee.',
  'The ability to defeat a level 83 [[Elvarg|dragon]]',
  'Must be able to defeat a level 39 enemy.',
  "You do not need to have an Attack level of 20 to free Merlin, you can 'Use' Excalibur on the crystal to free him.",
  'Must be able to defeat a level 120 [[Black Knight Titan]] (can be [[safespot]]ted or [[flinch]]ed)',
  'Able to defeat a level 51 monster and run past level 72 monsters',
  'Must be able to defeat 5 level-40 [[Loar Shade]]s.',
  // The onslaught is the temple's shade attacks, fought with the same kit and food; Mort'ton opens with Priest in Peril.
  'Must be able to survive an onslaught when rebuilding the Temple (Being surrounded by many players makes this much easier).',
  "Access to [[Mort'ton]]",
  'The ability to defeat a level 97 foe ([[safespot]]table)',
  'A trustworthy friend or partner. Players can join the official [[chat-channel]] "OSRS SOA" to look for a partner.',
  "to enter the Champions' Guild",
  'Ability to defeat a level-69 [[Draugen]]',
  'The ability to defeat a level 100 monster',
  'The ability to defeat a level 100 demon',
  'The ability to defeat a level 113 [[Arrg|troll]]',
  'The ability to defeat a level 110 [[Tyras guard]] (can be [[safespotted]])',
  "The ability to defeat a level 84 enemy unarmed, with [[Glarial's Tomb#Restricted items|heavy restrictions]]",
  ', unless travelling with a [[charter ship]] to the elven woods',
  'The ability to defeat a level 11 enemy with your combat stats set to 20 each.',
  'The ability to defeat a level 32 [[Black Knight (Wanted!)|Black Knight]].',
  'The ability to defeat 5 level 30 monsters.',
  "The ability to defeat a level 13 [[icefiend]] if you don't have the [[ice gloves]].",
  'Ability to defeat a [[Koschei|fairly strong warrior]] without [[armour]], [[weapons]], or [[spells]]',
  'The ability to kill multiple level 111 monsters.',
  'A partner',
  'Access to each of the elemental [[runic altars]] ([[Air Altar|Air]], [[Fire Altar|Fire]], [[Water Altar|Water]], [[Earth Altar|Earth]])',
].map(clause => clause.toLowerCase()));
