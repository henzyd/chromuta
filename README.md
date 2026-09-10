# Chromuta

A VS Code extension that finds hard-coded color literals and converts them between
notations. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

**Phase 0 is implemented.** Workspace-wide scanning (P1) and palette remapping (P2)
are designed but not built.

## What works today

- Swatches beside every detected color, via the editor's own color provider.
- Conversion through the built-in color picker, which lists your enabled notations.
- `Chromuta: Convert Color Under Cursor` for one literal or a selection.
- `Chromuta: Convert All Colors in File` for a whole document.

Reads `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`,
`hwb()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `color()` in sRGB, linear sRGB,
display-p3 and XYZ, plus all 148 CSS named colors and `transparent`.

Writes hex, `rgb()`, `hsl()`, `oklch()`, `oklab()`, `lab()`, `lch()`, and keywords.

## Two behaviors worth knowing

**It matches the file's conventions.** Before writing, Chromuta reads the other color
literals in the same file and copies their hex casing, shorthand use, and function
syntax. A file full of `#FFF` keeps getting uppercase shorthand. Anything you set
explicitly in settings wins over what the file suggests.

**It scores every match rather than trusting the regex.** Git hashes, URL fragments,
`#define` directives, JavaScript private fields, and CSS keywords that are ordinary
English words all score below the threshold and are left alone by bulk conversion.
`chromuta.confidenceThreshold` controls the cutoff.

## Development

```bash
npm install
npm test          # 114 unit tests, no extension host needed
npm run compile   # typecheck
npm run watch     # esbuild watch, then F5 to launch
```

The color engine under `src/core/` never imports `vscode`, which is why the tests run
in milliseconds and why the engine can later back a CLI.

Open `examples/demo.css` in the Extension Development Host to see the behavior,
including the out-of-gamut warning and the near-misses that are correctly ignored.
