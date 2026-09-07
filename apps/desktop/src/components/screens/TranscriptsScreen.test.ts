import { describe, expect, it } from 'vitest';
import { paginateItems } from './TranscriptsScreen';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('./TranscriptsScreen.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./TranscriptsScreen.css', import.meta.url), 'utf8');

describe('transcript timeline states', () => {
  it('does not hide received history behind a refresh skeleton', () => {
    expect(screen).toContain("loadState === 'loading' && history.length === 0 ? (loadingTimedOut ? 'error' : 'loading')");
    expect(screen).toContain('Refreshing history');
  });
  it('fails closed instead of hanging on an unresponsive history service', () => {
    expect(screen).toContain('setLoadingTimedOut(true), 8_000');
    expect(screen).toContain('The local history service did not respond.');
  });
  it('does not present synthetic processing status or latency', () => {
    expect(screen).not.toContain('>Processed</span>');
    expect(screen).not.toContain('{selected.latencyMs}ms');
    expect(screen).not.toContain('{item.latencyMs}ms');
  });

  it('renders explicit loading, empty, error, and no-match affordances', () => {
    expect(screen).toContain('Loading local history');
    expect(screen).toContain('No transcripts yet');
    expect(screen).toContain('History unavailable');
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
  });
});
