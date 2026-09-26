# cv-forge

Turns a structured profile into a job-specific CV, as a build step instead of a
browser round-trip.

    cv new --company <c> --role <r> [--variant <v>] --file <jd.md>
    cv select <slug> [--engine jev|tag|claude] [--top <n>]   -> shortlist.json
    /reword <slug>      rewrite the shortlist (in a Claude Code session) -> plan.json
    cv render <slug>    validate every id, then html + pdf + docx (+ cover)
    cv open <slug>      open the folder
    cv status <slug> <stage> [note]
    cv log              the application ledger
    cv validate         load and check the profile

## Two repos on purpose

This repo is **the tool**. Your profile and your applications live in a
separate private repo, located via `CV_DATA`. Nothing personal belongs here —
`profile/` and `applications/` are gitignored so a stray `git add -A` cannot
put them in a public repo. Tests run against `fixtures/persona/`, a fictional
person, so a reviewer can clone this and actually run it.

`CV_DATA` points at the data repo root: the profile is `$CV_DATA/profile`
and applications land in `$CV_DATA/applications/<slug>/`.

## Two guards that matter

`render` refuses to hand you a broken CV rather than failing quietly:

- **Unknown bullet id** — rejected before anything is drawn. See below.
- **Page overflow** — the template is tuned for one A4 sheet, and overflowing
  is silent, so the rendered page count is checked and anything over
  `maxPages` (default 1) throws. The font assertion catches the most common
  *cause* of a two-page CV; this catches the thing itself.

## The one rule

Tailoring may **select and rephrase**. It may not invent. A plan references
bullet ids from your profile; `render` rejects any id it cannot resolve before
it draws a pixel. A rewrite can sharpen wording that is already true; it cannot
conjure a new claim.

## Selection engines

| engine  | needs            | notes |
|---------|------------------|-------|
| `tag`   | nothing          | tag-overlap scoring. The floor — always works, no network. |
| `jev`   | `OPENROUTER_API_KEY` | `typesafe/jev-1.13` via OpenRouter. Fast, ~$0.0001/application. See `docs/jev-api.md`. |
| `claude`| a Claude Code session | the in-session fallback. |

All three satisfy one `Selector` contract and are held to the same golden-set
test, so `--engine` is a config change rather than a leap of faith.

## Setup

```sh
nix develop                       # chromium + Carlito + pandoc, correctly wired
npm ci
cp .env.example ~/.config/cv-forge/env && chmod 600 ~/.config/cv-forge/env
```

`nix develop` matters: Playwright must use the nixpkgs browsers
(`PLAYWRIGHT_BROWSERS_PATH`), and chromium needs `FONTCONFIG_FILE` to see
Carlito. Without the font the page reflows and a one-page CV silently becomes
two.

Node is not in the devShell — it builds from source on nixos-unstable today.
Use the system Node 22.
