import { describe, expect, it } from 'vitest';
import { parseColor } from '../../src/core/color/parse.js';
import { parseMapping } from '../../src/core/remap/schema.js';
import { compileMapping, isNoOp, resolveColor } from '../../src/core/remap/resolve.js';

function compile(json: string) {
  const { mapping, problems } = parseMapping(json);
  const fatal = problems.filter((p) => p.severity === 'error');
  if (!mapping || fatal.length > 0) throw new Error(`bad fixture: ${JSON.stringify(fatal)}`);
  return compileMapping(mapping);
}

const resolve = (literal: string, json: string) => resolveColor(parseColor(literal)!, compile(json));

describe('exact matching', () => {
  const mapping = '{"version":1,"tolerance":0,"rules":[{"from":"#3b82f6","to":"#2563eb"}]}';

  it('matches the same color written a different way', () => {
    for (const literal of ['#3b82f6', '#3B82F6', 'rgb(59 130 246)']) {
      const result = resolve(literal, mapping);
      expect(result.kind).toBe('match');
      expect(result.kind === 'match' && result.replacement.exact).toBe(true);
    }
  });

  it('does not match a different color', () => {
    expect(resolve('#ef4444', mapping).kind).toBe('none');
  });

  it('distinguishes colors that differ only in alpha', () => {
    expect(resolve('rgb(59 130 246 / 50%)', mapping).kind).toBe('none');
  });
});

describe('tolerance matching', () => {
  const mapping = '{"version":1,"tolerance":0.02,"rules":[{"from":"#3b82f6","to":"#2563eb"}]}';

  it('matches a nearby color and marks it approximate', () => {
    const result = resolve('#3d84f8', mapping);
    expect(result.kind).toBe('match');
    expect(result.kind === 'match' && result.replacement.exact).toBe(false);
    expect(result.kind === 'match' && result.replacement.distance).toBeGreaterThan(0);
  });

  it('does not match beyond the tolerance', () => {
    expect(resolve('#ef4444', mapping).kind).toBe('none');
  });

  it('honors a per-rule tolerance of zero', () => {
    const strict = `{"version":1,"tolerance":0.2,"rules":[
      {"from":"#3b82f6","to":"#2563eb","tolerance":0}]}`;
    expect(resolve('#3d84f8', strict).kind).toBe('none');
    expect(resolve('#3b82f6', strict).kind).toBe('match');
  });

  it('honors a per-rule tolerance that is wider than the default', () => {
    const loose = `{"version":1,"tolerance":0,"rules":[
      {"from":"#3b82f6","to":"#2563eb","tolerance":0.05}]}`;
    expect(resolve('#3d84f8', loose).kind).toBe('match');
  });
});

describe('precedence and ambiguity', () => {
  it('lets an exact rule win over a nearby one, regardless of order', () => {
    const json = `{"version":1,"tolerance":0.1,"rules":[
      {"from":"#3d84f8","to":"#111"},
      {"from":"#3b82f6","to":"#222"}]}`;

    const result = resolve('#3b82f6', json);
    expect(result.kind).toBe('match');
    expect(result.kind === 'match' && result.replacement.rule.raw.to).toBe('#222');
    expect(result.kind === 'match' && result.replacement.exact).toBe(true);
  });

  it('reports an ambiguity rather than picking the marginally closer rule', () => {
    const json = `{"version":1,"tolerance":0.1,"rules":[
      {"from":"#3b82f6","to":"#111"},
      {"from":"#4a8bf9","to":"#222"}]}`;

    const result = resolve('#4287f7', json);
    expect(result.kind).toBe('ambiguous');
    expect(result.kind === 'ambiguous' && result.candidates).toHaveLength(2);
  });

  it('orders ambiguous candidates closest first, so a message can name them usefully', () => {
    // Measured OKLab distances from #3d84f8: 0.0882 to #2563eb, 0.0062 to #3b82f6.
    // Both sit inside the 0.1 tolerance, so both are genuine candidates.
    const json = `{"version":1,"tolerance":0.1,"rules":[
      {"from":"#2563eb","to":"#111"},
      {"from":"#3b82f6","to":"#222"}]}`;

    const result = resolve('#3d84f8', json);
    expect(result.kind).toBe('ambiguous');
    if (result.kind !== 'ambiguous') return;
    expect(result.candidates[0]!.distance).toBeLessThan(result.candidates[1]!.distance);
    expect(result.candidates[0]!.rule.raw.from).toBe('#3b82f6');
  });
});

describe('replacement notation', () => {
  it('keeps the notation the to value was authored in', () => {
    const json = '{"version":1,"rules":[{"from":"#000","to":"oklch(0.63 0.24 25)"}]}';
    const result = resolve('#000', json);
    expect(result.kind === 'match' && result.replacement.rule.notation).toBe('oklch');
  });

  it('lets defaultNotation override the authored notation', () => {
    const json = `{"version":1,"defaultNotation":"hsl","rules":[
      {"from":"#000","to":"oklch(0.63 0.24 25)"}]}`;
    const result = resolve('#000', json);
    expect(result.kind === 'match' && result.replacement.rule.notation).toBe('hsl');
  });
});

describe('no-op detection', () => {
  it('recognizes a rule that maps a color to itself', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#FFFFFF"}]}';
    const result = resolve('#fff', json);
    expect(result.kind).toBe('match');
    expect(result.kind === 'match' && isNoOp(result.replacement)).toBe(true);
  });

  it('does not flag a real change as a no-op', () => {
    const json = '{"version":1,"rules":[{"from":"#fff","to":"#000"}]}';
    const result = resolve('#fff', json);
    expect(result.kind === 'match' && isNoOp(result.replacement)).toBe(false);
  });
});

describe('empty mapping', () => {
  it('matches nothing', () => {
    expect(resolve('#fff', '{"version":1,"rules":[]}').kind).toBe('none');
  });
});
