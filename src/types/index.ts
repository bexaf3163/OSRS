// The app's data types. The V2 route is src/data/authored/steps.json and stages.json;
// the skills, goals and reference live in the other JSON files of src/data.
// The types sit in one file per topic; this file only re-exports them, type-only, so nothing here exists at run time.
export type * from './route';
export type * from './inGame';
export type * from './stages';
export type * from './gear';
export type * from './guide';
export type * from './progress';
export type * from './money';
