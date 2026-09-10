import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { colorDistance } from '../../src/core/color/distance.js';
import { parseColor } from '../../src/core/color/parse.js';
import { DEFAULT_FORMAT_OPTIONS } from '../../src/core/color/types.js';
import { scanText } from '../../src/core/detect/scanText.js';
import { applyStyleProfile, inferStyle } from '../../src/core/detect/style.js';
import { applyEditsToText, buildPlan, type PlanInput } from '../../src/core/remap/plan.js';
import { compileMapping } from '../../src/core/remap/resolve.js';
import { parseMapping } from '../../src/core/remap/schema.js';

/**
 * Runs the whole remap pipeline over the real files in examples/, so the pieces are
 * exercised together on content nobody wrote to make a test pass.
 */
const EXAMPLES = path.resolve(__dirname, '../../examples');

function loadExamples(): { inputs: PlanInput[]; texts: Map<string, string> } {
  const names = fs.readdirSync(EXAMPLES).filter((n) => /\.(css|scss)$/.test(n));
  const texts = new Map<string, string>();
  const inputs: PlanInput[] = [];

  for (const name of names) {
    const text = fs.readFileSync(path.join(EXAMPLES, name), 'utf8');
    texts.set(name, text);
    const matches = scanText(text, {
      languageId: name.endsWith('.scss') ? 'scss' : 'css',
      filePath: name
    });
    inputs.push({
      path: name,
      matches,
      formatOptions: applyStyleProfile(DEFAULT_FORMAT_OPTIONS, inferStyle(matches))
    });
  }

  return { inputs, texts };
}

function loadMapping() {
  const text = fs.readFileSync(path.join(EXAMPLES, 'chromuta.mapping.json'), 'utf8');
  const parsed = parseMapping(text);
  return { parsed, compiled: parsed.mapping ? compileMapping(parsed.mapping) : null };
}

describe('the bundled example mapping', () => {
  it('validates with no errors or warnings', () => {
    const { parsed } = loadMapping();
    expect(parsed.problems).toEqual([]);
    expect(parsed.mapping).not.toBeNull();
  });
});

describe('remapping the example files', () => {
  const { inputs, texts } = loadExamples();
  const { compiled } = loadMapping();
  const plan = buildPlan(inputs, compiled!, 0.5);

  it('plans changes in both example files', () => {
    expect(plan.files.map((f) => f.path)).toEqual(['demo.css', 'theme.scss']);
    expect(plan.editCount).toBeGreaterThan(5);
  });

  it('reports no ambiguities, since the demo rules do not compete', () => {
    expect(plan.ambiguities).toEqual([]);
  });

  it('leaves no rule unused', () => {
    expect(plan.unusedRules).toEqual([]);
  });

  it('rewrites the brand blue however it was written', () => {
    const before = texts.get('demo.css')!;
    const after = applyEditsToText(before, plan.files.find((f) => f.path === 'demo.css')!.edits);

    // demo.css writes the brand blue as #3B82F6 and #3b82f6.
    expect(before).toContain('#3B82F6');
    expect(before).toContain('#3b82f6');
    expect(after).not.toContain('#3b82f6');
    expect(after.toLowerCase()).not.toContain('#3b82f6');
    expect(after).toContain('#2563eb');
  });

  it('catches the oklch approximation of the brand blue via tolerance', () => {
    const approximate = plan.files
      .flatMap((f) => f.edits)
      .filter((edit) => !edit.exact);

    expect(approximate.length).toBeGreaterThan(0);
    // theme.scss writes oklch(0.623 0.214 259.8), a shade off from #3b82f6.
    const oklch = approximate.find((edit) => edit.from.startsWith('oklch('));
    expect(oklch).toBeDefined();
    expect(oklch!.to).toBe('#2563eb');
    expect(colorDistance(parseColor(oklch!.from)!, parseColor('#3b82f6')!)).toBeLessThan(0.02);
  });

  it('replaces a keyword with an explicit value', () => {
    const edit = plan.files.flatMap((f) => f.edits).find((e) => e.from === 'tomato');
    expect(edit?.to).toBe('#ef4444');
  });

  it('leaves colors no rule covers untouched', () => {
    const before = texts.get('demo.css')!;
    const after = applyEditsToText(before, plan.files.find((f) => f.path === 'demo.css')!.edits);
    // The out-of-gamut demo value is not in the mapping.
    expect(after).toContain('oklch(0.7 0.35 150)');
    expect(after).toContain('#1e40af');

    const scss = texts.get('theme.scss')!;
    const scssAfter = applyEditsToText(scss, plan.files.find((f) => f.path === 'theme.scss')!.edits);
    expect(scssAfter).toContain('hsl(215 20% 65%)');
  });

  it('never touches the near-misses that scored low', () => {
    const before = texts.get('demo.css')!;
    const after = applyEditsToText(before, plan.files.find((f) => f.path === 'demo.css')!.edits);
    expect(after).toContain('#1234567');
    expect(after).toContain('commit #a1b2c3');
    expect(after).toContain('i.png#abc123');
  });

  it('produces text that still parses to the intended colors', () => {
    for (const file of plan.files) {
      const after = applyEditsToText(texts.get(file.path)!, file.edits);
      // Re-scanning the result must find the replacements as real colors.
      const rescanned = scanText(after, { languageId: 'css', filePath: file.path });
      for (const edit of file.edits) {
        expect(rescanned.some((m) => m.text === edit.to)).toBe(true);
      }
    }
  });

  it('is idempotent: applying the mapping twice changes nothing the second time', () => {
    for (const file of plan.files) {
      const once = applyEditsToText(texts.get(file.path)!, file.edits);
      const matches = scanText(once, { languageId: 'css', filePath: file.path });
      const second = buildPlan(
        [{ path: file.path, matches, formatOptions: applyStyleProfile(DEFAULT_FORMAT_OPTIONS, inferStyle(matches)) }],
        compiled!,
        0.5
      );
      expect(second.editCount).toBe(0);
    }
  });
});
