import { describe, expect, it } from 'vitest';
import { vocabularyIdForTerm } from './DictionarySnippetsScreen';

describe('vocabulary persistence identity', () => {
  it('uses a stable term identity instead of a timestamp or random value', () => {
    expect(vocabularyIdForTerm(' Whisper.cpp ')).toBe('vocab-whisper.cpp');
    expect(vocabularyIdForTerm(' Whisper.cpp ')).toBe(vocabularyIdForTerm('whisper.cpp'));
    expect(vocabularyIdForTerm(' Whisper.cpp ')).not.toMatch(/Date|random|\d{5,}/i);
  });
});
