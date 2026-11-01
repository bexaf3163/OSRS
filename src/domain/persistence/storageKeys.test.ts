import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from './storageKeys';

describe('storage keys', () => {
  it('gives every feature its own key', () => {
    const values = Object.values(STORAGE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });
});
