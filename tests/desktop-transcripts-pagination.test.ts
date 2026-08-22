import { describe, expect, it } from 'vitest';
import { paginateItems, TRANSCRIPTS_PAGE_SIZE } from '../apps/desktop/src/components/screens/TranscriptsScreen.js';

describe('transcript pagination', () => {
  it('returns only the requested page and clamps invalid inputs', () => {
    const items = Array.from({ length: 25 }, (_, index) => index + 1);
    expect(paginateItems(items, 1)).toEqual(items.slice(0, TRANSCRIPTS_PAGE_SIZE));
    expect(paginateItems(items, 2)).toEqual(items.slice(TRANSCRIPTS_PAGE_SIZE, 20));
    expect(paginateItems(items, 3)).toEqual(items.slice(20));
    expect(paginateItems(items, 0, 5)).toEqual(items.slice(0, 5));
    expect(paginateItems(items, 2, 0)).toEqual(items.slice(1, 2));
  });
});
