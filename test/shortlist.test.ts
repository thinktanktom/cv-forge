import { describe, it, expect } from 'vitest';
import { rank, cut, borderline } from '../src/shortlist.js';
import type { Scored } from '../src/types.js';

const s = (id: string, score: number): Scored => ({ id, score });

describe('rank', () => {
  it('orders by score descending', () => {
    expect(rank([s('a', 0.1), s('b', 0.9), s('c', 0.5)]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by id so the same input always gives the same order', () => {
    const once = rank([s('z', 0.5), s('a', 0.5), s('m', 0.5)]).map((x) => x.id);
    const twice = rank([s('m', 0.5), s('z', 0.5), s('a', 0.5)]).map((x) => x.id);
    expect(once).toEqual(['a', 'm', 'z']);
    expect(once).toEqual(twice);
  });

  it('does not mutate its input', () => {
    const input = [s('a', 0.1), s('b', 0.9)];
    rank(input);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('cut', () => {
  it('keeps the top N by rank', () => {
    const scored = [s('a', 0.9), s('b', 0.8), s('c', 0.7), s('d', 0.6)];
    expect(cut(scored, 2).map((x) => x.id)).toEqual(['a', 'b']);
  });

});

describe('borderline', () => {
  /*
   * The point of this: Jev's measured margin between the lowest relevant
   * bullet and the highest irrelevant one was 0.01-0.05, so the engine is
   * effectively undecided near the cut. Those get surfaced, not silently
   * kept or dropped. See docs/jev-api.md.
   */
  it('reports bullets on both sides of the cut line', () => {
    const scored = [s('a', 0.90), s('b', 0.62), s('c', 0.60), s('d', 0.58), s('e', 0.20)];
    const ids = borderline(scored, 3).map((x) => x.id);
    expect(ids).toContain('c'); // last kept
    expect(ids).toContain('d'); // first cut
    expect(ids).not.toContain('a'); // clearly in
    expect(ids).not.toContain('e'); // clearly out
  });

  it('is empty when nothing was cut', () => {
    expect(borderline([s('a', 0.9), s('b', 0.1)], 5)).toEqual([]);
  });

});
