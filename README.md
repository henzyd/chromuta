# Chromuta

A VS Code extension that finds hard-coded color literals and converts them between
notations. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

**Phases 0 and 1 are implemented.** Palette remapping (P2) is designed but not built.

## What works today

**In the editor.** A swatch beside every detected color, conversion through the
built-in color picker, a hover showing every other notation, and refactor quick fixes
on the literal under the cursor: convert this one, convert every occurrence in this
file, or convert every occurrence in the workspace.

**Across the workspace.** `Chromuta: Scan Workspace for Colors` walks the repo and
fills the Chromuta view in the activity bar. Colors are listed most-used first, each
expanding to its individual occurrences, which are clickable. Low-confidence matches
are collected under a single "Needs review" node rather than mixed in.

Commands: `Convert Color Under Cursor`, `Convert All Colors in File`,
`Scan Workspace for Colors`, `Clear Color Index`.

Reads `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`,
`hwb()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `color()` in sRGB, linear sRGB,
display-p3 and XYZ, plus all 148 CSS named colors and `transparent`. Writes hex,
`rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()`, and keywords.

## Four behaviors worth knowing

**It matches the file's conventions.** Before writing, Chromuta reads the other color
literals in the same file and copies their hex casing, shorthand use, and function
syntax. A file full of `#FFF` keeps getting uppercase shorthand. Anything you set
explicitly in settings wins over what the file suggests.

**It scores every match rather than trusting the regex.** Revision hashes, URL
fragments, `#define` directives, JavaScript private fields, and CSS keywords that are
ordinary English words all score below the threshold and are left alone by bulk
conversion. `chromuta.confidenceThreshold` controls the cutoff.

**One color, however it is written, is one palette entry.** Grouping uses OKLab
coordinates, so `#FFF`, `#ffffff` and `rgb(255 255 255)` collapse into a single entry
with three occurrences instead of three separate rows.

**Cross-file conversion re-reads before it writes.** Index positions are only as fresh
as the last scan, so converting a color across the workspace re-scans every affected
file first and then routes the edit through VS Code's refactor preview, where you can
uncheck individual changes. Applying is one undo step.

## Development

```bash
npm install
npm test          # 149 unit tests, no extension host needed
npm run compile   # typecheck
npm run watch     # esbuild watch, then F5 to launch
```

The color engine under `src/core/` never imports `vscode`, which is why the tests run
in milliseconds and why the engine can later back a CLI. `src/workspace/` is the
editor-aware layer; its tests use a small `vscode` stub aliased in by vitest.

Open the `examples/` folder in the Extension Development Host, then run
`Chromuta: Scan Workspace for Colors`. `demo.css` covers the out-of-gamut warning and
the near-misses that are correctly ignored; `theme.scss` shares a color with it so the
palette has something to collapse across files.
