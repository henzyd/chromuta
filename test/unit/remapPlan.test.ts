import { describe, expect, it } from 'vitest';
import { formatColor } from '../../src/core/color/format.js';
import { parseColor } from '../../src/core/color/parse.js';
import { DEFAULT_FORMAT_OPTIONS } from '../../src/core/color/types.js';
import { scanText } from '../../src/core/detect/scanText.js';
import { applyStyleProfile, inferStyle } from '../../src/core/detect/style.js';
import {
  applyEditsToText,
  buildPlan,
  describePlan,
  type PlanInput
} from '../../src/core/remap/plan.js';
import { compileMapping } from '../../src/core/remap/resolve.js';
import { parseMapping } from '../../src/core/remap/schema.js';

function compile(json: string) {
  const { mapping, problems } = parseMapping(json);
  const fatal = problems.filter((p) => p.severity === 'error');
  if (!mapping || fatal.length > 0) throw new Error(`bad fixture: ${JSON.stringify(fatal)}`);
  return compileMapping(mapping);
}

function input(path: string, text: string, options = DEFAULT_FORMAT_OPTIONS): PlanInput {
  const matches = scanText(text, { languageId: 'css', filePath: path });
  return { path, matches, formatOptions: options };
}

/** Plan a single file and return the rewritten text, which is what actually matters. */
function rewrite(text: string, json: string, path = 'a.css'): string {
  const plan = buildPlan([input(path, text)], compile(json), 0.5);
  const file = plan.files.find((f) => f.path === path);
  return file ? applyEditsToText(text, file.edits) : text;
}

describe('rewriting text', () => {
  it('replaces an exact match', () => {
    expect(
      rewrite('a { color: #3b82f6; }', '{"version":1,"rules":[{"from":"#3b82f6","to":"#2563eb"}]}')
    ).toBe('a { color: #2563eb; }');
  });

  it('replaces the same color however it was written', () => {
    const json = '{"version":1,"rules":[{"from":"#3b82f6","to":"#2563eb"}]}';
    const text = 'a{color:#3B82F6}b{color:rgb(59 130 246)}c{color:#3b82f6}';
    expect(rewrite(text, json)).toBe('a{color:#2563eb}b{color:#2563eb}c{color:#2563eb}');
  });

  it('rewrites several colors in one pass without disturbing offsets', () => {
    const json = `{"version":1,"rules":[
      {"from":"#fff","to":"#f8fafc"},
      {"from":"#000","to":"#0f172a"},
      {"from":"tomato","to":"#ef4444"}]}`;
    const text = '.a{color:#fff;background:#000;border-color:tomato}';
    expect(rewrite(text, json)).toBe('.a{color:#f8fafc;background:#0f172a;border-color:#ef4444}');
  });

  it('handles a replacement longer than the original', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"oklch(1 0 0)"}]}';
    expect(rewrite('a{color:#fff;background:#fff}', json)).toBe(
      'a{color:oklch(1 0 0);background:oklch(1 0 0)}'
    );
  });

  it('handles a replacement shorter than the original', () => {
    const json = '{"version":1,"rules":[{"from":"rgb(255 255 255)","to":"#fff"}]}';
    expect(rewrite('a{color:rgb(255 255 255);border-color:rgb(255 255 255)}', json)).toBe(
      'a{color:#fff;border-color:#fff}'
    );
  });

  it('leaves unmapped colors alone', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#000"}]}';
    expect(rewrite('a{color:#fff;background:#123456}', json)).toBe(
      'a{color:#000;background:#123456}'
    );
  });

  it('writes the replacement in the notation the mapping asks for', () => {
    const json = `{"version":1,"defaultNotation":"hsl","rules":[
      {"from":"#3b82f6","to":"#2563eb"}]}`;
    const result = rewrite('a{color:#3b82f6}', json);
    // Assert the notation and that the value still is #2563eb, rather than pinning an
    // exact float that depends on the rounding precision.
    expect(result).toMatch(/^a\{color:hsl\([\d.]+ [\d.]+% [\d.]+%\)\}$/);
    const written = result.slice('a{color:'.length, -1);
    expect(formatColor(parseColor(written)!, 'hex', DEFAULT_FORMAT_OPTIONS)).toBe('#2563eb');
  });

  it('matches the file existing hex casing rather than the global default', () => {
    const json = '{"version":1,"rules":[{"from":"#3b82f6","to":"#2563eb"}]}';
    const text = 'a{color:#3B82F6;background:#AABBCC;border-color:#DDEEFF}';
    const matches = scanText(text, { languageId: 'css' });
    const options = applyStyleProfile(DEFAULT_FORMAT_OPTIONS, inferStyle(matches));
    const plan = buildPlan(
      [{ path: 'a.css', matches, formatOptions: options }],
      compile(json),
      0.5
    );
    expect(applyEditsToText(text, plan.files[0]!.edits)).toContain('#2563EB');
  });
});

describe('plan accounting', () => {
  it('counts edits and files', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#000"}]}';
    const plan = buildPlan(
      [input('a.css', 'a{color:#fff;background:#fff}'), input('b.css', 'b{color:#fff}')],
      compile(json),
      0.5
    );
    expect(plan.editCount).toBe(3);
    expect(plan.fileCount).toBe(2);
  });

  it('orders files by path and edits by position', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#000"}]}';
    const plan = buildPlan(
      [input('z.css', 'a{color:#fff}'), input('a.css', 'x{color:#fff}y{color:#fff}')],
      compile(json),
      0.5
    );
    expect(plan.files.map((f) => f.path)).toEqual(['a.css', 'z.css']);
    const edits = plan.files[0]!.edits;
    expect(edits[0]!.match.start).toBeLessThan(edits[1]!.match.start);
  });

  it('skips low-confidence matches and says how many', () => {
    const json = '{"version":1,"rules":[{"from":"#ddeeff","to":"#000"}]}';
    // #def inside #define is the same color as #ddeeff, but scores zero.
    const matches = scanText('#define FOO 1', { languageId: 'c' });
    const plan = buildPlan(
      [{ path: 'a.c', matches, formatOptions: DEFAULT_FORMAT_OPTIONS }],
      compile(json),
      0.5
    );
    expect(plan.editCount).toBe(0);
    expect(plan.counts.lowConfidence).toBe(1);
  });

  it('counts colors no rule matched', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#000"}]}';
    const plan = buildPlan(
      [input('a.css', 'a{color:#123456;background:#654321}')],
      compile(json),
      0.5
    );
    expect(plan.counts.unmapped).toBe(2);
  });

  it('skips whole files the mapping excludes', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#000"}]}';
    const plan = buildPlan(
      [{ ...input('a.test.css', 'a{color:#fff}'), excluded: true }],
      compile(json),
      0.5
    );
    expect(plan.editCount).toBe(0);
    expect(plan.counts.excluded).toBe(1);
  });

  it('counts a rule that would not change the text', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#fff"}]}';
    const plan = buildPlan([input('a.css', 'a{color:#fff}')], compile(json), 0.5);
    expect(plan.editCount).toBe(0);
    expect(plan.counts.unchanged).toBe(1);
  });

  it('reports rules that matched nothing, so dead rules are visible', () => {
    const json = `{"version":1,"rules":[
      {"from":"#fff","to":"#000"},
      {"from":"#abcdef","to":"#111"}]}`;
    const plan = buildPlan([input('a.css', 'a{color:#fff}')], compile(json), 0.5);
    expect(plan.unusedRules).toEqual([1]);
  });

  it('marks approximate matches so the preview can distinguish them', () => {
    const json = '{"version":1,"tolerance":0.02,"rules":[{"from":"#3b82f6","to":"#2563eb"}]}';
    const plan = buildPlan(
      [input('a.css', 'a{color:#3d84f8;background:#3b82f6}')],
      compile(json),
      0.5
    );
    const edits = plan.files[0]!.edits;
    expect(edits.map((e) => e.exact)).toEqual([false, true]);
    expect(edits[0]!.distance).toBeGreaterThan(0);
  });

  it('records ambiguities without planning an edit for them', () => {
    const json = `{"version":1,"tolerance":0.1,"rules":[
      {"from":"#2563eb","to":"#111"},
      {"from":"#3b82f6","to":"#222"}]}`;
    const plan = buildPlan([input('a.css', 'a{color:#3d84f8}')], compile(json), 0.5);
    expect(plan.editCount).toBe(0);
    expect(plan.ambiguities).toHaveLength(1);
    expect(plan.ambiguities[0]!.candidates).toHaveLength(2);
    expect(plan.ambiguities[0]!.path).toBe('a.css');
  });

  it('flags a replacement that cannot survive the target notation', () => {
    const json = `{"version":1,"defaultNotation":"hex","rules":[
      {"from":"#fff","to":"oklch(0.7 0.35 150)"}]}`;
    const plan = buildPlan([input('a.css', 'a{color:#fff}')], compile(json), 0.5);
    expect(plan.lossyCount).toBe(1);
    expect(plan.files[0]!.edits[0]!.lossy).toBe(true);
  });

  it('skips a named target with no exact keyword instead of emitting hex', () => {
    const json = `{"version":1,"defaultNotation":"named","rules":[
      {"from":"#fff","to":"#123456"}]}`;
    const plan = buildPlan([input('a.css', 'a{color:#fff}')], compile(json), 0.5);
    expect(plan.editCount).toBe(0);
    expect(plan.counts.unchanged).toBe(1);
  });
});

describe('plan summary', () => {
  it('describes a straightforward plan', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#000"}]}';
    const plan = buildPlan([input('a.css', 'a{color:#fff}')], compile(json), 0.5);
    expect(describePlan(plan)).toBe('1 replacement in 1 file');
  });

  it('mentions approximate matches and ambiguities', () => {
    const json = `{"version":1,"tolerance":0.02,"rules":[{"from":"#3b82f6","to":"#2563eb"}]}`;
    const plan = buildPlan([input('a.css', 'a{color:#3d84f8}')], compile(json), 0.5);
    expect(describePlan(plan)).toContain('1 matched within tolerance');
  });
});
