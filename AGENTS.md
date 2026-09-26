# AGENTS.md — cv-forge

## What this is
A CLI that renders a job-specific CV from a structured profile. Public repo,
fictional fixtures, no personal data.

## Commands
- `npm ci` — install
- `npm run lint` — `tsc --noEmit`
- `npm test` — vitest (unit; no browser)
- `npm run test:render` — fidelity tests; **requires `nix develop`** (chromium + Carlito)

## Layout
- `src/types.ts` — the contracts. Read this first.
- `src/selector.ts` — engine registry.
- `src/selectors/{tag,jev,claude}.ts` — the three engines.
- `src/shortlist.ts` — ranking, the cut, and the borderline band.
- `src/cli.ts` — the `cv` command.
- `.claude/skills/reword/` — the in-session generative leg.
- `src/render.ts` — plan + template -> html/pdf/docx.
- `src/ledger.ts`, `src/cli.ts`
- `templates/` — `sheet.html.eta` carries the tuned print CSS verbatim.
- `fixtures/persona/` — fictional profile; all tests use it.
- `docs/jev-api.md` — empirically derived Jev schema.

## Non-negotiables
1. **`SelectInput` carries no identity.** The selection leg is the only thing
   that leaves the machine. Widening that type is a privacy decision.
2. **`render` validates every bullet id** against the profile and fails loudly
   on an unknown one. This is the anti-invention guard; do not soften it.
3. **The print CSS in `templates/sheet.html.eta` is tuned.** It fits A4 in one
   page. Do not restyle it; parameterise it. Accent colour and two density
   nudges are the only intended variables.
4. **`tag` must never require network or credentials.** It is the fallback that
   makes the other engines optional.
5. **Cut shortlists by rank, never by an absolute score threshold.** Jev's
   measured margin near the cut is 0.01-0.05 and probabilities drift between
   calls, so a threshold drops good bullets silently and differently each run.
   See `docs/jev-api.md`.
6. **`render` enforces a page ceiling.** Do not raise `maxPages` or restyle
   the template to make content fit; drop a bullet in the plan instead.
7. Personal data lives in `$CV_DATA` (a separate private repo). Never read or
   write it from tests, and never commit anything under `profile/` or
   `applications/`.

8. **This repo is public.** `test/no-personal-data.test.ts` is the mechanical
   check; do not weaken its patterns to make a commit pass. If it fires, the
   data belongs in `$CV_DATA`, not here.

## Off limits
- `flake.nix` pinning without checking that the browser/font wiring still works
  (`npm run test:render`).
- `package.json` `playwright-core` version — it must match nixpkgs
  `playwright-driver` (currently 1.63.0) or the driver refuses to start.
