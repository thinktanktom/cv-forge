/**
 * Named presets for the sheet template's parameterised print CSS.
 *
 * The two source designs (`~/Documents/resume-smart-contract.html` and
 * `~/Documents/resume-full-stack.html`) were diffed and found to differ in
 * exactly these five places. Everything else in the print CSS is shared and
 * lives verbatim in `templates/sheet.html.eta` — see AGENTS.md rule 3.
 */

export interface VariantPreset {
  /** Matches `Plan.variant`. */
  readonly name: string;
  /** `--accent` CSS custom property. */
  readonly accent: string;
  /** `--chip` CSS custom property. */
  readonly chip: string;
  /** The `@page { margin: ... }` value. */
  readonly pageMargin: string;
  /** `.edu div` font-size, including unit. */
  readonly eduFontSize: string;
  /**
   * Whether to emit the trailing `section:last-child h2 { margin-bottom: 2.4pt; }`
   * density nudge. Only the full-stack source design carries it.
   */
  readonly lastChildHeadingRule: boolean;
}

const presets: readonly VariantPreset[] = [
  {
    name: 'smart-contract',
    accent: '#0f5c5a',
    chip: '#eef3f3',
    pageMargin: '10.5mm 12mm',
    eduFontSize: '8.6pt',
    lastChildHeadingRule: false,
  },
  {
    name: 'full-stack',
    accent: '#1d4ed8',
    chip: '#eef2fb',
    pageMargin: '10.5mm 12mm 9mm',
    eduFontSize: '8.4pt',
    lastChildHeadingRule: true,
  },
];

const byName = new Map<string, VariantPreset>(presets.map((p) => [p.name, p]));

export function getVariant(name: string): VariantPreset {
  const preset = byName.get(name);
  if (!preset) {
    const known = presets.map((p) => p.name).join(', ');
    throw new Error(`Unknown variant "${name}". Known variants: ${known}`);
  }
  return preset;
}

export function knownVariants(): readonly string[] {
  return presets.map((p) => p.name);
}
