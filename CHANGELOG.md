# Changelog

All notable changes to Chromuta are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-10

First release.

### Added

- **Color detection** across the workspace, with a confidence score on every match.
  Revision hashes, URL fragments, preprocessor directives, private class fields, and
  colour keywords used as identifiers are surfaced for review rather than rewritten.
- **CSS notations**: hex in 3, 4, 6 and 8 digits, `rgb()`, `rgba()`, `hsl()`, `hsla()`,
  `hwb()`, `oklch()`, `oklab()`, `lab()`, `lch()`, `color()` in sRGB, linear sRGB,
  display-p3 and XYZ, all 148 named colours, and `transparent`.
- **Platform dialects**: Flutter (`Color(0xFF…)`, `Color.fromARGB`, `Color.fromRGBO`),
  Swift and SwiftUI (`UIColor`, `NSColor`, `Color`), Android resource XML with
  alpha-first hex, and Tailwind arbitrary values with underscore-separated components.
- **Conversion** through the built-in colour picker, a hover conversion table, and
  refactor quick fixes for one literal, a whole file, or the whole workspace.
- **Workspace palette** view listing every colour by usage, with low-confidence matches
  grouped separately under "Needs review".
- **Palette mapping**: extract a `chromuta.mapping.json` from the workspace, edit the
  target colours, and apply it through the refactor preview. Rules match perceptually
  in OKLab, exact matches always beat approximate ones, and an ambiguous match is
  reported rather than guessed.
- Style inference so a rewrite matches the hex casing, shorthand use and function
  syntax already present in each file.

[Unreleased]: https://github.com/henzyd/chromuta/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/henzyd/chromuta/releases/tag/v0.1.0
