import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `tsconfig.lib` includes "DOM" so the `page.evaluate` closures in render.ts
 * type-check — that assertion is what stands between a missing font and a
 * silently two-page CV, so it should not be unchecked strings.
 *
 * The cost is that DOM globals are now visible to every file in src/. This
 * keeps the invariant that used to be enforced by their absence: only
 * render.ts runs code inside a browser page, so only render.ts may name them.
 * Everything else is Node, where `document` is a runtime crash, not a typo
 * the compiler will catch.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const ALLOWED = new Set(['render.ts']);

/** Unambiguously browser-only: none of these exist in Node. */
const DOM_GLOBALS = [
  'document', 'window', 'navigator', 'localStorage', 'sessionStorage',
  'getComputedStyle', 'HTMLElement', 'alert',
];

function tsFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) return tsFiles(full, rel);
    return entry.endsWith('.ts') ? [rel] : [];
  });
}

/** Comments and string literals mention these legitimately; code may not. */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

describe('only render.ts may touch the DOM', () => {
  const files = tsFiles(SRC);

  it('finds the source tree (guards against an empty scan)', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain('render.ts');
  });

  it('no other module names a browser-only global', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (ALLOWED.has(file)) continue;
      const code = stripCommentsAndStrings(readFileSync(join(SRC, file), 'utf8'));
      for (const name of DOM_GLOBALS) {
        if (new RegExp(`\\b${name}\\b`).test(code)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
