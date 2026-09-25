/**
 * Plan + Profile + template -> html / pdf / docx / cover letter.
 *
 * The single most important line in this file is `validatePlanBullets`. A
 * `Plan` is produced by a selection engine or by a human editing plan.json;
 * neither is trusted. Every `PlanBullet.id` must resolve to a real
 * `Bullet.id` in the profile, or render refuses to draw a pixel. This is the
 * anti-invention guard described in README's "the one rule" and AGENTS.md
 * rule 2 — do not soften it, do not warn-and-continue.
 */

import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Eta } from 'eta';
import { chromium } from 'playwright-core';

import { getVariant } from './variants.js';
import type { Bullet, Education, Identity, Plan, PlanBullet, Profile, SkillGroup } from './types.js';

const execFileAsync = promisify(execFile);

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

// `templates/` lives at the repo root, one level above both `src/` (ts-node,
// vitest) and `dist/` (compiled output) — so `../templates` resolves
// correctly from either.
const templatesDir = fileURLToPath(new URL('../templates', import.meta.url));

const eta = new Eta({ views: templatesDir });

/* ------------------------------------------------------------------ */
/* The anti-invention guard                                            */
/* ------------------------------------------------------------------ */

/**
 * Throws a single error naming every `PlanBullet.id` that does not resolve to
 * a `Bullet.id` in the profile (roles or projects). Must run, and must
 * succeed, before any rendering happens.
 */
export function validatePlanBullets(plan: Plan, profile: Profile): void {
  const knownIds = new Set<string>();
  for (const role of profile.roles) {
    for (const bullet of role.bullets) knownIds.add(bullet.id);
  }
  for (const project of profile.projects) {
    for (const bullet of project.bullets) knownIds.add(bullet.id);
  }

  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const planBullet of plan.bullets) {
    if (!knownIds.has(planBullet.id) && !seen.has(planBullet.id)) {
      unknown.push(planBullet.id);
      seen.add(planBullet.id);
    }
  }

  if (unknown.length > 0) {
    const list = unknown.map((id) => `"${id}"`).join(', ');
    throw new Error(
      `Plan references ${unknown.length} bullet id(s) not found in the profile: ${list}. ` +
        'render refuses to invent content — fix or remove these ids in the plan before rendering.',
    );
  }
}

/** `rewrite` when present, else the profile's original text. Never invents. */
export function resolveBulletText(bullet: Bullet, planBullet: PlanBullet): string {
  return planBullet.rewrite ?? bullet.text;
}

/* ------------------------------------------------------------------ */
/* Sheet (CV) template context                                         */
/* ------------------------------------------------------------------ */

interface ResolvedBullet {
  readonly id: string;
  readonly text: string;
}

interface SheetRole {
  readonly title: string;
  readonly company: string;
  readonly dateRange: string;
  readonly location?: string;
  readonly bullets: readonly ResolvedBullet[];
}

interface SheetProject {
  readonly name: string;
  readonly bullets: readonly ResolvedBullet[];
}

export interface SheetTemplateData {
  readonly identity: Identity;
  readonly headline: string;
  readonly summary?: string;
  readonly contactPrimary: readonly string[];
  readonly contactLinks: readonly string[];
  readonly skills: readonly SkillGroup[];
  readonly roles: readonly SheetRole[];
  readonly projects: readonly SheetProject[];
  readonly education: readonly Education[];
  readonly accent: string;
  readonly chip: string;
  readonly pageMargin: string;
  readonly eduFontSize: string;
  readonly lastChildHeadingRule: boolean;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Formats "YYYY-MM" as "Mon YYYY"; passes anything else through unchanged. */
function formatMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = match[1] as string;
  const monthNum = Number(match[2]);
  const name = MONTH_NAMES[monthNum - 1];
  return name ? `${name} ${year}` : value;
}

function stripProtocol(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
}

/**
 * Builds the data object the sheet template renders. Selects and resolves
 * bullets, but never invents one — `validatePlanBullets` must already have
 * passed before this is called (`render()` enforces the order).
 */
export function buildSheetContext(plan: Plan, profile: Profile): SheetTemplateData {
  const variant = getVariant(plan.variant);
  const planBulletById = new Map<string, PlanBullet>(plan.bullets.map((pb) => [pb.id, pb]));

  const roles: SheetRole[] = [];
  for (const role of profile.roles) {
    const bullets: ResolvedBullet[] = [];
    for (const bullet of role.bullets) {
      const planBullet = planBulletById.get(bullet.id);
      if (!planBullet) continue;
      bullets.push({ id: bullet.id, text: resolveBulletText(bullet, planBullet) });
    }
    if (bullets.length === 0) continue;
    const dateRange = `${formatMonth(role.start)} – ${role.end ? formatMonth(role.end) : 'Present'}`;
    roles.push({
      title: role.title,
      company: role.company,
      dateRange,
      bullets,
      ...(role.location !== undefined ? { location: role.location } : {}),
    });
  }

  const projects: SheetProject[] = [];
  for (const project of profile.projects) {
    const bullets: ResolvedBullet[] = [];
    for (const bullet of project.bullets) {
      const planBullet = planBulletById.get(bullet.id);
      if (!planBullet) continue;
      bullets.push({ id: bullet.id, text: resolveBulletText(bullet, planBullet) });
    }
    if (bullets.length === 0) continue;
    projects.push({ name: project.name, bullets });
  }

  const identity = profile.identity;
  const contactPrimary = [identity.location, identity.phone, identity.email].filter(
    (v): v is string => v !== undefined,
  );
  const contactLinks = identity.links.map((link) => stripProtocol(link.url));

  return {
    identity,
    headline: plan.headline,
    ...(plan.summary !== undefined ? { summary: plan.summary } : {}),
    contactPrimary,
    contactLinks,
    skills: profile.skills,
    roles,
    projects,
    education: profile.education,
    accent: variant.accent,
    chip: variant.chip,
    pageMargin: variant.pageMargin,
    eduFontSize: variant.eduFontSize,
    lastChildHeadingRule: variant.lastChildHeadingRule,
  };
}

/** Renders the sheet template to an HTML string. No browser involved. */
export function renderSheetHtml(plan: Plan, profile: Profile): string {
  const context = buildSheetContext(plan, profile);
  const html = eta.render('sheet.html.eta', context);
  if (typeof html !== 'string') {
    throw new Error('sheet.html.eta rendered asynchronously unexpectedly.');
  }
  return html;
}

/* ------------------------------------------------------------------ */
/* Cover letter template context                                       */
/* ------------------------------------------------------------------ */

interface CoverTemplateData {
  readonly identity: Identity;
  readonly coverLetter: string;
  readonly date: string;
}

export function buildCoverContext(plan: Plan, profile: Profile, now: Date = new Date()): CoverTemplateData {
  if (plan.coverLetter === undefined) {
    throw new Error('buildCoverContext called on a plan with no coverLetter.');
  }
  return {
    identity: profile.identity,
    coverLetter: plan.coverLetter,
    date: now.toISOString().slice(0, 10),
  };
}

/** Renders the cover letter template to a Markdown string. No browser involved. */
export function renderCoverMarkdown(plan: Plan, profile: Profile, now: Date = new Date()): string {
  const context = buildCoverContext(plan, profile, now);
  const md = eta.render('cover.md.eta', context);
  if (typeof md !== 'string') {
    throw new Error('cover.md.eta rendered asynchronously unexpectedly.');
  }
  return md;
}

/* ------------------------------------------------------------------ */
/* PDF (browser-dependent)                                             */
/* ------------------------------------------------------------------ */

/**
 * Renders `html` to a PDF at `pdfPath` via a headless Chromium.
 *
 * Asserts that the first font family in the rendered body's computed font
 * stack actually resolved (`document.fonts.check`) before drawing the PDF.
 * Without this assertion, a missing Carlito silently reflows a one-page CV
 * to two sheets with no other error — see flake.nix and AGENTS.md.
 */
export async function renderPdf(html: string, pdfPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    // These run inside the page, not Node, so they are passed as strings
    // rather than typed closures — this repo's tsconfig has no "dom" lib
    // (by design; render.ts is the only file that ever touches a page), and
    // Playwright's string form of `evaluate` sidesteps that cleanly.
    const family = await page.evaluate<string>(
      '(function () {' +
        'var raw = getComputedStyle(document.body).fontFamily;' +
        'return (raw.split(",")[0] || "").trim().replace(/^["\']|["\']$/g, "");' +
        '})()',
    );
    if (!family) {
      throw new Error('Could not determine the body font family from the rendered page.');
    }

    const resolved = await page.evaluate<boolean>(
      `document.fonts.check(${JSON.stringify(`12pt "${family}"`)})`,
    );
    if (!resolved) {
      throw new Error(
        `Font "${family}" did not resolve while rendering the CV (document.fonts.check ` +
          'returned false). A missing font silently reflows a one-page CV to two sheets ' +
          'with no other error. Run inside "nix develop" so FONTCONFIG_FILE points ' +
          'Chromium at Carlito, and PLAYWRIGHT_BROWSERS_PATH at the nixpkgs browsers.',
      );
    }

    await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------ */
/* ATS .docx (shells out to pandoc)                                    */
/* ------------------------------------------------------------------ */

export async function renderDocx(htmlPath: string, docxPath: string): Promise<void> {
  try {
    await execFileAsync('pandoc', [htmlPath, '--from=html', '--to=docx', '-o', docxPath]);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `pandoc failed to produce "${docxPath}" from "${htmlPath}": ${cause}. ` +
        'pandoc is provided by the devShell — run inside "nix develop".',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export interface RenderOptions {
  /** Application directory to write outputs into, e.g. `applications/<slug>`. */
  readonly outDir: string;
  /** Overrides the cover letter date (mainly for deterministic tests). */
  readonly now?: Date;
}

export interface RenderResult {
  readonly htmlPath: string;
  readonly pdfPath: string;
  readonly docxPath: string;
  readonly coverPath?: string;
}

/**
 * The full pipeline: validate -> html -> pdf -> docx, and a cover letter if
 * the plan carries one. Validation runs first and unconditionally — nothing
 * is written to disk if it fails.
 */
export async function render(plan: Plan, profile: Profile, options: RenderOptions): Promise<RenderResult> {
  validatePlanBullets(plan, profile);

  const html = renderSheetHtml(plan, profile);

  await mkdir(options.outDir, { recursive: true });

  const htmlPath = path.join(options.outDir, 'cv.html');
  await writeFile(htmlPath, html, 'utf8');

  const pdfPath = path.join(options.outDir, 'cv.pdf');
  await renderPdf(html, pdfPath);

  const docxPath = path.join(options.outDir, 'cv.docx');
  await renderDocx(htmlPath, docxPath);

  if (plan.coverLetter === undefined) {
    return { htmlPath, pdfPath, docxPath };
  }

  const coverMd = renderCoverMarkdown(plan, profile, options.now ?? new Date());
  const coverPath = path.join(options.outDir, 'cover-letter.md');
  await writeFile(coverPath, coverMd, 'utf8');

  return { htmlPath, pdfPath, docxPath, coverPath };
}
