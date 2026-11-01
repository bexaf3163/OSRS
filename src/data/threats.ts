// Typed access to threats.json: monsters with their hits, and the food table.
import threatsJson from './generated/threats.json';

export interface Hit { n: number; label: string }
export interface Threat { page: string; version?: string; hits: Hit[]; speedTicks: number; hitpoints: number; combat: number }
export interface Food { name: string; heals: number; members: boolean }
export const THREATS = threatsJson.threats as unknown as Record<string, Threat>;
export const FOODS = threatsJson.foods as Food[];
