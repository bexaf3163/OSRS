// Inline-разметка гайда: **жирный**, `код`, [ссылка](url).

export function stripMd(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** Нормализация для поиска: регистр и «ё». */
export function fold(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}
