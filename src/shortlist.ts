import type { Bullet, Scored, Shortlist, SelectInput } from './types.js';
import { getSelector, type EngineName } from './selector.js';

/**
 * Turning scores into a shortlist.
 *
 * Cut by RANK, not by an absolute threshold. Measured against the fixture
 * persona, Jev's margin between the lowest relevant bullet and the highest
 * irrelevant one was 0.01-0.05 across three runs, and TypeSafe documents that
 * probabilities drift between calls. A cutoff like `score > 0.6` would
 * therefore drop good bullets silently and differently on each run.
 * See docs/jev-api.md, "Cut by rank, not by threshold".
 */

export const DEFAULT_TOP = 15;

/** How close to the cut line counts as "you should look at this yourself". */
export const BORDERLINE_BAND = 0.08;

export interface ShortlistResult extends Shortlist {
  /** Ranked, truncated to `top`. */
  readonly kept: Scored[];
  /** Bullets just either side of the cut — worth a human glance. */
  readonly borderline: Scored[];
}

export function rank(scored: Scored[]): Scored[] {
  return [...scored].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function cut(scored: Scored[], top = DEFAULT_TOP): ShortlistResult['kept'] {
  return rank(scored).slice(0, top);
}

/**
 * Bullets within BORDERLINE_BAND of the cut line, on either side. These are
 * the ones where the engine is effectively undecided, so they are surfaced
 * rather than silently kept or dropped.
 */
export function borderline(scored: Scored[], top = DEFAULT_TOP): Scored[] {
  const ranked = rank(scored);
  if (ranked.length <= top) return [];
  const cutScore = ranked[top - 1]?.score;
  if (cutScore === undefined) return [];
  return ranked.filter((s) => Math.abs(s.score - cutScore) <= BORDERLINE_BAND);
}

export interface BuildShortlistOptions {
  readonly engine: EngineName;
  readonly bullets: Bullet[];
  readonly jd: string;
  readonly top?: number;
  readonly variant?: string;
  readonly now?: Date;
}

export async function buildShortlist(options: BuildShortlistOptions): Promise<ShortlistResult> {
  const selector = await getSelector(options.engine);
  const input: SelectInput = { bullets: options.bullets, jd: options.jd };
  const scored = await selector.select(input);
  const top = options.top ?? DEFAULT_TOP;
  return {
    engine: selector.name,
    generatedAt: (options.now ?? new Date()).toISOString(),
    ...(options.variant ? { variant: options.variant } : {}),
    scored: rank(scored),
    kept: cut(scored, top),
    borderline: borderline(scored, top),
  };
}
