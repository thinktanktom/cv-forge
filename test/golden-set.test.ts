/**
 * Shared golden-set test, run against every engine that can run
 * automatically (`tag` for real; `jev` with `fetch` mocked). `claude` is
 * exercised separately in claude.test.ts, since it is an explicit
 * human-in-the-loop handoff and cannot complete inside a CI run.
 *
 * The assertion: against a staff Solidity/audit JD, the Solidity/audit
 * bullets must outrank the React/frontend bullets. Same fixture, same JD,
 * same assertion for both engines — this is what makes `--engine` a config
 * change rather than a leap of faith (see src/selector.ts).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allBullets, loadProfile } from '../src/profile.js';
import { JevSelector } from '../src/selectors/jev.js';
import { TagSelector } from '../src/selectors/tag.js';
import type { Scored, Selector } from '../src/types.js';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/persona', import.meta.url));
const JD_PATH = fileURLToPath(new URL('../fixtures/persona/jd-smart-contract.md', import.meta.url));

const profile = loadProfile(FIXTURES_DIR);
const bullets = allBullets(profile);
const jd = readFileSync(JD_PATH, 'utf8');

const HIGH_IDS = ['northwind.staking', 'northwind.audit-remediation', 'northwind.multichain'];
const LOW_IDS = ['harbour.dashboard', 'harbour.api'];

function assertGoldenSet(scored: Scored[]): void {
  const byId = new Map(scored.map((s) => [s.id, s.score]));

  const highScores = HIGH_IDS.map((id) => {
    const score = byId.get(id);
    expect(score, `expected a score for "${id}"`).toBeDefined();
    return score as number;
  });
  const lowScores = LOW_IDS.map((id) => {
    const score = byId.get(id);
    expect(score, `expected a score for "${id}"`).toBeDefined();
    return score as number;
  });

  expect(Math.min(...highScores)).toBeGreaterThan(Math.max(...lowScores));
}

// A realistic Jev response body, shaped exactly like docs/jev-api.md's
// example and in the same score bands its "Measured behaviour" section
// reports for a Solidity/audit JD (0.92-0.97 solidity/audit, 0.24-0.42
// react).
const MOCK_JEV_SCORES: Record<string, number> = {
  'northwind.staking': 0.96,
  'northwind.audit-remediation': 0.94,
  'northwind.multichain': 0.91,
  'northwind.oracle': 0.88,
  'harbour.dashboard': 0.28,
  'harbour.api': 0.33,
  'harbour.ci': 0.4,
  'openfoo.merged': 0.55,
};

function mockJevResponseBody(): unknown {
  const answers: Record<string, { type: 'noul'; noul: number }> = {};
  for (const bullet of bullets) {
    const score = MOCK_JEV_SCORES[bullet.id];
    expect(score, `test fixture drifted: no mock score for "${bullet.id}"`).toBeDefined();
    answers[bullet.id] = { type: 'noul', noul: score as number };
  }
  return {
    model: 'typesafe/jev-1.13-20260917',
    answers,
    usage: { input_tokens: 2311, output_tokens: 21, cost: 0.000097 },
    id: 'gen-dec-test',
    provider: 'TypeSafe',
  };
}

describe('golden set: solidity/audit bullets outrank react/frontend bullets', () => {
  it('tag (real, no mocking)', async () => {
    const selector: Selector = new TagSelector();
    const scored = await selector.select({ bullets, jd });
    assertGoldenSet(scored);
  });

  describe('jev (fetch mocked)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it('jev', async () => {
      vi.stubEnv('OPENROUTER_API_KEY', 'test-key-not-real');
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(mockJevResponseBody()), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const selector: Selector = new JevSelector();
      const scored = await selector.select({ bullets, jd });
      assertGoldenSet(scored);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://openrouter.ai/api/alpha/decisions');
    });
  });
});
