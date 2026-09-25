import { join } from 'node:path';
import { appDir, listSlugs, readStatus, dataRoot, type Stage, type Status } from './appdir.js';

/**
 * The ledger is the answer to "which CV went to whom, when, and what did it
 * claim?" — the question a flat download folder cannot answer three weeks
 * later when a recruiter calls.
 */

export interface LedgerRow {
  slug: string;
  company: string;
  role: string;
  stage: Stage;
  applied: string | null;
  lastUpdate: string;
  variant: string | null;
  dir: string;
}

function firstDateAt(status: Status, stage: Stage): string | null {
  return status.history.find((e) => e.stage === stage)?.date ?? null;
}

function lastDate(status: Status): string {
  const dates = status.history.map((e) => e.date).sort();
  return dates[dates.length - 1] ?? '—';
}

export async function readLedger(root = dataRoot()): Promise<LedgerRow[]> {
  const slugs = await listSlugs(root);
  const rows: LedgerRow[] = [];
  for (const slug of slugs) {
    const dir = appDir(slug, root);
    let status: Status;
    try {
      status = await readStatus(dir);
    } catch (err) {
      // A malformed folder must not hide the rest of the ledger.
      rows.push({
        slug,
        company: '(unreadable)',
        role: err instanceof Error ? err.message : String(err),
        stage: 'draft',
        applied: null,
        lastUpdate: '—',
        variant: null,
        dir,
      });
      continue;
    }
    rows.push({
      slug,
      company: status.company,
      role: status.role,
      stage: status.stage,
      applied: firstDateAt(status, 'applied'),
      lastUpdate: lastDate(status),
      variant: status.variant ?? null,
      dir,
    });
  }
  return rows;
}

export function formatLedger(rows: LedgerRow[]): string {
  if (rows.length === 0) {
    return 'No applications yet. Start one with: cv new <url|->';
  }
  const header = ['APPLIED', 'STAGE', 'COMPANY', 'ROLE', 'VARIANT'] as const;
  const body = rows.map((r) => [
    r.applied ?? '—',
    r.stage,
    r.company,
    r.role,
    r.variant ?? '—',
  ]);
  const all = [header as unknown as string[], ...body];
  const widths = header.map((_, i) => Math.max(...all.map((row) => (row[i] ?? '').length)));
  const line = (row: string[]) =>
    row.map((cell, i) => (cell ?? '').padEnd(widths[i] ?? 0)).join('  ').trimEnd();
  return [line(all[0] as string[]), ...body.map(line)].join('\n');
}

export function summarise(rows: LedgerRow[]): Record<Stage, number> {
  const counts = {} as Record<Stage, number>;
  for (const r of rows) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
  return counts;
}

export function outputPath(slug: string, filename: string, root = dataRoot()): string {
  return join(appDir(slug, root), filename);
}
