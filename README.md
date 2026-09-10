# Chromuta

A VS Code extension that finds hard-coded color literals and converts them between
notations. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

**Phases 0, 1 and 2 are implemented.** What remains from the architecture is P3: color
notations beyond CSS, such as Flutter's `Color(0xFF…)` and Swift's `UIColor(…)`.

## What works today

**In the editor.** A swatch beside every detected color, conversion through the
built-in color picker, a hover showing every other notation, and refactor quick fixes
on the literal under the cursor: convert this one, convert every occurrence in this
file, or convert every occurrence in the workspace.

**Across the workspace.** `Chromuta: Scan Workspace for Colors` walks the repo and
fills the Chromuta view in the activity bar. Colors are listed most-used first, each
expanding to its individual occurrences, which are clickable. Low-confidence matches
are collected under a single "Needs review" node rather than mixed in.

**Palette swaps.** `Chromuta: Extract Palette Mapping from Workspace` writes a
`chromuta.mapping.json` listing every color it found, most-used first, each mapped to
itself. Change the `to` values and run `Chromuta: Apply Palette Mapping`. Validation
problems appear as squiggles on the offending value in the mapping file, and the
rewrite goes through VS Code's refactor preview.

Commands: `Convert Color Under Cursor`, `Convert All Colors in File`,
`Scan Workspace for Colors`, `Clear Color Index`,
`Extract Palette Mapping from Workspace`, `Apply Palette Mapping`,
`Open Palette Mapping File`.

Reads `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`,
`hwb()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `color()` in sRGB, linear sRGB,
display-p3 and XYZ, plus all 148 CSS named colors and `transparent`. Writes hex,
`rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()`, and keywords.

## Six behaviors worth knowing

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

**Mapping rules match perceptually, and exact always beats approximate.** `tolerance`
is a distance in OKLab, so a rule can catch the near-identical shades that creep into
a codebase. Widening it can never change what an exactly-specified rule does.

**An ambiguous match is reported, not guessed.** When a color falls inside the
tolerance of two different rules, Chromuta leaves it alone and tells you which rules
competed. Silently picking the marginally closer of two plausible rules is how a bulk
rewrite goes wrong in a way nobody notices for months.

## Development

```bash
npm install
npm test          # 226 unit tests, no extension host needed
npm run compile   # typecheck
npm run watch     # esbuild watch, then F5 to launch
```

The color engine under `src/core/` never imports `vscode`, which is why the tests run
in milliseconds and why the engine can later back a CLI. `src/workspace/` is the
editor-aware layer; its tests use a small `vscode` stub aliased in by vitest.

Open the `examples/` folder in the Extension Development Host, then run
`Chromuta: Scan Workspace for Colors`. `demo.css` covers the out-of-gamut warning and
the near-misses that are correctly ignored; `theme.scss` shares a color with it so the
palette has something to collapse across files. The folder also ships a
`chromuta.mapping.json`, so `Chromuta: Apply Palette Mapping` works there immediately;
one of its rules is matched only by tolerance, not exactly.

The remap pipeline has an end-to-end test that runs over those same example files, so
the scan, resolve, plan and rewrite steps are exercised together on content that was
not written to make a test pass.
