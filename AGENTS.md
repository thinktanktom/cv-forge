# AGENTS.md — cv-forge

## What this is
A CLI that builds a job-specific CV from a structured profile. **Public repo,
fictional fixtures, no personal data** — the real profile lives in a separate
private repo found via `$CV_DATA`.

## Commands
- `npm ci` — install
- `npm run lint` — `tsc --noEmit`
- `npm test` — unit tests, no browser, no network
- `npm run test:render` — fidelity tests; **requires `nix develop`** (chromium + Carlito + pandoc + poppler)
- `CV_SOURCE_DESIGNS=~/Documents npm test` — additionally runs the opt-in CSS byte-fidelity guard

## Layout

Read `src/types.ts` first; everything else builds against it.

| path | what |
|---|---|
| `src/types.ts` | the contracts, including the identity-free `SelectInput` |
| `src/profile.ts` | loads and validates the profile from `$CV_DATA/profile` |
| `src/jd-input.ts` | resolves a URL or pasted text into a posting |
| `src/selector.ts` | engine registry |
| `src/selectors/{tag,jev,claude}.ts` | the three selection engines |
| `src/selectors/index.ts` | registers all three; import it, not the engines |
| `src/shortlist.ts` | ranking, the cut, the borderline band |
| `src/variants.ts` | the template's five parameterised CSS values |
| `src/render.ts` | plan + template → html/pdf/docx, and the guards |
| `src/appdir.ts` | application directories and `status.yaml` |
| `src/ledger.ts` | `cv log` |
| `src/cli.ts` | the `cv` command |
| `templates/` | `sheet.html.eta` carries the tuned print CSS verbatim |
| `fixtures/persona/` | the fictional profile every test uses |
| `test/fixtures.ts` | shared loaders — use these rather than hand-rolling a `Profile` |
| `.claude/skills/reword/` | the in-session generative leg |
| `docs/jev-api.md` | the Jev schema, derived empirically |

## Non-negotiables

1. **`SelectInput` carries no identity.** The selection leg is the only thing
   that leaves the machine. Widening that type is a privacy decision, not a
   refactor.
2. **`render` validates every bullet id** against the profile and fails loudly
   on an unknown one. This is the anti-invention guard; do not soften it.
3. **The print CSS in `templates/sheet.html.eta` is tuned** to fit A4 in one
   page. Do not restyle it; parameterise it. The five intended variables are
   accent colour, chip colour, `@page` margin, `.edu` font-size and one
   optional density rule — see `src/variants.ts`.
4. **`render` enforces a page ceiling.** Do not raise `maxPages` or restyle the
   template to make content fit; drop a bullet from the plan instead.
5. **`tag` must never require network or credentials.** It is the fallback that
   makes the other engines optional.
6. **Cut shortlists by rank, never by an absolute score threshold.** The
   measured margin near the cut is 0.01–0.05 and probabilities drift between
   calls, so a threshold drops good bullets silently and differently each run.
   See `docs/jev-api.md`.
7. **Personal data lives in `$CV_DATA`.** Never read or write it from tests,
   and never commit anything under `profile/` or `applications/`.
8. **This repo is public.** `test/no-personal-data.test.ts` is the mechanical
   check; do not weaken its patterns to make a commit pass. Note its limit: it
   scans for credential shapes, data-repo paths and non-fixture emails — **not
   client names**. A human read is still required.
9. **Only `render.ts` may name a DOM global.** `tsconfig.lib` includes `"DOM"`
   so the `page.evaluate` closures type-check; everywhere else is Node, where
   `document` is a runtime crash rather than a compile error.
   `test/dom-containment.test.ts` enforces it.

## Tests

The suite is deliberately kept small. A test earns its place if it pins a
**decision** — a contract, an invariant, a bug that actually happened. It does
not earn its place by exercising the language or the standard library.

- **Guards are verified against a planted violation**, not only against a clean
  tree. A guard only ever run on good input proves nothing. Where a guard scans
  a file list or a directory, it also asserts the scan found something, so a
  broken glob cannot pass vacuously.
- **Regressions carry their story.** When a bug is fixed, the test says what
  went wrong and why the obvious fix was insufficient.
- **Use `test/fixtures.ts`** (`loadPersonaProfile`, `samplePlan`,
  `minimalProfile`, `minimalPlan`) rather than hand-rolling a `Profile`.
- **`npm test` never touches the network or a browser.** Anything that needs
  Chromium belongs in `test/render/`, behind `npm run test:render`.

## Off limits
- `flake.nix` pinning without re-checking the browser/font wiring
  (`npm run test:render`).
- `tsconfig.json` `lib` — removing `"DOM"` breaks the typed page closures in
  `render.ts`; adding libs beyond it widens what every module can reach.
- `package.json` `playwright-core` version — it must match the nixpkgs
  `playwright-driver` (currently 1.63.0) or the driver refuses to start.
