import { describe, expect, it } from 'vitest';
import { emptyMappingTemplate, renderMappingTemplate } from '../../src/core/remap/template.js';
import { parseMapping } from '../../src/core/remap/schema.js';

const entries = [
  { value: '#3b82f6', occurrences: 12, files: 4 },
  { value: '#0f172a', occurrences: 3, files: 2 },
  { value: 'tomato', occurrences: 1, files: 1 }
];

describe('extracted mapping template', () => {
  it('produces a file its own validator accepts with no errors', () => {
    const { mapping, problems } = parseMapping(renderMappingTemplate(entries));
    expect(problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(mapping).not.toBeNull();
  });

  it('maps every color to itself, so applying it before editing changes nothing', () => {
    const { mapping } = parseMapping(renderMappingTemplate(entries));
    for (const rule of mapping!.rules) {
      expect(rule.to).toBe(rule.from);
    }
  });

  it('lists one rule per color, in the order given', () => {
    const { mapping } = parseMapping(renderMappingTemplate(entries));
    expect(mapping!.rules.map((r) => r.from)).toEqual(['#3b82f6', '#0f172a', 'tomato']);
  });

  it('uses an exact tolerance, so near-identical shades do not report ambiguities', () => {
    const { mapping } = parseMapping(renderMappingTemplate(entries));
    expect(mapping!.tolerance).toBe(0);
  });

  it('records usage counts as comments rather than as data', () => {
    const text = renderMappingTemplate(entries);
    expect(text).toContain('// 12 uses in 4 files');
    expect(text).toContain('// 1 use in 1 file');
    // Counts must not become fields, or validation would reject them.
    expect(parseMapping(text).problems.filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('excludes snapshots and tests by default', () => {
    const { mapping } = parseMapping(renderMappingTemplate(entries));
    expect(mapping!.exclude).toContain('**/__snapshots__/**');
    expect(mapping!.exclude).toContain('**/*.test.*');
  });

  it('aligns the from column so the file is readable', () => {
    const line = renderMappingTemplate(entries)
      .split('\n')
      .find((l) => l.includes('"tomato"'))!;
    expect(line).toMatch(/"from": "tomato",\s{2,}"to"/);
  });

  it('handles an empty workspace without producing invalid JSON', () => {
    const { mapping, problems } = parseMapping(emptyMappingTemplate());
    expect(problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(mapping!.rules).toEqual([]);
    expect(emptyMappingTemplate()).toContain('Scan Workspace for Colors');
  });

  it('quotes values safely', () => {
    const { mapping } = parseMapping(
      renderMappingTemplate([{ value: 'rgb(0 0 0 / 50%)', occurrences: 1, files: 1 }])
    );
    expect(mapping!.rules[0]!.from).toBe('rgb(0 0 0 / 50%)');
  });
});
