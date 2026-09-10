import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { formatColor } from '../../src/core/color/format.js';
import { DEFAULT_FORMAT_OPTIONS } from '../../src/core/color/types.js';
import { scanText } from '../../src/core/detect/scanText.js';
import { applyStyleProfile, inferStyle } from '../../src/core/detect/style.js';
import type { DialectId } from '../../src/core/dialects/types.js';
import { applyEditsToText, buildPlan, type PlanInput } from '../../src/core/remap/plan.js';
import { compileMapping } from '../../src/core/remap/resolve.js';
import { parseMapping } from '../../src/core/remap/schema.js';
import { languageIdForPath } from '../../src/workspace/languages.js';

/**
 * Runs the pipeline over the real dialect examples, so a cross-platform palette swap
 * is exercised on files in five different idioms.
 */
const EXAMPLES = path.resolve(__dirname, '../../examples');
const ALL: readonly DialectId[] = ['css', 'tailwind', 'flutter', 'android', 'swift'];

const FILES = [
  'demo.css',
  'theme.scss',
  'theme.dart',
  'Theme.swift',
  'logo.svg',
  'tailwind.html',
  path.join('res', 'values', 'colors.xml')
];

function loadInputs(): { inputs: PlanInput[]; texts: Map<string, string> } {
  const texts = new Map<string, string>();
  const inputs: PlanInput[] = [];

  for (const name of FILES) {
    const text = fs.readFileSync(path.join(EXAMPLES, name), 'utf8');
    texts.set(name, text);
    const matches = scanText(text, {
      languageId: languageIdForPath(name),
      filePath: name,
      dialects: ALL
    });
    inputs.push({
      path: name,
      matches,
      formatOptions: applyStyleProfile(DEFAULT_FORMAT_OPTIONS, inferStyle(matches))
    });
  }

  return { inputs, texts };
}

const mapping = compileMapping(
  parseMapping(fs.readFileSync(path.join(EXAMPLES, 'chromuta.mapping.json'), 'utf8')).mapping!
);

const { inputs, texts } = loadInputs();
const plan = buildPlan(inputs, mapping, 0.5);

const rewritten = (name: string): string => {
  const file = plan.files.find((f) => f.path === name);
  return file ? applyEditsToText(texts.get(name)!, file.edits) : texts.get(name)!;
};

describe('detection across the example dialects', () => {
  it('finds the brand blue in every idiom', () => {
    const found = new Map<string, string[]>();
    for (const input of inputs) {
      found.set(
        input.path,
        input.matches
          .filter((m) => m.confidence >= 0.5)
          .filter(
            (m) =>
              formatColor({ ...m.color, alpha: 1 }, 'hex', DEFAULT_FORMAT_OPTIONS) === '#3b82f6'
          )
          .map((m) => m.notation)
      );
    }

    expect(found.get('theme.dart')).toEqual(
      expect.arrayContaining(['dart-color', 'dart-argb', 'dart-rgbo'])
    );
    expect(found.get('Theme.swift')).toEqual(
      expect.arrayContaining(['swift-uicolor', 'swift-nscolor', 'swift-color'])
    );
    expect(found.get(path.join('res', 'values', 'colors.xml'))).toEqual(
      expect.arrayContaining(['android-hex'])
    );
    expect(found.get('tailwind.html')).toEqual(expect.arrayContaining(['hex']));
  });

  it('reads Android eight-digit hex as opaque, unlike the identical SVG value', () => {
    const androidPath = path.join('res', 'values', 'colors.xml');
    const android = inputs.find((i) => i.path === androidPath)!;
    const svg = inputs.find((i) => i.path === 'logo.svg')!;

    const brandInXml = android.matches.find((m) => m.text === '#FF3B82F6')!;
    const brandInSvg = svg.matches.find((m) => m.text === '#FF3B82F6')!;

    expect(brandInXml.color.alpha).toBe(1);
    expect(brandInSvg.color.alpha).toBeLessThan(1);
    expect(brandInXml.notation).toBe('android-hex');
    expect(brandInSvg.notation).toBe('hex');
  });

  it('demotes the bare integer that has nothing to vouch for it', () => {
    const dart = inputs.find((i) => i.path === 'theme.dart')!;
    const mask = dart.matches.find((m) => m.text === '0xFF00FF00')!;
    const tint = dart.matches.find((m) => m.text === '0xFF0F172A')!;

    expect(mask.confidence).toBeLessThan(0.5);
    expect(tint.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('ignores an initializer that names an asset', () => {
    const swift = inputs.find((i) => i.path === 'Theme.swift')!;
    expect(swift.matches.some((m) => m.text.includes('named:'))).toBe(false);
  });
});

describe('a palette swap keeps every file in its own idiom', () => {
  it('rewrites Dart colors as Dart colors', () => {
    const after = rewritten('theme.dart');
    expect(after).toContain('Color(0xFF2563EB)');
    expect(after).toContain('Color.fromARGB(255, 37, 99, 235)');
    expect(after).toContain('Color.fromRGBO(37, 99, 235, 1)');
    // Nothing CSS-shaped may appear in a Dart file.
    expect(after).not.toContain('#2563eb');
  });

  it('rewrites Swift colors as Swift colors, keeping each initializer type', () => {
    const after = rewritten('Theme.swift');
    expect(after).toContain('UIColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1)');
    expect(after).toContain('NSColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1)');
    expect(after).toContain('Color(red: 0.145, green: 0.388, blue: 0.922)');
    expect(after).not.toContain('#2563eb');
  });

  it('rewrites Android hex alpha-first, keeping the file uppercase casing', () => {
    const after = rewritten(path.join('res', 'values', 'colors.xml'));
    expect(after).toContain('#FF2563EB');
    expect(after).toContain('#FFF8FAFC');
  });

  it('leaves the half-transparent scrim alone, since alpha is part of a color identity', () => {
    // #803B82F6 is the brand blue at 50% alpha. The rule names the opaque color, so
    // these are different colors and the rule correctly does not reach it.
    const after = rewritten(path.join('res', 'values', 'colors.xml'));
    expect(after).toContain('#803B82F6');
  });

  it('writes six-digit hex as plain CSS hex, which means the same in both', () => {
    const after = rewritten(path.join('res', 'values', 'colors.xml'));
    expect(after).toContain('#111827');
  });

  it('writes Tailwind values with no spaces in them', () => {
    const after = rewritten('tailwind.html');
    for (const cls of after.match(/class="[^"]*"/g) ?? []) {
      expect(cls).not.toMatch(/\[[^\]]* [^\]]*\]/);
    }
    expect(after).toContain('bg-[#2563eb]');
  });

  it('rewrites CSS files as CSS, following each file own hex casing', () => {
    expect(rewritten('demo.css')).toContain('#2563eb');
    // theme.scss is mostly lowercase, so inference keeps it lowercase even though it
    // contains one uppercase literal.
    expect(rewritten('theme.scss')).toContain('#2563eb');
  });

  it('leaves the SVG eight-digit value alone, since no rule covers that color', () => {
    const after = rewritten('logo.svg');
    expect(after).toContain('#FF3B82F6');
    // The plain brand blue in the same file is still rewritten.
    expect(after).toContain('#2563eb');
  });

  it('produces text that re-scans to the colors it wrote', () => {
    for (const file of plan.files) {
      const after = applyEditsToText(texts.get(file.path)!, file.edits);
      const rescan = scanText(after, {
        languageId: languageIdForPath(file.path),
        filePath: file.path,
        dialects: ALL
      });
      for (const edit of file.edits) {
        expect(rescan.some((m) => m.text === edit.to), `${file.path}: ${edit.to}`).toBe(true);
      }
    }
  });

  it('is idempotent across every dialect', () => {
    for (const file of plan.files) {
      const once = applyEditsToText(texts.get(file.path)!, file.edits);
      const matches = scanText(once, {
        languageId: languageIdForPath(file.path),
        filePath: file.path,
        dialects: ALL
      });
      const second = buildPlan(
        [{
          path: file.path,
          matches,
          formatOptions: applyStyleProfile(DEFAULT_FORMAT_OPTIONS, inferStyle(matches))
        }],
        mapping,
        0.5
      );
      expect(second.editCount, `${file.path} changed again on a second pass`).toBe(0);
    }
  });
});
