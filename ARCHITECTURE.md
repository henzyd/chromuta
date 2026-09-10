# Chromuta — Architecture

A VS Code extension that finds hard-coded color literals across a workspace and rewrites them:
either into a different notation (hex ↔ rgb ↔ hsl ↔ oklch) or onto a different palette
(bulk theme swap driven by a mapping file).

---

## 1. Guiding constraints

These four decisions shape everything below.

1. **The color engine never imports `vscode`.** Everything under `src/core/` is plain TypeScript
   with no editor dependency. It is unit-testable in milliseconds without an extension host, and it
   is the piece most likely to be reused later by a CLI or a JetBrains port.
2. **Detection is regex-first with confidence scoring, not AST parsing.** Every match carries a
   confidence value derived from surrounding context. Low-confidence matches are surfaced for review
   rather than silently rewritten. The detector is behind an interface so a real parser can be
   dropped in per language later without disturbing anything else.
3. **Every rewrite goes through a single `WorkspaceEdit`.** This buys atomic multi-file application,
   one undo step, and VS Code's native refactor-preview panel for free.
4. **Authoring style is preserved, not normalized.** Rewriting `#FFF` must not silently produce
   `rgb(255, 255, 255)` in a file that uses modern space-separated syntax everywhere else. Output
   formatting is a first-class concern, described in §5.

---

## 2. Layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  features/          VS Code surfaces                        │
│  documentColor · codeActions · hover · commands · treeView  │
└──────────────────────────┬──────────────────────────────────┘
                           │ reads
┌──────────────────────────▼──────────────────────────────────┐
│  workspace/         vscode-aware orchestration              │
│  scanner · ColorIndex · fileWatcher · editApplier           │
└──────────────────────────┬──────────────────────────────────┘
                           │ calls (one direction only)
┌──────────────────────────▼──────────────────────────────────┐
│  core/              pure TypeScript, zero vscode imports    │
│  color/  ·  detect/  ·  remap/                              │
└─────────────────────────────────────────────────────────────┘
```

The dependency arrow only ever points down. `core/` has no idea an editor exists.

---

## 3. Directory layout

```
src/
  extension.ts              activate() wiring, disposable registration
  config.ts                 typed accessor over workspace settings
  logging.ts                output channel + telemetry-free diagnostics

  core/
    color/
      types.ts              Color, ColorNotation, FormatOptions
      spaces.ts             srgb ⇄ linear-srgb ⇄ xyz-d65 ⇄ oklab ⇄ oklch, hsl
      parse.ts              string → Color | null
      format.ts             Color + FormatOptions → string
      named.ts              CSS named-color table (both directions)
      distance.ts           ΔE-OK perceptual distance
      gamut.ts              in-gamut test + chroma-reduction clamp

    detect/
      patterns.ts           one regex per notation, all /g /d flagged
      dialects.ts           css | tailwind | flutter | swift | android rule sets
      scanText.ts           text → RawMatch[]  (the hot loop)
      confidence.ts         false-positive heuristics → 0..1 score
      types.ts              RawMatch, ColorMatch, MatchProvider interface

    remap/
      schema.ts             mapping file shape + validation
      resolve.ts            ColorMatch + Mapping → Replacement | null
      plan.ts               ChangePlan: file → ordered, non-overlapping edits

  workspace/
    scanner.ts              findFiles → read → scanText, batched + cancellable
    index.ts                ColorIndex: by-file and by-normalized-color views
    watcher.ts              FileSystemWatcher + document-change invalidation
    apply.ts                ChangePlan → WorkspaceEdit → applyEdit

  features/
    documentColor.ts        DocumentColorProvider (swatches + presentations)
    codeActions.ts          CodeActionProvider (quick-fix conversions)
    hover.ts                HoverProvider (preview + all notations)
    paletteTree.ts          TreeDataProvider for the Chromuta view container
    commands/
      convertSelection.ts
      convertDocument.ts
      scanWorkspace.ts
      applyRemap.ts
      extractMapping.ts     scan results → starter mapping file

test/
  unit/                     core/ only — vitest, no extension host
  fixtures/                 golden files: source snippet → expected matches
  integration/              @vscode/test-electron against a fixture workspace
```

---

## 4. The color model

```ts
interface Color {
  /** Canonical coordinates. OKLab is the working space so that
   *  wide-gamut input round-trips and perceptual distance is cheap. */
  ok: { L: number; a: number; b: number };
  alpha: number; // 0..1
  /** How it was written in source, for lossless identity rewrites. */
  source?: { notation: ColorNotation; raw: string };
}
```

**Why OKLab as the canonical space.** Storing sRGB triples would clip any `oklch()` or
`color(display-p3 …)` literal on parse, corrupting values the user never asked to change. OKLab
holds them losslessly and makes `distance.ts` a plain Euclidean metric, which the palette-remap
nearest-match step needs anyway.

**Gamut handling.** Converting an out-of-sRGB color _into_ hex is lossy by definition.
`gamut.ts` clamps by reducing chroma at constant lightness and hue, and the conversion command
warns rather than silently mangling. Same-notation edits skip the round-trip entirely by using
`source.raw`.

---

## 5. Output formatting

The most common reason a tool like this gets uninstalled is that it reformats code in ways the
project does not use. `FormatOptions` is therefore explicit:

| Option            | Values                                                       | Default  |
| ----------------- | ------------------------------------------------------------ | -------- |
| `hexCase`         | `lower` \| `upper`                                           | `lower`  |
| `shorthandHex`    | collapse `#ffffff` → `#fff` when exact                       | `true`   |
| `functionSyntax`  | `modern` (`rgb(0 0 0 / 50%)`) \| `legacy` (`rgba(0,0,0,.5)`) | `modern` |
| `alphaStyle`      | `percent` \| `number`                                        | `number` |
| `precision`       | decimal places for float channels                            | `3`      |
| `spaceAfterComma` | legacy syntax only                                           | `true`   |

**Style inference.** Before formatting, `format.ts` is handed a `StyleProfile` derived from the
other color literals already in that file. If a file has 40 uppercase hex values, a new hex value is
written uppercase regardless of the global default. Explicit user settings override inference;
inference overrides defaults.

---

## 6. Detection

`scanText.ts` runs a union of anchored regexes over each file, emitting `RawMatch { start, end, notation, text }`.

**Notations covered at v1:** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`,
`hsl()`/`hsla()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `color(<space> …)`, CSS named colors.

**Dialects** extend the pattern set per file type:

- **tailwind** — arbitrary values, `bg-[#3b82f6]`, `text-[rgb(0_0_0)]`
- **flutter/dart** — `Color(0xFF3B82F6)`, `Colors.blue.shade500`
- **android** — `0xFFRRGGBB`, `@color/name` references, `colors.xml`
- **swift** — `UIColor(red:green:blue:alpha:)`, `Color(red:…)`

### Confidence scoring

Regex alone produces real false positives. `confidence.ts` starts each match at `1.0` and subtracts:

| Signal                                                  | Penalty | Rationale                                       |
| ------------------------------------------------------- | ------- | ----------------------------------------------- |
| Bare 6-hex-char run inside a URL or `href`              | −0.9    | anchor fragment, not a color                    |
| Preceded by `commit`, `sha`, `revision` within 20 chars | −0.9    | git hash                                        |
| Line begins with `#include` / `#define` / `#if`         | −1.0    | C preprocessor                                  |
| Named color outside a CSS-family file                   | −0.6    | `red` is an identifier everywhere               |
| Named color not in a property-value position            | −0.4    | needs `:` or `=` to its left                    |
| Inside a line/block comment                             | −0.2    | usually still a real color, just lower priority |
| Inside a test fixture or snapshot path                  | −0.3    | rewriting these breaks tests                    |

Matches below `chromuta.confidenceThreshold` (default `0.5`) are indexed but excluded from bulk
operations, and shown in a separate **Needs review** group in the tree view. This keeps the
regex-first choice honest: uncertainty is surfaced rather than hidden.

---

## 7. Scanning and indexing

**Discovery.** `vscode.workspace.findFiles(include, exclude, max, token)` with `include` from
`chromuta.include` and `exclude` composed from `chromuta.exclude` plus the user's `files.exclude`
and `search.exclude`. Passing `undefined` for `exclude` inherits those defaults, which is what we
want; `.gitignore` respect rides on the same setting the built-in search uses.

**Execution.** Files are read via `workspace.fs.readFile` in batches of ~50 with an `await` yield
between batches so the extension host stays responsive. The whole scan runs inside
`window.withProgress({ location: Notification, cancellable: true })` and honors the cancellation
token at every batch boundary.

**Caching.** A `Map<fsPath, { mtime, size, matches }>` persisted to `context.workspaceState`.
A file is rescanned only when mtime or size differs. Cold scan on a large repo is a one-time cost;
subsequent activations are near-instant.

**Incremental invalidation.**

- `onDidChangeTextDocument` → debounce 300 ms → rescan that single document only.
- `FileSystemWatcher` on the include glob → handle creates, deletes, and external edits.

**The index** exposes two views over the same data:

```ts
class ColorIndex {
  byFile(uri: Uri): ColorMatch[];
  byColor(): Map<string /* normalized key */, ColorMatch[]>; // powers the palette view
}
```

The normalized key is the OKLab triple rounded to 4 decimals plus alpha, so `#FFF`, `#ffffff`,
and `rgb(255 255 255)` collapse into one palette entry with three occurrences.

---

## 8. Feature surfaces

**`DocumentColorProvider` — the highest-leverage integration.** Implementing
`provideDocumentColors` puts a native swatch beside every detected literal. Implementing
`provideColorPresentations` means that when the user opens the swatch picker, VS Code lists the
alternative notations _we_ supply, and picking one applies the edit. Single-color conversion is
therefore mostly free, using the editor's own UI rather than a bespoke one.

**`CodeActionProvider`** — quick fixes on the literal under the cursor: convert to each enabled
notation, convert every occurrence of this color in the file, convert every occurrence in the
workspace, and (when a mapping is loaded) apply the mapped replacement.

**`HoverProvider`** — a swatch plus the same color rendered in every enabled notation, so the hover
doubles as a reference table.

**Palette tree view** — a dedicated view container. Root groups by normalized color, sorted by
occurrence count, each node showing a swatch, the canonical value, and the count. Children are the
individual occurrences, clickable to reveal the range. A second root group holds **Needs review**.

**Commands** — `chromuta.convertSelection`, `.convertDocument`, `.scanWorkspace`,
`.applyRemap`, `.extractMapping`.

---

## 9. Palette remap

The bulk theme-swap path. Driven by a workspace file, `chromuta.mapping.json` by default.

```jsonc
{
  "version": 1,
  "defaultNotation": "oklch",
  "tolerance": 0.02, // ΔE-OK; 0 means exact match only
  "rules": [
    { "from": "#3b82f6", "to": "#2563eb" },
    { "from": "#ef4444", "to": "oklch(0.63 0.24 25)" },
    { "from": "rgb(17 24 39)", "to": "#0f172a", "tolerance": 0 }
  ],
  "exclude": ["**/*.test.*", "**/__snapshots__/**"]
}
```

**Pipeline.**

1. **Load & validate** — `schema.ts` validates and reports errors as diagnostics on the mapping
   file itself, so mistakes are visible where they were made.
2. **Resolve** — for each indexed match above the confidence threshold, `resolve.ts` finds the
   nearest rule within `tolerance` using ΔE-OK. Exact matches always win over near matches. A match
   resolving to two rules within tolerance is an ambiguity, reported rather than guessed.
3. **Plan** — `plan.ts` builds a `ChangePlan`: per file, a list of edits sorted descending by
   offset so applying them never invalidates later ranges. Overlapping edits are impossible by
   construction because matches never overlap.
4. **Preview** — the plan becomes a `WorkspaceEdit` where each entry carries
   `WorkspaceEditEntryMetadata { needsConfirmation: true, label, description }`. VS Code then renders
   its built-in refactor preview panel with a checkbox per edit. The user unchecks anything they
   dislike before committing.
5. **Apply** — one `workspace.applyEdit` call. Atomic, and a single Ctrl-Z reverses the whole thing.

**Bootstrapping a mapping.** `chromuta.extractMapping` writes a mapping file pre-populated from the
current index, with every distinct workspace color as a `from` and an empty `to`. Turning "swap our
palette" into "fill in this list" is the difference between a feature people use and one they don't.

---

## 10. Configuration

```jsonc
"chromuta.include": "**/*.{css,scss,less,html,js,jsx,ts,tsx,vue,svelte,dart,swift,xml}",
"chromuta.exclude": ["**/node_modules/**", "**/dist/**", "**/*.min.*"],
"chromuta.dialects": ["css", "tailwind"],
"chromuta.defaultNotation": "hex",
"chromuta.confidenceThreshold": 0.5,
"chromuta.namedColors.enabled": true,
"chromuta.mappingFile": "chromuta.mapping.json",
"chromuta.format": { "hexCase": "lower", "shorthandHex": true, "functionSyntax": "modern", "precision": 3 },
"chromuta.inferStyleFromFile": true
```

---

## 11. Testing

- **`core/` unit tests (vitest)** carry the weight. Table-driven parse/format cases, and a
  round-trip property test asserting `parse(format(c)) ≈ c` within epsilon across random colors.
- **Detection golden files** in `test/fixtures/`: a source snippet paired with the exact expected
  match list. Every false positive found in the wild becomes a new fixture. This is the regression
  net that makes the regex-first approach maintainable.
- **Remap plan tests** assert edit ordering and non-overlap without touching the filesystem.
- **Integration tests** (`@vscode/test-electron`) cover only the wiring: providers registered,
  commands present, `applyEdit` reaching disk on a fixture workspace.

---

## 12. Build and activation

- **TypeScript → esbuild** single-bundle output; esbuild watch for the dev loop.
- **Activation must stay lazy.** Activate on `onLanguage:css`, the other configured languages, and
  on each command. Avoid `onStartupFinished`, and never scan the workspace during `activate()` —
  the first scan is triggered by the user opening the palette view or running a command.
- Extension host only (Node). No web-extension target at v1, since the scanner assumes `workspace.fs`
  performance characteristics that differ in the browser.

---

## 13. Delivery phases

| Phase  | Contents                                                                                                                | Ships as                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **P0** | `core/color`, `core/detect` for CSS notations, `DocumentColorProvider`, convert-selection and convert-document commands | Usable extension: swatches and single/file conversion |
| **P1** | `workspace/scanner` + `ColorIndex` + caching, palette tree view, hover, code actions                                    | The "find hard-coded colors" feature lands            |
| **P2** | `core/remap`, mapping schema, extract-mapping, preview + apply                                                          | Theme swap lands                                      |
| **P3** | Non-CSS dialects, confidence tuning from real repos, perf on very large workspaces                                      | Breadth                                               |

P0 is independently shippable and validates the color engine against real files before any of the
workspace machinery exists.

---

## 14. Known risks

- **Named-color false positives** are the sharpest edge. `red`, `tan`, `plum`, and `salmon` are all
  CSS colors and all plausible identifiers. Mitigation: named-color detection is gated to
  CSS-family files in a property-value position by default, and is separately toggleable.
- **Out-of-gamut conversion is lossy** and will surprise anyone converting `oklch()` to hex.
  Mitigation: warn on clamp, and never round-trip when the notation is unchanged.
- **Cold-scan cost on monorepos.** Mitigation: batching, cancellation, mtime cache, and never
  scanning during activation.
- **Rewriting test fixtures and snapshots** silently breaks suites. Mitigation: default excludes
  plus a confidence penalty, both visible in settings.
