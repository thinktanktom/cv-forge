import { describe, expect, it } from 'vitest';

import {
  buildCoverContext,
  buildSheetContext,
  renderCoverMarkdown,
  renderSheetHtml,
  resolveBulletText,
  validatePlanBullets,
} from '../src/render.js';
import type { Plan } from '../src/types.js';
import { loadPersonaProfile, samplePlan } from './fixtures.js';

describe('validatePlanBullets — the anti-invention guard', () => {
  it('passes a plan that references only real bullet ids', () => {
    const profile = loadPersonaProfile();
    expect(() => validatePlanBullets(samplePlan(), profile)).not.toThrow();
  });

  it('throws and names every unknown bullet id, before rendering anything', () => {
    const profile = loadPersonaProfile();
    const plan: Plan = {
      ...samplePlan(),
      bullets: [
        { id: 'northwind.staking' },
        { id: 'northwind.made-up-achievement' },
        { id: 'harbour.also-fabricated' },
      ],
    };

    let thrown: unknown;
    try {
      validatePlanBullets(plan, profile);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('northwind.made-up-achievement');
    expect(message).toContain('harbour.also-fabricated');
    // The real id must NOT be reported as unknown.
    expect(message).not.toContain('"northwind.staking"');
  });

  it('does not silently drop a duplicate unknown id from the message, but only reports it once', () => {
    const profile = loadPersonaProfile();
    const plan: Plan = {
      ...samplePlan(),
      bullets: [{ id: 'ghost.bullet' }, { id: 'ghost.bullet' }],
    };

    expect(() => validatePlanBullets(plan, profile)).toThrowError(/ghost\.bullet/);
    try {
      validatePlanBullets(plan, profile);
    } catch (err) {
      const message = (err as Error).message;
      const occurrences = message.split('ghost.bullet').length - 1;
      expect(occurrences).toBe(1);
    }
  });
});

describe('resolveBulletText', () => {
  it('uses the rewrite when present', () => {
    const bullet = { id: 'x', text: 'Original wording.', tags: [] };
    const planBullet = { id: 'x', rewrite: 'Sharpened wording.' };
    expect(resolveBulletText(bullet, planBullet)).toBe('Sharpened wording.');
  });

  it('falls back to the profile bullet text when there is no rewrite', () => {
    const bullet = { id: 'x', text: 'Original wording.', tags: [] };
    const planBullet = { id: 'x' };
    expect(resolveBulletText(bullet, planBullet)).toBe('Original wording.');
  });
});

describe('buildSheetContext', () => {
  it('only includes roles/projects with at least one selected bullet, in profile order, with rewrites applied', () => {
    const profile = loadPersonaProfile();
    const plan = samplePlan();
    const ctx = buildSheetContext(plan, profile);

    // harbour.ci and harbour.dashboard were not selected; harbour.api was.
    const harbour = ctx.roles.find((r) => r.company === 'Harbour Labs');
    expect(harbour).toBeDefined();
    expect(harbour?.bullets).toHaveLength(1);
    expect(harbour?.bullets[0]?.id).toBe('harbour.api');

    // Northwind bullets keep profile order regardless of plan order.
    const northwind = ctx.roles.find((r) => r.company === 'Northwind Protocol');
    expect(northwind?.bullets.map((b) => b.id)).toEqual([
      'northwind.staking',
      'northwind.audit-remediation',
      'northwind.oracle',
    ]);

    // The rewrite for northwind.audit-remediation was applied, not the original text.
    const rewritten = northwind?.bullets.find((b) => b.id === 'northwind.audit-remediation');
    expect(rewritten?.text).toContain('critical reentrancy path');

    // A role with zero selected bullets is dropped, not rendered empty.
    const plainPlan: Plan = { ...plan, bullets: [{ id: 'openfoo.merged' }] };
    const ctxNoRoles = buildSheetContext(plainPlan, profile);
    expect(ctxNoRoles.roles).toHaveLength(0);
    expect(ctxNoRoles.projects).toHaveLength(1);
  });

  it('carries the selected variant preset into accent/chip/margin/font fields', () => {
    const profile = loadPersonaProfile();
    const ctx = buildSheetContext({ ...samplePlan(), variant: 'full-stack' }, profile);
    expect(ctx.accent).toBe('#1d4ed8');
    expect(ctx.chip).toBe('#eef2fb');
    expect(ctx.pageMargin).toBe('10.5mm 12mm 9mm');
    expect(ctx.eduFontSize).toBe('8.4pt');
    expect(ctx.lastChildHeadingRule).toBe(true);
  });

  it('omits the summary key entirely when the plan has no summary (exactOptionalPropertyTypes)', () => {
    const profile = loadPersonaProfile();
    const { summary, ...rest } = samplePlan();
    void summary;
    const ctx = buildSheetContext(rest as Plan, profile);
    expect('summary' in ctx).toBe(false);
  });
});

describe('renderSheetHtml (Eta, no browser)', () => {
  it('renders selected bullet text and omits unselected bullet text', () => {
    const profile = loadPersonaProfile();
    const html = renderSheetHtml(samplePlan(), profile);

    expect(html).toContain('Northwind Protocol');
    expect(html).toContain('critical reentrancy path'); // the rewrite
    expect(html).not.toContain('Closed 14 findings'); // the original, superseded text

    // harbour.dashboard and harbour.ci were not selected.
    expect(html).not.toContain('React dashboard for internal analytics');
    expect(html).not.toContain('Introduced CI that blocked merges');
  });

  it('wires the variant preset into the emitted CSS', () => {
    const profile = loadPersonaProfile();
    const html = renderSheetHtml(samplePlan(), profile);
    expect(html).toContain('--accent: #0f5c5a;');
    expect(html).toContain('@page { size: A4; margin: 10.5mm 12mm; }');
    // smart-contract has no density rule (the phrase appears in the template's
    // explanatory comment, so match the actual CSS rule, not just the selector).
    expect(html).not.toContain('section:last-child h2 { margin-bottom');
  });
});

describe('renderCoverMarkdown (Eta, no browser)', () => {
  it('is not HTML-escaped and carries the cover letter body through', () => {
    const profile = loadPersonaProfile();
    const plan: Plan = { ...samplePlan(), coverLetter: 'I write Solidity & I enjoy it — a lot.' };
    const md = renderCoverMarkdown(plan, profile, new Date('2026-09-25T00:00:00Z'));
    expect(md).toContain('I write Solidity & I enjoy it — a lot.');
    expect(md).not.toContain('&amp;');
    expect(md).toContain('2026-09-25');
  });

  it('throws when built from a plan with no cover letter', () => {
    const profile = loadPersonaProfile();
    expect(() => buildCoverContext(samplePlan(), profile)).toThrow();
  });
});
