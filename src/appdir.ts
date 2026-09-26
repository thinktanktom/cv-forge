import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';

/**
 * Application directories live in the PRIVATE data repo, never here.
 * One dated folder per application is what replaces a flat ~/Documents and a
 * memory of which CV went where.
 */

export type Stage =
  | 'draft'
  | 'applied'
  | 'screen'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export const STAGES: readonly Stage[] = [
  'draft', 'applied', 'screen', 'interview', 'offer', 'rejected', 'withdrawn',
] as const;

export interface StatusEvent {
  date: string;
  stage: Stage;
  note?: string;
}

export interface Status {
  company: string;
  role: string;
  url?: string;
  variant?: string;
  stage: Stage;
  history: StatusEvent[];
}

/** YYYY-MM-DD. The only date format this repo writes. */
function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function dataRoot(): string {
  const root = process.env['CV_DATA'];
  if (!root) {
    throw new Error(
      'CV_DATA is not set. It must point at your private data repo, e.g. ' +
        'CV_DATA=~/dev/cv-data. Personal data never lives in this repo.',
    );
  }
  return resolve(root);
}

export function applicationsRoot(root = dataRoot()): string {
  return join(root, 'applications');
}

/** "Aave", "Staff Smart Contract Engineer" -> "2026-09-25-aave-staff-smart-contract-engineer" */
export function slugFor(company: string, role: string, today = new Date()): string {
  const date = isoDate(today);
  const part = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const company_ = part(company);
  const role_ = part(role);
  if (!company_ || !role_) {
    throw new Error(`Cannot build a slug from company="${company}" role="${role}"`);
  }
  return `${date}-${company_}-${role_}`;
}

export function appDir(slug: string, root = dataRoot()): string {
  return join(applicationsRoot(root), slug);
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface NewApplication {
  company: string;
  role: string;
  jd: string;
  url?: string;
  variant?: string;
}

/** Creates the folder and writes jd.md + status.yaml. Refuses to clobber. */
export async function createApplication(
  input: NewApplication,
  root = dataRoot(),
  today = new Date(),
): Promise<{ slug: string; dir: string }> {
  const slug = slugFor(input.company, input.role, today);
  const dir = appDir(slug, root);
  if (await exists(dir)) {
    throw new Error(`Application already exists: ${dir}`);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'jd.md'), input.jd.trimEnd() + '\n', 'utf8');
  const status: Status = {
    company: input.company,
    role: input.role,
    ...(input.url ? { url: input.url } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    stage: 'draft',
    history: [{ date: isoDate(today), stage: 'draft' }],
  };
  await writeStatus(dir, status);
  return { slug, dir };
}

export async function readStatus(dir: string): Promise<Status> {
  const raw = await readFile(join(dir, 'status.yaml'), 'utf8');
  const parsed = parse(raw) as Partial<Status> | null;
  if (!parsed || typeof parsed.company !== 'string' || typeof parsed.role !== 'string') {
    throw new Error(`Malformed status.yaml in ${dir}: company and role are required`);
  }
  const stage = parsed.stage ?? 'draft';
  if (!STAGES.includes(stage)) {
    throw new Error(`Unknown stage "${stage}" in ${dir}. Expected one of: ${STAGES.join(', ')}`);
  }
  return { ...parsed, stage, history: parsed.history ?? [] } as Status;
}

export async function writeStatus(dir: string, status: Status): Promise<void> {
  await writeFile(join(dir, 'status.yaml'), stringify(status), 'utf8');
}

/** Appends an event and moves the current stage. */
export async function advance(dir: string, stage: Stage, note?: string, today = new Date()): Promise<Status> {
  const status = await readStatus(dir);
  const event: StatusEvent = {
    date: isoDate(today),
    stage,
    ...(note ? { note } : {}),
  };
  const next: Status = { ...status, stage, history: [...status.history, event] };
  await writeStatus(dir, next);
  return next;
}

export async function listSlugs(root = dataRoot()): Promise<string[]> {
  const dir = applicationsRoot(root);
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
}
