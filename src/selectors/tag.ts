/**
 * TagSelector — the floor engine.
 *
 * No network, no credentials, no external dependency of any kind. It must
 * always work, because it is what keeps a Jev outage, reprice or behaviour
 * change from blocking a build (see AGENTS.md, non-negotiable #4).
 *
 * Scoring is deliberately simple and explainable rather than clever:
 *
 *   score = 0.6 * (curated tag hits / bullet's tag count)
 *         + 0.4 * (bullet text words that also appear in the JD / bullet's
 *                   unique word count)
 *
 * Tag matching is substring-based against the lowercased JD text (not exact
 * token equality) so that a tag like "deploys" still counts against JD text
 * like "deployment" — cheap, good-enough stemming without a stemmer.
 *
 * Both components are ratios in [0, 1] and the weights sum to 1, so the
 * result is naturally bounded to [0, 1] without any further cross-bullet
 * normalisation step.
 */

import type { Bullet, Scored, SelectInput, Selector } from '../types.js';

const TAG_WEIGHT = 0.6;
const TEXT_WEIGHT = 0.4;
const MIN_TOKEN_LENGTH = 3;

// A short list of common words that would otherwise show up as "overlap" in
// almost any bullet/JD pair and dilute the signal.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'are', 'that', 'this', 'from',
  'will', 'own', 'end', 'was', 'were', 'has', 'have', 'had', 'not', 'but',
  'all', 'can', 'our', 'their', 'they', 'them', 'into', 'onto', 'via', 'per',
  'who', 'what', 'when', 'where', 'how', 'each', 'across', 'over', 'under',
  'about', 'role', 'work', 'working', 'looking', 'experience', 'requirements',
  'requirement', 'you’ll', 'youll',
]);

function normalize(text: string): string {
  return text.toLowerCase();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

function scoreBullet(bullet: Bullet, jdLower: string, jdTokens: Set<string>): number {
  const tagHits = bullet.tags.filter((tag) => jdLower.includes(normalize(tag))).length;
  const tagRatio = bullet.tags.length > 0 ? tagHits / bullet.tags.length : 0;

  const bulletTokens = new Set(tokenize(bullet.text));
  let overlap = 0;
  for (const token of bulletTokens) {
    if (jdTokens.has(token)) overlap += 1;
  }
  const textRatio = bulletTokens.size > 0 ? overlap / bulletTokens.size : 0;

  return TAG_WEIGHT * tagRatio + TEXT_WEIGHT * textRatio;
}

export class TagSelector implements Selector {
  readonly name = 'tag' as const;

  async select(input: SelectInput): Promise<Scored[]> {
    const jdLower = normalize(input.jd);
    const jdTokens = new Set(tokenize(input.jd));

    return input.bullets.map((bullet) => ({
      id: bullet.id,
      score: scoreBullet(bullet, jdLower, jdTokens),
    }));
  }
}
