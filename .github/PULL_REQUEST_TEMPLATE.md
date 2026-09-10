## What this changes

<!-- One or two sentences. What is different after this is merged? -->

## Why

<!-- The problem being solved. Link the issue if there is one: Closes #123 -->

## How you verified it

<!-- The most important section. Reviewers cannot re-derive this.
     Say what you actually ran and observed, not what you expect to be true. -->

- [ ] `npm run check` passes locally
- [ ] Tried it in the Extension Development Host (<kbd>F5</kbd>), on:
      <!-- which files or which examples/ fixture? -->

<!-- If you could not verify part of it, say so plainly and why. That is far more
     useful than silence. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] New colour notation or platform dialect
- [ ] Performance
- [ ] Refactor with no behaviour change
- [ ] Documentation
- [ ] Build, CI, or tooling

## Checklist

- [ ] Tests added or updated for the behaviour that changed
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`, if this is user-visible
- [ ] `src/core/` still imports nothing from `vscode`
- [ ] Bumped `CACHE_VERSION` in `src/workspace/cache.ts`, if detection or scoring changed
- [ ] New settings documented in `package.json` with a description that says what
      happens, not just what the setting is called

## Notes for the reviewer

<!-- Anything you are unsure about, a tradeoff you made, a case you deliberately did
     not handle. Flagging these gets you a faster review, not a harsher one. -->
