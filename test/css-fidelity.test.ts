import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderSheetHtml } from '../src/render.js';
import { minimalProfile } from './fixtures.js';

/**
 * Regression guard for AGENTS.md rule 3: the print CSS is tuned to fit A4 in
 * one page, so the template must reproduce the source designs exactly.
 *
 * Opt-in, because the source designs are personal files that do not live in
 * this repo:
 *
 *     CV_SOURCE_DESIGNS=~/Documents npm test
 *
 * Without the variable the suite skips rather than fails, so a fresh clone is
 * still green. When it does run it is byte-exact: any "improvement" to the CSS
 * that is not also made in the source design fails here.
 */

const sourceDir = process.env['CV_SOURCE_DESIGNS'];

const profile = minimalProfile();

/** Anchored at line start: the file's header comment mentions "<style>" too. */
function styleBlock(html: string): string {
  const m = html.match(/^<style>[\s\S]*?^<\/style>/m);
  if (!m) throw new Error('no <style> block found');
  return m[0].trim();
}

const cases = [
  ['smart-contract', 'resume-smart-contract.html'],
  ['full-stack', 'resume-full-stack.html'],
] as const;

describe.skipIf(!sourceDir)('print CSS is byte-identical to the source designs', () => {
  for (const [variant, filename] of cases) {
    it(`${variant}`, () => {
      const path = join(sourceDir as string, filename);
      if (!existsSync(path)) {
        throw new Error(
          `CV_SOURCE_DESIGNS is set but ${path} is missing. Unset the variable to skip this suite.`,
        );
      }
      const html = renderSheetHtml({ variant, headline: 'X', bullets: [{ id: 'r.a' }] }, profile);
      expect(styleBlock(html)).toBe(styleBlock(readFileSync(path, 'utf8')));
    });
  }
});
