#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadProfile, allBullets } from './profile.js';
import { appDir, createApplication, readStatus, advance, dataRoot, STAGES, type Stage } from './appdir.js';
import { readLedger, formatLedger, summarise } from './ledger.js';
import { buildShortlist, DEFAULT_TOP } from './shortlist.js';
import { render } from './render.js';
import { registeredEngines, type EngineName } from './selector.js';
import { knownVariants } from './variants.js';
import type { Plan } from './types.js';
import './selectors/index.js';

const USAGE = `cv — build a job-specific CV from a structured profile

  cv new      --company <c> --role <r> [--variant <v>] [--url <u>] [--file <f>]
              Reads the job description from --file, or from stdin.

  cv select   <slug> [--engine ${registeredEngines().join('|')}] [--top <n>]
              Ranks your bullets against the JD -> shortlist.json

  cv reword   <slug>      Prints what to hand the in-session /reword step.
  cv render   <slug>      Validates every id, then html + pdf + docx (+ cover).
  cv open     <slug>      Opens the application folder.
  cv status   <slug> <${STAGES.join('|')}> [note]
  cv log                  The application ledger.
  cv validate             Load and check the profile.

CV_DATA must point at your private data repo (profile/ + applications/).
`;

function fail(message: string): never {
  process.stderr.write(`cv: ${message}\n`);
  process.exit(1);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function slugArg(positionals: string[]): string {
  const slug = positionals[1];
  if (!slug) fail('missing <slug>');
  return slug;
}

function loadJson<T>(path: string, what: string): T {
  if (!existsSync(path)) fail(`${what} not found at ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    fail(`${what} at ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      company: { type: 'string' },
      role: { type: 'string' },
      variant: { type: 'string' },
      url: { type: 'string' },
      file: { type: 'string' },
      engine: { type: 'string', default: 'jev' },
      top: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0];
  if (!command || values.help) {
    process.stdout.write(USAGE);
    return;
  }

  switch (command) {
    case 'new': {
      const company = values.company ?? fail('--company is required');
      const role = values.role ?? fail('--role is required');
      const jd = values.file ? readFileSync(values.file, 'utf8') : await readStdin();
      if (!jd.trim()) fail('no job description: pass --file <path> or pipe it on stdin');
      const { slug, dir } = await createApplication({
        company, role, jd,
        ...(values.url ? { url: values.url } : {}),
        ...(values.variant ? { variant: values.variant } : {}),
      });
      process.stdout.write(`${slug}\n${dir}\n`);
      return;
    }

    case 'select': {
      const slug = slugArg(positionals);
      const dir = appDir(slug);
      const engine = values.engine as EngineName;
      if (!registeredEngines().includes(engine)) {
        fail(`unknown engine "${engine}". Known: ${registeredEngines().join(', ')}`);
      }
      const profile = loadProfile();
      const status = await readStatus(dir);
      const jd = readFileSync(join(dir, 'jd.md'), 'utf8');
      const top = values.top ? Number(values.top) : DEFAULT_TOP;
      if (!Number.isFinite(top) || top < 1) fail(`--top must be a positive number, got "${values.top}"`);

      const result = await buildShortlist({
        engine, bullets: allBullets(profile), jd, top,
        ...(status.variant ? { variant: status.variant } : {}),
      });
      writeFileSync(join(dir, 'shortlist.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');

      process.stdout.write(`engine: ${result.engine}   kept ${result.kept.length}/${result.scored.length}\n\n`);
      for (const s of result.kept) {
        process.stdout.write(`  ${s.score.toFixed(2)}  ${s.id}\n`);
      }
      if (result.borderline.length > 0) {
        process.stdout.write(`\nborderline — the engine is effectively undecided, look at these yourself:\n`);
        for (const s of result.borderline) {
          process.stdout.write(`  ${s.score.toFixed(2)}  ${s.id}${result.kept.some((k) => k.id === s.id) ? ' (kept)' : ' (cut)'}\n`);
        }
      }
      return;
    }

    case 'reword': {
      const slug = slugArg(positionals);
      const dir = appDir(slug);
      process.stdout.write(
        `Run this in a Claude Code session inside the data repo:\n\n` +
          `  /reword ${slug}\n\n` +
          `It reads:\n  ${join(dir, 'shortlist.json')}\n  ${join(dir, 'jd.md')}\n` +
          `and writes:\n  ${join(dir, 'plan.json')}\n\n` +
          `The plan may only reference bullet ids from your profile — cv render rejects anything else.\n`,
      );
      return;
    }

    case 'render': {
      const slug = slugArg(positionals);
      const dir = appDir(slug);
      const profile = loadProfile();
      const plan = loadJson<Plan>(join(dir, 'plan.json'), 'plan.json');
      if (values.variant) plan.variant = values.variant;
      if (!knownVariants().includes(plan.variant)) {
        fail(`unknown variant "${plan.variant}". Known: ${knownVariants().join(', ')}`);
      }
      const result = await render(plan, profile, { outDir: dir });
      process.stdout.write(`${result.pdfPath}\n${result.docxPath}\n${result.htmlPath}\n`);
      if (result.coverPath) process.stdout.write(`${result.coverPath}\n`);
      return;
    }

    case 'open': {
      const slug = slugArg(positionals);
      const dir = appDir(slug);
      if (!existsSync(dir)) fail(`no such application: ${dir}`);
      process.stdout.write(`${dir}\n`);
      spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
      return;
    }

    case 'status': {
      const slug = slugArg(positionals);
      const stage = positionals[2] as Stage | undefined;
      if (!stage || !STAGES.includes(stage)) {
        fail(`stage must be one of: ${STAGES.join(', ')}`);
      }
      const note = positionals.slice(3).join(' ');
      const updated = await advance(appDir(slug), stage, note || undefined);
      process.stdout.write(`${slug}: ${updated.stage}\n`);
      return;
    }

    case 'log': {
      const rows = await readLedger();
      process.stdout.write(formatLedger(rows) + '\n');
      const counts = summarise(rows);
      if (rows.length > 0) {
        process.stdout.write(
          '\n' + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('   ') + '\n',
        );
      }
      return;
    }

    case 'validate': {
      const profile = loadProfile();
      const bullets = allBullets(profile);
      process.stdout.write(
        `${dataRoot()}\n` +
          `  ${profile.roles.length} roles, ${profile.projects.length} projects\n` +
          `  ${bullets.length} bullets, all ids unique\n` +
          `  ${profile.skills.length} skill groups, ${profile.education.length} education entries\n`,
      );
      return;
    }

    default:
      fail(`unknown command "${command}"\n\n${USAGE}`);
  }
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
