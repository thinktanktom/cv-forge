/**
 * Fidelity tests: real Chromium (via playwright-core) + real pandoc/pdfinfo.
 * Requires `nix develop` — see flake.nix and AGENTS.md. Never wired into
 * `npm test` or CI. Uses `fixtures/persona/` ONLY; this is a public repo, so
 * the user's real files must never appear here (AGENTS.md rule 5).
 */

import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { render } from '../../src/render.js';
import { loadPersonaProfile, samplePlan } from '../fixtures.js';

const execFileAsync = promisify(execFile);

// A4 in points, ±1pt tolerance — verified once against the user's known-good
// PDF (see the task brief: 594.96 x 841.92 pts, text-identical extraction,
// document.fonts.check('12pt "Carlito"') === true).
const A4_WIDTH_PT = 594.96;
const A4_HEIGHT_PT = 841.92;
const TOLERANCE_PT = 1;

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), 'cv-forge-render-test-'));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('render() fidelity, fixtures/persona only', () => {
  it('produces a 1-page A4 PDF with the font assertion satisfied', async () => {
    const profile = loadPersonaProfile();
    const plan = samplePlan();

    // render() throws if document.fonts.check(...) is false for the body's
    // first font family — a missing Carlito would surface right here rather
    // than silently reflowing to two pages.
    const result = await render(plan, profile, { outDir });

    expect(existsSync(result.pdfPath)).toBe(true);

    const { stdout } = await execFileAsync('pdfinfo', [result.pdfPath]);

    const pagesMatch = /^Pages:\s+(\d+)/m.exec(stdout);
    expect(pagesMatch, `pdfinfo output missing "Pages:":\n${stdout}`).not.toBeNull();
    expect(Number(pagesMatch?.[1])).toBe(1);

    const sizeMatch = /^Page size:\s+([\d.]+)\s*x\s*([\d.]+)\s*pts/m.exec(stdout);
    expect(sizeMatch, `pdfinfo output missing "Page size:":\n${stdout}`).not.toBeNull();
    const width = Number(sizeMatch?.[1]);
    const height = Number(sizeMatch?.[2]);

    expect(Math.abs(width - A4_WIDTH_PT)).toBeLessThanOrEqual(TOLERANCE_PT);
    expect(Math.abs(height - A4_HEIGHT_PT)).toBeLessThanOrEqual(TOLERANCE_PT);
  });

  it('also produces html and a non-empty ATS docx via pandoc', async () => {
    const profile = loadPersonaProfile();
    const plan = samplePlan();

    const result = await render(plan, profile, { outDir });

    expect(existsSync(result.htmlPath)).toBe(true);
    expect(existsSync(result.docxPath)).toBe(true);
    expect(statSync(result.docxPath).size).toBeGreaterThan(0);
  });

  it('writes a cover letter only when the plan carries one', async () => {
    const profile = loadPersonaProfile();

    const withoutCover = await render(samplePlan(), profile, { outDir });
    expect(withoutCover.coverPath).toBeUndefined();

    const outDir2 = await mkdtemp(path.join(tmpdir(), 'cv-forge-render-test-'));
    try {
      const plan = { ...samplePlan(), coverLetter: 'Dear hiring team, ...' };
      const withCover = await render(plan, profile, { outDir: outDir2 });
      expect(withCover.coverPath).toBeDefined();
      expect(existsSync(withCover.coverPath as string)).toBe(true);
    } finally {
      await rm(outDir2, { recursive: true, force: true });
    }
  });

  it('the full-stack variant also fits one A4 page', async () => {
    const profile = loadPersonaProfile();
    const plan = { ...samplePlan(), variant: 'full-stack' };

    const result = await render(plan, profile, { outDir });
    const { stdout } = await execFileAsync('pdfinfo', [result.pdfPath]);
    const pagesMatch = /^Pages:\s+(\d+)/m.exec(stdout);
    expect(Number(pagesMatch?.[1])).toBe(1);
  });
});
