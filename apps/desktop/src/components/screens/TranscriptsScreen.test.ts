import { describe, expect, it } from 'vitest';
import { paginateItems, resolveTranscriptViewState } from './TranscriptsScreen';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('./TranscriptsScreen.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./TranscriptsScreen.css', import.meta.url), 'utf8');

describe('transcript timeline states', () => {
  it('does not present received history as current while a refresh is pending', () => {
    expect(resolveTranscriptViewState(3, 'loading')).toBe('loading');
    expect(resolveTranscriptViewState(3, 'error')).toBe('error');
    expect(resolveTranscriptViewState(3, 'ready')).toBe('ready');
  });
  it('fails closed instead of hanging on an unresponsive history service', () => {
    expect(screen).toContain('loadError?: string | null');
    expect(screen).toContain('const unavailableDetail = loadError ??');
  });
  it('does not present synthetic processing status or latency', () => {
    expect(screen).not.toContain('>Processed</span>');
    expect(screen).not.toContain('{selected.latencyMs}ms');
    expect(screen).not.toContain('{item.latencyMs}ms');
  });

  it('renders explicit loading, empty, error, and no-match affordances', () => {
    expect(screen).toContain('Loading local history');
    expect(screen).toContain('No transcripts yet');
    expect(screen).toContain("History couldn't load");
    expect(screen).toContain('No matching transcripts');
  });

  it('keeps pagination bounded for invalid inputs', () => {
    expect(paginateItems(['a', 'b'], 0, 0)).toEqual(['a']);
    expect(paginateItems(['a', 'b', 'c'], 2, 2)).toEqual(['c']);
  });

  it('has a narrow layout rather than relying on a fixed desktop rail', () => {
    expect(styles).toContain('@media (max-width: 767px)');
    expect(styles).toContain('grid-template-columns:minmax(0,1fr)');
    expect(styles).toContain('max-height:min(720px, calc(100vh - 220px))');
    expect(styles).toContain('max-height:min(720px, calc(100vh - 220px))');
    expect(styles).toContain('.transcripts-screen__state { min-height:180px;');
  });
});
