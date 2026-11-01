// Money-making methods.

/** The level needed (required) or advised for an earning method; combat is the combat level, plus means "and above". */
export interface MoneyReq {
  skill: string;
  level: number;
  required: boolean;
  plus?: boolean;
}

/** An earning method from the wiki's "Money making guide/Free-to-play" (scripts/data/build-money.ts). */
export interface MoneyMethod {
  id: string;
  title: string;
  url: string;
  /** Income per hour at the Grand Exchange prices on the snapshot date. */
  profit: number;
  intensity: string;
  category: string;
  skills: MoneyReq[];
  quests?: string;
  items?: string;
  other?: string;
  /** The wiki's words about combat preparation ("Decent and recommended..."), which numbers cannot express. */
  skillsNote?: string;
  /** The starting capital the wiki names explicitly (gp). */
  capital?: number;
  /** What you buy or carry besides coins. */
  inputs?: string[];
}

export interface MoneyData {
  generatedAt: string;
  source: string;
  methods: MoneyMethod[];
}
