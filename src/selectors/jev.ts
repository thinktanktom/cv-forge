/**
 * JevSelector — `typesafe/jev-1.13` via OpenRouter's (beta) Decisions
 * endpoint.
 *
 * Request/response shape follows `docs/jev-api.md` exactly, which was
 * derived empirically because OpenRouter's own reference 404s. That doc is
 * the source of truth here, not memory of OpenRouter's stable API surface.
 *
 * One `noul` question per bullet, batched into a single request — measured
 * to work for 50 bullets in one round trip (see docs/jev-api.md, "Measured
 * behaviour"). `questions` is a *record* keyed by bullet id, not an array.
 *
 * The request body is built only from `SelectInput` (bullets + jd). That is
 * not an implementation detail: `SelectInput` has no identity field by
 * design (see the note at the top of `types.ts`), and this is the one
 * selector that actually sends its input over the network, so it must not
 * be handed, or reach for, anything wider than `SelectInput`.
 */

import type { Scored, SelectInput, Selector } from '../types.js';

const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const JEV_MODEL = 'typesafe/jev-1.13';

interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
}

interface JevRequestBody {
  model: string;
  state: string;
  questions: Record<string, JevNoulQuestion>;
  provider: {
    data_collection: 'deny';
    order: string[];
    allow_fallbacks: false;
  };
}

interface JevNoulAnswer {
  type: 'noul';
  noul: number;
}

interface JevResponseBody {
  model?: string;
  answers?: Record<string, JevNoulAnswer | undefined>;
}

interface JevErrorBody {
  error?: { message?: string };
}

function bulletInstructions(text: string, tags: string[]): string {
  const lines = [
    'The job description for this application is given as `state`.',
    'Judge whether this CV bullet is strong, relevant evidence for that role.',
    `Bullet: ${text}`,
  ];
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(', ')}`);
  }
  return lines.join('\n');
}

function buildRequestBody(input: SelectInput): JevRequestBody {
  const questions: Record<string, JevNoulQuestion> = {};
  for (const bullet of input.bullets) {
    questions[bullet.id] = {
      type: 'noul',
      instructions: bulletInstructions(bullet.text, bullet.tags),
    };
  }

  return {
    model: JEV_MODEL,
    state: input.jd,
    questions,
    provider: {
      data_collection: 'deny',
      order: ['typesafe'],
      allow_fallbacks: false,
    },
  };
}

function extractErrorMessage(rawBody: string): string | undefined {
  try {
    const parsed = JSON.parse(rawBody) as JevErrorBody;
    return parsed.error?.message;
  } catch {
    return undefined;
  }
}

export class JevSelector implements Selector {
  readonly name = 'jev' as const;

  async select(input: SelectInput): Promise<Scored[]> {
    if (input.bullets.length === 0) {
      return [];
    }

    // Read the key at call time (not module load time) and never let it
    // leave this scope: not logged, not written to a file, not interpolated
    // into any error message below.
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey === undefined || apiKey.trim() === '') {
      throw new Error(
        'JevSelector requires OPENROUTER_API_KEY to be set in the environment (see ~/.config/cv-forge/env).',
      );
    }

    const body = buildRequestBody(input);

    const response = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const rawBody = await response.text();

    if (!response.ok) {
      const message = extractErrorMessage(rawBody);
      throw new Error(
        `Jev request failed with HTTP ${response.status}${message !== undefined ? `: ${message}` : ''}`,
      );
    }

    let parsed: JevResponseBody;
    try {
      parsed = JSON.parse(rawBody) as JevResponseBody;
    } catch {
      throw new Error('Jev returned a 200 response that was not valid JSON.');
    }

    return input.bullets.map((bullet): Scored => {
      const answer = parsed.answers?.[bullet.id];
      if (answer === undefined || answer.type !== 'noul' || typeof answer.noul !== 'number') {
        throw new Error(`Jev response has no "noul" answer for bullet "${bullet.id}".`);
      }
      return { id: bullet.id, score: answer.noul };
    });
  }
}
