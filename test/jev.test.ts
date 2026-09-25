/**
 * JevSelector is the one engine that puts SelectInput on the wire, so this
 * pins down, at runtime, that the request body it builds carries only what
 * SelectInput itself carries (bullets + jd) — never identity, and never a
 * field beyond what docs/jev-api.md documents.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevSelector } from '../src/selectors/jev.js';
import type { Bullet, SelectInput } from '../src/types.js';

const IDENTITY_STRINGS = ['Alex Rivera', 'alex@example.invalid', '+00 000 000 0000', 'Lisbon, Portugal'];

const bullets: Bullet[] = [
  { id: 'a.one', text: 'Did a solidity thing.', tags: ['solidity'] },
  { id: 'a.two', text: 'Did a react thing.', tags: ['react'] },
];

const input: SelectInput = { bullets, jd: 'Looking for a Solidity engineer.' };

describe('JevSelector request body', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('is built only from SelectInput: no identity fields, no extra top-level keys', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key-not-real');

    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          answers: {
            'a.one': { type: 'noul', noul: 0.9 },
            'a.two': { type: 'noul', noul: 0.2 },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const selector = new JevSelector();
    await selector.select(input);

    expect(capturedInit).toBeDefined();
    const rawBody = capturedInit?.body;
    expect(typeof rawBody).toBe('string');
    const body = JSON.parse(rawBody as string) as Record<string, unknown>;

    // Exactly the fields docs/jev-api.md documents — nothing wider.
    expect(Object.keys(body).sort()).toEqual(['model', 'provider', 'questions', 'state'].sort());

    // `state` and `questions` must trace back to jd/bullets only.
    expect(body.state).toBe(input.jd);
    expect(Object.keys(body.questions as object).sort()).toEqual(bullets.map((b) => b.id).sort());

    // No identity string anywhere in the serialized request.
    for (const needle of IDENTITY_STRINGS) {
      expect(rawBody).not.toContain(needle);
    }

    // The provider block matches docs/jev-api.md exactly.
    expect(body.provider).toEqual({
      data_collection: 'deny',
      order: ['typesafe'],
      allow_fallbacks: false,
    });
  });

  it('never includes the API key in a thrown error message', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'super-secret-key-value');
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const selector = new JevSelector();
    await expect(selector.select(input)).rejects.toThrow(/bad request/);
    await expect(selector.select(input)).rejects.not.toThrow(/super-secret-key-value/);
  });

  it('throws a clear error when OPENROUTER_API_KEY is unset', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const selector = new JevSelector();
    await expect(selector.select(input)).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});
