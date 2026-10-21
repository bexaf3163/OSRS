export const EXPORT_APP: 'osrs-put';
export const PROGRESS_VERSION: 3;
export function inspectProgress(data: unknown): 'valid' | 'invalid' | 'unsupported';
export function validProfileText(raw: string | null): boolean;
export function validSavedText(name: string, raw: string): boolean;
