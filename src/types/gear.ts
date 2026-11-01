// Items, gear and opponents from the OSRS Wiki.

/** An item dossier for the built-in wiki inspector. */
export interface WikiItemDetail {
  id: number;
  nameEn: string;
  examine: string;
  members: boolean;
  iconUrl: string;
  value: number;
  highAlch?: number;
  lowAlch?: number;
  gePrice?: { buyPrice: number; sellPrice: number; updatedAt: string };
  /** The price could not be found (no connection, timeout). Only at run time, never in the data. */
  priceUnavailable?: boolean;
  buyLocations?: { shopName: string; location: string; owner?: string; price: number; stock: number | string; members?: boolean }[];
  freeSpawns?: string[];
  dropSources?: { monster: string; combatLevel: number | null; rate: string }[];
  wikiUrl: string;
}

/** The equipment slots the advisor handles: weapon, helm, body, legs, shield, amulet. */
export type GearSlot = 'weapon' | 'head' | 'body' | 'legs' | 'shield' | 'neck';

export interface GearStats { stab: number; slash: number; crush: number; magic: number; ranged: number }

/** An equipment item from the OSRS Wiki (gear.json): bonuses, requirement, shops. */
/** Requirements to wear it. Level 1 is not written: that is not a requirement. */
export interface GearRequirements {
  attack?: number;
  strength?: number;
  defence?: number;
  ranged?: number;
  magic?: number;
  prayer?: number;
  /** Quests without which the item cannot be worn: the Rune platebody needs Dragon Slayer I. */
  quests?: string[];
}

export interface GearPiece {
  id: number;
  name: string;
  slot: GearSlot;
  /** Kind: scimitar, sword, platebody, amulet... */
  kind: string;
  metal?: 'bronze' | 'iron' | 'steel' | 'black' | 'mithril' | 'adamant' | 'rune';
  twoHanded?: boolean;
  /** What you need to wear it: { attack: 5 }, for hammers { strength: 5 }, for the Coif { ranged: 20 }, quests. Absent means no requirements (if reqFrom is set). */
  req?: GearRequirements;
  /** The wiki article that states the requirements (or their absence). */
  reqFrom?: string;
  /** The wiki says nothing about requirements: we do not recommend such an item, we only learn about it from the character. */
  reqUnverified?: boolean;
  members: boolean;
  tradeable: boolean;
  attack: GearStats;
  defence: GearStats;
  strength: number;
  prayer?: number;
  /** Ticks between hits (for a weapon; a tick is 0.6 s). */
  speed?: number;
  /** Free-version shops: the price at full stock. */
  shops?: { shop: string; location: string; price: number; owner?: string }[];
  iconUrl: string;
}

export interface GearData {
  source: string;
  updated: string;
  items: GearPiece[];
}

/** An opponent from the wiki monster card: weapons are compared against it. The version is the lowest-level one in the article. */
export interface Foe {
  name: string;
  version?: string;
  combat: number;
  hitpoints: number;
  defenceLevel: number;
  defence: { stab: number; slash: number; crush: number };
  members: boolean;
}

export interface FoeData {
  source: string;
  updated: string;
  foes: Foe[];
}
