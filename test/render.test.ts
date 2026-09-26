import { describe, expect, it } from 'vitest';

import {
  buildSheetContext,
  renderCoverMarkdown,
  renderSheetHtml,
  validatePlanBullets,
} from '../src/render.js';
import type { Plan } from '../src/types.js';
import { loadPersonaProfile, samplePlan } from './fixtures.js';

const profile = loadPersonaProfile();

describe('validatePlanBullets — the anti-invention guard', () => {
  /*
   * Both directions in one test on purpose. An inverted condition would still
   * satisfy a throws-on-bad test, and the end-to-end render that would catch
   * it needs a browser and so does not run in CI.
   */
  it('accepts real bullet ids and rejects invented ones by name', () => {
    expect(() => validatePlanBullets(samplePlan(), profile)).not.toThrow();

    const plan: Plan = {
      ...samplePlan(),
      bullets: [
        { id: 'northwind.staking' },
        { id: 'northwind.made-up-achievement' },
        { id: 'harbour.also-fabricated' },
      ],
    };
    expect(() => validatePlanBullets(plan, profile))
      .toThrow(/northwind\.made-up-achievement.*harbour\.also-fabricated/s);
  });
});

describe('buildSheetContext', () => {
  it('keeps profile order, applies rewrites, and drops roles with nothing selected', () => {
    const ctx = buildSheetContext(samplePlan(), profile);

    // harbour.ci and harbour.dashboard were not selected; harbour.api was.
    const harbour = ctx.roles.find((r) => r.company === 'Harbour Labs');
    expect(harbour?.bullets.map((b) => b.id)).toEqual(['harbour.api']);

    // Profile order wins over plan order, and the rewrite replaces the original.
    const northwind = ctx.roles.find((r) => r.company === 'Northwind Protocol');
    expect(northwind?.bullets.map((b) => b.id))
      .toEqual(['northwind.staking', 'northwind.audit-remediation', 'northwind.oracle']);
    expect(northwind?.bullets.find((b) => b.id === 'northwind.audit-remediation')?.text)
      .toContain('critical reentrancy path');

    // A role with zero selected bullets is dropped, not rendered empty.
    const projectOnly = buildSheetContext({ ...samplePlan(), bullets: [{ id: 'openfoo.merged' }] }, profile);
    expect(projectOnly.roles).toHaveLength(0);
    expect(projectOnly.projects).toHaveLength(1);
  });
});

describe('renderSheetHtml (Eta, no browser)', () => {
  it('renders selected bullets, omits unselected ones, and never prints "undefined"', () => {
    const html = renderSheetHtml(samplePlan(), profile);

    expect(html).toContain('Northwind Protocol');
    expect(html).toContain('critical reentrancy path'); // the rewrite
    expect(html).not.toContain('Closed 14 findings'); // the original it superseded
    expect(html).not.toContain('React dashboard for internal analytics'); // unselected
    expect(html).not.toContain('Introduced CI that blocked merges'); // unselected

    // A plan with no summary must leave the section out rather than print the
    // word "undefined" onto the sheet.
    const { summary: _dropped, ...noSummary } = samplePlan();
    expect(renderSheetHtml(noSummary as Plan, profile)).not.toContain('undefined');
  });

  /*
   * All five parameterised values, asserted in the emitted CSS rather than on
   * the preset object: this proves the preset actually reaches the output,
   * which asserting getVariant('...').accent never did.
   */
  it.each([
    ['smart-contract', '#0f5c5a', '#eef3f3', '10.5mm 12mm', '8.6pt', false],
    ['full-stack', '#1d4ed8', '#eef2fb', '10.5mm 12mm 9mm', '8.4pt', true],
  ])('%s wires its preset through to the emitted CSS', (variant, accent, chip, margin, edu, density) => {
    const html = renderSheetHtml({ ...samplePlan(), variant }, profile);
    expect(html).toContain(`--accent: ${accent};`);
    expect(html).toContain(`--chip: ${chip};`);
    expect(html).toContain(`@page { size: A4; margin: ${margin}; }`);
    expect(html).toContain(`.edu div { font-size: ${edu}; }`);
    // Match the rule, not the selector: the selector also appears in the
    // template's explanatory comment.
    const hasDensityRule = html.includes('section:last-child h2 { margin-bottom');
    expect(hasDensityRule).toBe(density);
  });
});

describe('renderCoverMarkdown (Eta, no browser)', () => {
  it('carries the body through unescaped — it is Markdown, not HTML', () => {
    const plan: Plan = { ...samplePlan(), coverLetter: 'I write Solidity & I enjoy it — a lot.' };
    const md = renderCoverMarkdown(plan, profile, new Date('2026-09-25T00:00:00Z'));
    expect(md).toContain('I write Solidity & I enjoy it — a lot.');
    expect(md).not.toContain('&amp;');
    expect(md).toContain('2026-09-25');
  });
});
