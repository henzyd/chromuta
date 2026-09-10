import { describe, expect, it } from 'vitest';
import { DEFAULT_TOLERANCE, parseMapping } from '../../src/core/remap/schema.js';

/** What the reported problem actually points at in the source text. */
const pointsAt = (text: string, index = 0): string => {
  const problem = parseMapping(text).problems[index]!;
  return text.slice(problem.offset, problem.offset + problem.length);
};

const errors = (text: string): string[] =>
  parseMapping(text)
    .problems.filter((p) => p.severity === 'error')
    .map((p) => p.message);

const warnings = (text: string): string[] =>
  parseMapping(text)
    .problems.filter((p) => p.severity === 'warning')
    .map((p) => p.message);

describe('valid mappings', () => {
  it('accepts the documented shape', () => {
    const { mapping, problems } = parseMapping(`{
      "version": 1,
      "defaultNotation": "oklch",
      "tolerance": 0.02,
      "rules": [
        { "from": "#3b82f6", "to": "#2563eb" },
        { "from": "rgb(17 24 39)", "to": "#0f172a", "tolerance": 0 }
      ],
      "exclude": ["**/*.test.*"]
    }`);

    expect(problems).toEqual([]);
    expect(mapping).not.toBeNull();
    expect(mapping!.rules).toHaveLength(2);
    expect(mapping!.defaultNotation).toBe('oklch');
    expect(mapping!.exclude).toEqual(['**/*.test.*']);
    expect(mapping!.rules[1]!.tolerance).toBe(0);
  });

  it('accepts comments and trailing commas, since the file is meant to be hand-edited', () => {
    const { mapping, problems } = parseMapping(`{
      // the brand blue got darker
      "version": 1,
      "rules": [
        { "from": "#3b82f6", "to": "#2563eb" }, /* was too light */
      ],
    }`);

    expect(problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(mapping!.rules).toHaveLength(1);
  });

  it('defaults the tolerance when it is absent', () => {
    expect(
      parseMapping('{"version":1,"rules":[{"from":"#000","to":"#fff"}]}').mapping!.tolerance
    ).toBe(DEFAULT_TOLERANCE);
  });

  it('reads every color notation in from and to', () => {
    const { problems } = parseMapping(`{
      "version": 1,
      "rules": [
        { "from": "tomato", "to": "oklch(0.63 0.24 25)" },
        { "from": "hsl(210 40% 96%)", "to": "rgb(0 0 0 / 50%)" }
      ]
    }`);
    expect(problems).toEqual([]);
  });
});

describe('structural errors', () => {
  it('rejects text that is not JSON', () => {
    expect(parseMapping('not json at all').mapping).toBeNull();
    expect(errors('not json at all').length).toBeGreaterThan(0);
  });

  it('reports the location of a syntax error', () => {
    const problem = parseMapping('{"version": 1 "rules": []}').problems[0]!;
    expect(problem.severity).toBe('error');
    expect(problem.offset).toBeGreaterThan(0);
  });

  it('rejects an array at the root', () => {
    expect(errors('[]')[0]).toContain('must contain a JSON object');
  });

  it('requires a rules array', () => {
    expect(errors('{"version":1}')[0]).toContain('"rules" array');
    expect(errors('{"version":1,"rules":{}}')[0]).toContain('must be an array');
  });

  it('rejects an unknown version and stops there', () => {
    const { mapping, problems } = parseMapping('{"version":99,"rules":[]}');
    expect(mapping).toBeNull();
    expect(problems[0]!.message).toContain('Unsupported mapping version 99');
  });

  it('warns rather than fails when the version is missing', () => {
    const { mapping } = parseMapping('{"rules":[{"from":"#000","to":"#fff"}]}');
    expect(mapping).not.toBeNull();
    expect(warnings('{"rules":[{"from":"#000","to":"#fff"}]}')[0]).toContain('assuming 1');
  });
});

describe('rule errors point at the offending value', () => {
  it('locates an unreadable from color', () => {
    const text = '{"version":1,"rules":[{"from":"notacolor","to":"#fff"}]}';
    expect(errors(text)[0]).toContain('not a color Chromuta can read');
    expect(pointsAt(text)).toBe('"notacolor"');
  });

  it('locates an unreadable to color', () => {
    const text = '{"version":1,"rules":[{"from":"#000","to":"#12345"}]}';
    expect(errors(text)[0]).toContain('not a color Chromuta can write');
    expect(pointsAt(text)).toBe('"#12345"');
  });

  it('locates a bad tolerance', () => {
    const text = '{"version":1,"tolerance":-1,"rules":[{"from":"#000","to":"#fff"}]}';
    expect(errors(text)[0]).toContain('0 or more');
    expect(pointsAt(text)).toBe('-1');
  });

  it('locates a bad defaultNotation', () => {
    const text = '{"version":1,"defaultNotation":"cmyk","rules":[{"from":"#000","to":"#fff"}]}';
    expect(errors(text)[0]).toContain('must be one of');
    expect(pointsAt(text)).toBe('"cmyk"');
  });

  it('locates a rule that is not an object', () => {
    const text = '{"version":1,"rules":["#fff"]}';
    expect(errors(text)[0]).toContain('must be an object');
    expect(pointsAt(text)).toBe('"#fff"');
  });

  it('drops only the invalid rule and keeps the rest', () => {
    const { mapping } = parseMapping(`{
      "version": 1,
      "rules": [
        { "from": "#000", "to": "#fff" },
        { "from": "bogus", "to": "#fff" },
        { "from": "#111", "to": "#eee" }
      ]
    }`);
    expect(mapping!.rules.map((r) => r.from)).toEqual(['#000', '#111']);
  });
});

describe('rule conflicts', () => {
  it('rejects two rules with the same from color, however written', () => {
    const text =
      '{"version":1,"rules":[{"from":"#fff","to":"#000"},{"from":"#FFFFFF","to":"#111"}]}';
    expect(errors(text)[0]).toContain('Duplicate "from" color');
    expect(pointsAt(text)).toBe('"#FFFFFF"');
  });

  it('warns when two rules sit inside each other tolerance', () => {
    // These two blues are about 0.005 apart in OKLab, well inside the 0.02 default.
    const text =
      '{"version":1,"rules":[{"from":"#3b82f6","to":"#000"},{"from":"#3d84f8","to":"#111"}]}';
    const warning = warnings(text)[0]!;
    expect(warning).toContain('within tolerance of');
    expect(warning).toContain('ambiguous');
  });

  it('does not warn when tolerance is zero, since exact rules cannot compete', () => {
    const text = `{"version":1,"tolerance":0,"rules":[
      {"from":"#3b82f6","to":"#000"},{"from":"#3d84f8","to":"#111"}]}`;
    expect(warnings(text)).toEqual([]);
  });

  it('warns about a very wide tolerance', () => {
    const text = '{"version":1,"tolerance":0.9,"rules":[{"from":"#000","to":"#fff"}]}';
    expect(warnings(text).some((w) => w.includes('very wide'))).toBe(true);
  });

  it('warns about an empty rule list', () => {
    expect(warnings('{"version":1,"rules":[]}')[0]).toContain('would change nothing');
  });
});
