import { describe, it, expect } from 'vitest';
import {
  looksLikeUrl, htmlToText, decodeEntities, extractJsonLd,
  fetchPosting, inferFromText, resolvePosting, type Fetcher,
} from '../src/jd-input.js';

/** Synthetic, not a real company's posting. */
const ldPage = (node: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(node)}</script></head><body>x</body></html>`;

const jobPosting = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Senior Software Engineer, Core',
  hiringOrganization: { '@type': 'Organization', name: 'Northwind Labs' },
  jobLocation: { '@type': 'Place', address: { addressLocality: 'Lisbon', addressCountry: 'PT' } },
  description:
    '<p>We need a backend engineer.</p><ul><li>Build APIs</li><li>Ship SDKs</li></ul><p>5+ years &amp; TypeScript.</p>',
};

describe('looksLikeUrl', () => {
  it('accepts a bare http(s) URL', () => {
    expect(looksLikeUrl('https://jobs.example.invalid/a/b')).toBe(true);
    expect(looksLikeUrl('  http://example.invalid  ')).toBe(true);
  });

  it('rejects a description that merely mentions one', () => {
    expect(looksLikeUrl('Apply at https://example.invalid if interested')).toBe(false);
  });

  it('rejects prose and empty input', () => {
    expect(looksLikeUrl('Senior Engineer at Northwind')).toBe(false);
    expect(looksLikeUrl('')).toBe(false);
  });
});

describe('htmlToText', () => {
  it('turns list items into dashes and blocks into breaks', () => {
    expect(htmlToText('<p>Intro</p><ul><li>One</li><li>Two</li></ul>'))
      .toBe('Intro\n\n- One\n- Two');
  });

  it('decodes entities, including numeric ones', () => {
    expect(decodeEntities('5+ years &amp; &#84;ypeScript &mdash; &#x41;')).toBe('5+ years & TypeScript — A');
  });

  it('drops script and style content', () => {
    expect(htmlToText('<style>p{color:red}</style><script>alert(1)</script><p>Real</p>')).toBe('Real');
  });

  it('closes up EVERY gap in a list, not every other one', () => {
    /*
     * Boards wrap each <li>'s text in a <p>, so the closing </p> adds a block
     * break and every bullet ends up double-spaced. The obvious fix — a global
     * regex matching a bullet on both sides — consumes the second bullet and
     * therefore only closes alternate gaps. This is that regression.
     */
    const html = '<ul>' + ['One', 'Two', 'Three', 'Four']
      .map((t) => `<li><p>${t}</p></li>`).join('') + '</ul>';
    expect(htmlToText(html)).toBe('- One\n- Two\n- Three\n- Four');
  });

  it('keeps the blank line between a paragraph and a following list', () => {
    expect(htmlToText('<p>Intro</p><ul><li>One</li></ul>')).toBe('Intro\n\n- One');
  });

  it('collapses runaway blank lines', () => {
    expect(htmlToText('<p>A</p><div></div><div></div><p>B</p>')).toBe('A\n\nB');
  });
});

describe('extractJsonLd', () => {
  it('pulls title, company, location and text from a JobPosting', () => {
    const got = extractJsonLd(ldPage(jobPosting));
    expect(got?.role).toBe('Senior Software Engineer, Core');
    expect(got?.company).toBe('Northwind Labs');
    expect(got?.location).toBe('Lisbon, PT');
    expect(got?.description).toContain('- Build APIs');
    expect(got?.description).toContain('5+ years & TypeScript.');
  });

  it('finds it inside an array', () => {
    expect(extractJsonLd(ldPage([{ '@type': 'Organization' }, jobPosting]))?.role)
      .toBe('Senior Software Engineer, Core');
  });

  it('finds it inside an @graph', () => {
    expect(extractJsonLd(ldPage({ '@graph': [jobPosting] }))?.company).toBe('Northwind Labs');
  });

  it('accepts an array-valued @type', () => {
    expect(extractJsonLd(ldPage({ ...jobPosting, '@type': ['JobPosting', 'Thing'] }))?.role)
      .toBe('Senior Software Engineer, Core');
  });

  it('skips a malformed block rather than giving up on a later good one', () => {
    const html =
      '<script type="application/ld+json">{ not json </script>' + ldPage(jobPosting);
    expect(extractJsonLd(html)?.company).toBe('Northwind Labs');
  });

  it('ignores non-JobPosting structured data', () => {
    expect(extractJsonLd(ldPage({ '@type': 'Organization', name: 'Northwind' }))).toBeUndefined();
  });
});

describe('fetchPosting', () => {
  const fetcherFor = (body: string): Fetcher => async () => body;

  it('prefers structured metadata', async () => {
    const got = await fetchPosting('https://x.invalid/job', fetcherFor(ldPage(jobPosting)));
    expect(got.source).toBe('json-ld');
    expect(got.company).toBe('Northwind Labs');
    expect(got.url).toBe('https://x.invalid/job');
  });

  it('falls back to page text when there is no JobPosting', async () => {
    const body = `<html><body><p>${'Backend engineer wanted. '.repeat(20)}</p></body></html>`;
    const got = await fetchPosting('https://x.invalid/job', fetcherFor(body));
    expect(got.source).toBe('page-text');
    expect(got.description).toContain('Backend engineer wanted.');
    expect(got.company).toBeUndefined();
  });

  it('tells you to paste instead when the page yields almost nothing', async () => {
    await expect(fetchPosting('https://x.invalid/job', fetcherFor('<html><body></body></html>')))
      .rejects.toThrow(/carries no JobPosting metadata.*pipe it in instead/s);
  });
});

describe('inferFromText', () => {
  it('reads "Role — Company"', () => {
    expect(inferFromText('# Senior Engineer — Northwind Labs\n\nWe need...'))
      .toEqual({ role: 'Senior Engineer', company: 'Northwind Labs' });
  });

  it('reads "Role at Company"', () => {
    expect(inferFromText('Senior Engineer at Northwind Labs\n\nWe need...'))
      .toEqual({ role: 'Senior Engineer', company: 'Northwind Labs' });
  });

  it('reads "Company: Role"', () => {
    expect(inferFromText('Northwind Labs: Senior Engineer\n\nWe need...'))
      .toEqual({ company: 'Northwind Labs', role: 'Senior Engineer' });
  });

  it('returns nothing rather than guessing badly', () => {
    expect(inferFromText('Looking to join a world-class team? We make things simple.')).toEqual({});
  });
});

describe('resolvePosting', () => {
  it('fetches when given a URL', async () => {
    const got = await resolvePosting('https://x.invalid/job', async () => ldPage(jobPosting));
    expect(got.source).toBe('json-ld');
  });

  it('treats anything else as the description', async () => {
    const got = await resolvePosting('Senior Engineer at Northwind Labs\n\nBuild things.');
    expect(got.source).toBe('pasted');
    expect(got.company).toBe('Northwind Labs');
    expect(got.description).toContain('Build things.');
  });

  it('refuses empty input', async () => {
    await expect(resolvePosting('   ')).rejects.toThrow(/No job description/);
  });
});
