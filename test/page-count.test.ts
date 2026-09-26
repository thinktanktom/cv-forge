import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { pdfPageCount } from '../src/render.js';

/**
 * The font assertion catches the most common *cause* of a two-page CV. This
 * catches the thing itself: content that simply overflows. Verified against
 * `pdfinfo` on real one- and two-page Chromium output before being wired in.
 */
describe('pdfPageCount', () => {
  it('reads the page-tree root count', () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R] /Count 1 >> endobj\n');
    expect(pdfPageCount(pdf)).toBe(1);
  });

  it('reads a multi-page count', () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >> endobj\n');
    expect(pdfPageCount(pdf)).toBe(2);
  });

  it('takes the largest count when nested page trees are present', () => {
    const pdf = Buffer.from(
      '<< /Type /Pages /Count 2 >>\n<< /Type /Pages /Count 5 >>\n',
    );
    expect(pdfPageCount(pdf)).toBe(5);
  });

  it('throws rather than guessing when it cannot find a count', () => {
    expect(() => pdfPageCount(Buffer.from('not a pdf'))).toThrow(/Could not determine the page count/);
  });

  const known = `${process.env['HOME']}/Documents/Thomas_Cyriac_Smart_Contract_Engineer.pdf`;
  it.skipIf(!existsSync(known))('agrees with pdfinfo on a real one-page CV', () => {
    expect(pdfPageCount(readFileSync(known))).toBe(1);
  });
});
