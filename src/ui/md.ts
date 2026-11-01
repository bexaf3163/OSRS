// Inline guide markup: **bold**, `code`, [link](url).

export function stripMd(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Normalisation for search: case. */
export function fold(text: string): string {
  return text.toLowerCase();
}
