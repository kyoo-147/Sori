import { describe, expect, it } from 'vitest';
import { snippetIdForTrigger, vocabularyIdForTerm } from './DictionarySnippetsScreen';

describe('vocabulary persistence identity', () => {
  it('uses a stable term identity instead of a timestamp or random value', () => {
    expect(vocabularyIdForTerm(' Whisper.cpp ')).toBe('vocab-whisper.cpp');
    expect(vocabularyIdForTerm(' Whisper.cpp ')).toBe(vocabularyIdForTerm('whisper.cpp'));
    expect(vocabularyIdForTerm(' Whisper.cpp ')).not.toMatch(/Date|random|\d{5,}/i);
  });
});

describe('snippet persistence identity', () => {
  it('normalizes trigger identity across whitespace and case', () => {
    expect(snippetIdForTrigger('  Deploy Preview  ')).toBe('snippet-deploy%20preview');
    expect(snippetIdForTrigger('Deploy Preview')).toBe(snippetIdForTrigger(' deploy preview '));
  });
});
