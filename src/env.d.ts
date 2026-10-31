/** The version from package.json, substituted at build time (vite.config.ts). */
declare const __APP_VERSION__: string;

/** The item requirements of each quest step, projected from questMachines.json at build time (vite.config.ts). */
declare module 'virtual:quest-item-reqs' { const reqs: Record<string, { ids?: number[]; nm?: string }[]>; export default reqs; }
