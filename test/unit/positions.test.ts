import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/core/detect/scanText.js';
import { withPositions } from '../../src/workspace/positions.js';

const locate = (text: string) => withPositions(scanText(text, { languageId: 'css' }), text);

describe('position resolution', () => {
  it('resolves a match on the first line', () => {
    const [match] = locate('a { color: #fff; }');
    expect(match).toMatchObject({ startLine: 0, startColumn: 11, endLine: 0, endColumn: 15 });
  });

  it('resolves matches across many lines', () => {
    const text = ['a {', '  color: #fff;', '}', '', 'b {', '  color: #000;', '}'].join('\n');
    const matches = locate(text);
    expect(matches.map((m) => m.startLine)).toEqual([1, 5]);
    expect(matches.map((m) => m.startColumn)).toEqual([9, 9]);
  });

  it('produces columns that slice the correct text back out of the line', () => {
    const text = 'x\ny\n.a { border: 1px solid #3b82f6; }\n';
    const [match] = locate(text);
    const line = text.split('\n')[match!.startLine]!;
    expect(line.slice(match!.startColumn, match!.endColumn)).toBe('#3b82f6');
  });

  it('handles a match spanning a newline inside a function', () => {
    const text = 'a {\n  color: rgb(\n    255 0 0\n  );\n}';
    const [match] = locate(text);
    expect(match!.startLine).toBe(1);
    expect(match!.endLine).toBe(3);
  });

  it('handles CRLF line endings', () => {
    const [match] = locate('a {\r\n  color: #fff;\r\n}');
    expect(match!.startLine).toBe(1);
    expect(match!.startColumn).toBe(9);
  });

  it('returns nothing for no matches', () => {
    expect(withPositions([], 'nothing here')).toEqual([]);
  });
});
