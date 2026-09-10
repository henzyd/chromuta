# Contributing to Chromuta

Thanks for considering it. This document covers how to get set up, what the codebase
expects of a change, and how a pull request gets reviewed.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

You need Node 18 or newer and VS Code 1.85 or newer.

```bash
npm install
```

```bash
npm run check
```

`npm run check` runs formatting, lint, typecheck, tests and the production build. If it
passes locally it will pass in CI, because CI runs the same script.

To try the extension for real, press <kbd>F5</kbd>. That opens an Extension Development
Host with Chromuta loaded. Open the `examples/` folder inside it, then run
**Chromuta: Scan Workspace for Colors** from the command palette. The examples folder
carries one file per supported dialect plus deliberate near-misses, so it is the fastest
way to see whether a change did what you intended.

To test the real packaged artefact rather than the development host:

```bash
npm run package && code --install-extension chromuta.vsix
```

## How the codebase is arranged

[ARCHITECTURE.md](ARCHITECTURE.md) is the full picture. The short version is that
dependencies only ever point one way:

```
features/    VS Code surfaces: providers, commands, the tree view
    ↓
workspace/   editor-aware orchestration: scanning, the index, the file watcher
    ↓
core/        pure TypeScript, no editor dependency at all
```

**`src/core/` must never import `vscode`.** This is enforced by a lint rule, not by
convention, and it is the single most important constraint in the project. It is why the
test suite runs in well under a second with no extension host, and why the colour engine
could later back a command-line tool. If you find yourself wanting the editor API inside
`core/`, the logic belongs in `workspace/` or `features/` instead, or the data it needs
should be passed in as a plain argument.

## Adding a colour notation or a dialect

A new platform dialect is one file in `src/core/dialects/`, exporting:

- a set of regexes for the notations it detects,
- a parser turning a matched string into a `Color`,
- a predicate saying which files it applies to,

plus an entry in `registry.ts` and a case in `format.ts` if the notation can be written
as well as read. Nothing outside `src/core/dialects/` needs to change.

Two things to get right, because both have bitten this codebase already:

**Gate on the narrowest thing that is actually correct.** Android reads eight-digit hex
alpha-first, but an SVG is also XML and follows CSS, so the Android dialect is gated on
file path rather than language. Getting that wrong silently recolours files on every
rewrite. If your dialect's notation overlaps a CSS one with different meaning, gate it
precisely and add a test proving the neighbouring case still reads the other way.

**Say what a literal cannot tell you.** A bare `0xFF3B82F6` is a valid colour and an
equally valid bitmask. Where a notation is genuinely ambiguous, add a rule in
`confidence.ts` that lowers the score rather than guessing. Low-confidence matches are
shown to the user under "Needs review" and excluded from bulk edits, which is the honest
outcome.

## Tests

Tests live in `test/unit/` and run under Vitest with no extension host. `src/core/` is
tested directly. `src/workspace/` and `src/features/` import the editor API by design,
so their tests use the small stub in `test/stubs/vscode.ts`, aliased in by
`vitest.config.ts`. Extend that stub as needed rather than reaching for a real host.

What a good test looks like here:

- **Assert the property, not a magic number.** A round-trip assertion beats a hardcoded
  float, and several of the fixtures in this repository were wrong before being replaced
  with round-trips.
- **Every false positive found in the wild becomes a fixture.** The detection layer is
  regex-first, and `test/unit/scanText.test.ts` plus `dialectDetect.test.ts` are the
  regression net that makes that approach maintainable.
- **Prefer real content.** `remapIntegration.test.ts` and `dialectIntegration.test.ts`
  run the whole pipeline over the actual files in `examples/`, which catches things that
  purpose-built fixtures do not.

If you change detection or scoring, bump `CACHE_VERSION` in `src/workspace/cache.ts`.
Otherwise a cache written by an older build keeps serving matches scored under the old
rules, and your change appears to have no effect.

## Pull requests

1. Branch off `main`. Direct pushes to `main` are blocked.
2. Keep the change focused. A refactor plus a feature in one pull request is much harder
   to review than the two separately.
3. Add or update tests. A behaviour change with no test change will be questioned.
4. Update `CHANGELOG.md` under `## [Unreleased]` if the change is user-visible.
5. Run `npm run check` before pushing.
6. Fill in the pull request template. The "how did you verify this" section matters more
   than the description.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`, `build:`, `ci:`.

## Reporting things

Bugs and feature requests go in [Issues](https://github.com/henzyd/chromuta/issues). For
a detection bug, the most useful report is the exact literal, the file type it appeared
in, and what you expected instead. That maps directly onto a test fixture.

Security issues follow [SECURITY.md](SECURITY.md) instead, not the public tracker.
