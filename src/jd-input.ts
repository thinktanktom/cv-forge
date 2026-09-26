/**
 * Getting a job description into the tool without making the user think about
 * it. Accepts a URL or raw text, from an argument or from stdin, and works out
 * the rest — including the company and role, so those stop being flags you have
 * to retype from the page you are already looking at.
 *
 * Fetching a posting is a read. It is deliberately not the browser automation
 * that was ruled out for the *application* side: nothing is submitted, no
 * session is driven, and a paste always works if a fetch does not.
 */

export interface Posting {
  /** Plain text, ready to write as jd.md. */
  description: string;
  company?: string;
  role?: string;
  location?: string;
  url?: string;
  /** Where the metadata came from, for the "what did it guess" line. */
  source: 'json-ld' | 'page-text' | 'pasted';
}

export type Fetcher = (url: string) => Promise<string>;

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export const defaultFetcher: Fetcher = async (url) => {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) {
    throw new Error(`Fetching the posting failed with HTTP ${response.status}: ${url}`);
  }
  return response.text();
};

/** A whole-input URL, not a URL that merely appears inside a description. */
export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/\s/.test(trimmed)) return false;
  return /^https?:\/\/[^\s]+$/i.test(trimmed);
}

/* ------------------------------------------------------------------ */
/* HTML -> text                                                        */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

/**
 * Enough of an HTML-to-text converter for a job posting: block elements become
 * line breaks and list items become dashes. Deliberately not a general parser —
 * postings are prose in <p> and <li>, and a real DOM library would be a large
 * dependency for one narrow job.
 */
/**
 * Drops blank lines sitting between two bullets. Boards commonly wrap each
 * <li>'s text in a <p>, whose closing tag adds a block break, leaving every
 * item in a list double-spaced. Done line-wise rather than with a global
 * regex: a regex that matches a bullet either side consumes the second one,
 * so it only ever closes up every other gap.
 */
function closeUpLists(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  const isBullet = (line: string | undefined): boolean => line !== undefined && line.startsWith('- ');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line === '' && isBullet(out[out.length - 1])) {
      let next = i + 1;
      while (next < lines.length && lines[next] === '') next += 1;
      if (isBullet(lines[next])) continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|section|header|footer)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    // Only the list *ends* break: </li> would double-space every bullet,
    // because the following <li> already starts its own line.
    .replace(/<\/li>/gi, '')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const collapsed = decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return closeUpLists(collapsed);
}

/* ------------------------------------------------------------------ */
/* Structured extraction                                               */
/* ------------------------------------------------------------------ */

interface JsonLdJobPosting {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
  [key: string]: unknown;
}

function isJobPosting(node: JsonLdJobPosting): boolean {
  const type = node['@type'];
  return Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
}

/** JSON-LD blocks may hold a single node, an array, or an @graph. */
function flattenLdNodes(parsed: unknown): JsonLdJobPosting[] {
  if (Array.isArray(parsed)) return parsed.flatMap(flattenLdNodes);
  if (parsed && typeof parsed === 'object') {
    const node = parsed as JsonLdJobPosting & { '@graph'?: unknown };
    if (node['@graph'] !== undefined) return flattenLdNodes(node['@graph']);
    return [node];
  }
  return [];
}

function readLocation(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = readLocation(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const place = value as { name?: string; address?: Record<string, unknown> };
    if (typeof place.name === 'string' && place.name.trim()) return place.name.trim();
    const address = place.address;
    if (address) {
      const parts = ['addressLocality', 'addressRegion', 'addressCountry']
        .map((k) => address[k])
        .filter((p): p is string => typeof p === 'string' && p.trim() !== '');
      if (parts.length > 0) return parts.join(', ');
    }
  }
  return undefined;
}

/**
 * Pulls a JobPosting out of a page's JSON-LD. Ashby, Greenhouse and Lever all
 * emit this, which is why there is no per-board adapter here.
 */
export function extractJsonLd(html: string): Omit<Posting, 'source'> | undefined {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1] as string);
    } catch {
      continue; // a malformed block must not stop us finding a later good one
    }
    for (const node of flattenLdNodes(parsed)) {
      if (!isJobPosting(node)) continue;
      const description = typeof node.description === 'string' ? htmlToText(node.description) : '';
      if (!description) continue;
      const org = node.hiringOrganization;
      const company = typeof org === 'string' ? org : org?.name;
      const location = readLocation(node.jobLocation);
      return {
        description,
        ...(company ? { company: company.trim() } : {}),
        ...(node.title ? { role: node.title.trim() } : {}),
        ...(location ? { location } : {}),
      };
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Resolving whatever the user gave us                                 */
/* ------------------------------------------------------------------ */

/** Minimum characters before we believe a page yielded a real description. */
const MIN_DESCRIPTION = 200;

export async function fetchPosting(url: string, fetcher: Fetcher = defaultFetcher): Promise<Posting> {
  const html = await fetcher(url);
  const structured = extractJsonLd(html);
  if (structured) return { ...structured, url, source: 'json-ld' };

  const text = htmlToText(html);
  if (text.length < MIN_DESCRIPTION) {
    throw new Error(
      `Could not read a job description from ${url} — the page carries no JobPosting metadata ` +
        `and little readable text (many boards render client-side). Copy the description and ` +
        `pipe it in instead; the URL can still be recorded with --url.`,
    );
  }
  return { description: text, url, source: 'page-text' };
}

/**
 * Best-effort company and role from pasted text. Recognises the shapes a
 * posting usually opens with; returns nothing rather than guessing badly,
 * because a wrong slug is worse than being asked.
 */
export function inferFromText(text: string): { company?: string; role?: string } {
  const firstLines = text
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .filter((l) => l !== '')
    .slice(0, 5);

  const pair = (role?: string, company?: string): { company?: string; role?: string } => ({
    ...(role?.trim() ? { role: role.trim() } : {}),
    ...(company?.trim() ? { company: company.trim() } : {}),
  });

  for (const line of firstLines) {
    if (line.length > 90) continue;
    // "Senior Engineer — Ava Labs", "Senior Engineer at Ava Labs", "Ava Labs: Senior Engineer"
    const dash = /^(.{3,60}?)\s+[—–-]\s+(.{2,50})$/.exec(line);
    if (dash) return pair(dash[1], dash[2]);
    const at = /^(.{3,60}?)\s+at\s+(.{2,50})$/i.exec(line);
    if (at) return pair(at[1], at[2]);
    const colon = /^(.{2,50}?):\s+(.{3,60})$/.exec(line);
    if (colon) return pair(colon[2], colon[1]);
  }
  return {};
}

/**
 * The one entry point the CLI needs: hand it whatever the user supplied and
 * get back a posting. `input` may be a URL or the description itself.
 */
export async function resolvePosting(input: string, fetcher?: Fetcher): Promise<Posting> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('No job description given.');
  if (looksLikeUrl(trimmed)) return fetchPosting(trimmed, fetcher);
  return { description: trimmed, ...inferFromText(trimmed), source: 'pasted' };
}
