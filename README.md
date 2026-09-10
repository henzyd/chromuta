# Chromuta

[![CI](https://github.com/henzyd/chromuta/actions/workflows/ci.yml/badge.svg)](https://github.com/henzyd/chromuta/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A VS Code extension that finds hard-coded color literals and converts them between
notations. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

All four phases of [the architecture](ARCHITECTURE.md) are implemented.

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

## What it reads

**CSS**: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`,
`hwb()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `color()` in sRGB, linear sRGB,
display-p3 and XYZ, all 148 named colors, and `transparent`.

**Platform dialects**, all on by default and controlled by `chromuta.dialects`. Each
applies only to files of its own languages, so leaving them on costs nothing in a
project that uses none of them.

| Dialect    | Reads                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `flutter`  | `Color(0xFF3B82F6)`, `Color.fromARGB(…)`, `Color.fromRGBO(…)`, bare `0x…` integers               |
| `swift`    | `UIColor(red:…)`, `NSColor(red:…)`, SwiftUI `Color(red:…)`, `UIColor(white:…)`, `UIColor(hue:…)` |
| `android`  | Alpha-first `#AARRGGBB` and `#ARGB` in resource files, plus `0x…` in Kotlin and Java             |
| `tailwind` | Underscore-separated values inside arbitrary-value brackets, e.g. `text-[rgb(0_0_0)]`            |

A conversion stays in the idiom of the file it is in. Converting a Flutter
`Color(0xFF3B82F6)` offers the other Flutter forms first, and a palette mapping applied
across a mixed repository rewrites Dart colors as Dart, Swift as Swift and CSS as CSS.

Two things are deliberately not supported, because both need information the literal
does not contain. `Colors.blue.shade500` and `@color/brand` are references into a
palette or a resource file rather than colors, and resolving them means resolving
something else first.

## Behaviors worth knowing

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

**Alpha-first hex is decided by path, not by language.** `#FF3B82F6` is opaque in an
Android resource file and 96%-opaque pink-grey in CSS, and an SVG is XML but follows
CSS. So the Android reading applies only inside a `res/values` directory or a file
named `colors.xml`, `themes.xml` or similar. Guessing from the language alone would
silently recolor every SVG in a repository.

**A bare `0x…` integer has to earn its confidence.** `0xFF3B82F6` is a valid ARGB color
and an equally valid bitmask, and nothing in the literal distinguishes them. These count
as colors only when something nearby, such as `brandColor` or `surfaceTint`, vouches for
them. Everything else goes to "Needs review".

## Development

```bash
npm install
npm run check     # format, lint, types, 329 tests, build, and a bundle smoke test
npm run watch     # esbuild watch, then F5 to launch
```

The colour engine under `src/core/` never imports `vscode`, which is why the tests run
in milliseconds and why the engine could later back a command-line tool. That boundary
is enforced by a lint rule. `src/workspace/` is the editor-aware layer, and its tests use
a small `vscode` stub aliased in by vitest.

Adding a dialect means one file under `src/core/dialects/`: a set of regexes, a parser, a
formatter, and a predicate saying which files it applies to. Nothing else changes.

Open the `examples/` folder in the Extension Development Host, then run
`Chromuta: Scan Workspace for Colors`. It holds one file per dialect, including a
`logo.svg` and an Android `colors.xml` carrying the same eight-digit hex so the two
readings sit side by side, plus deliberate near-misses that should be ignored. Two
end-to-end tests run the whole pipeline over those same files.

To try the real packaged artefact rather than the development host:

```bash
npm run package && code --install-extension chromuta.vsix
```

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, how the
codebase is arranged, what a good test looks like here, and the two mistakes that have
already bitten this project when adding a dialect.

Bugs and ideas belong in [Issues](https://github.com/henzyd/chromuta/issues). Security
problems go through [SECURITY.md](SECURITY.md) instead, never the public tracker. Taking
part means agreeing to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
