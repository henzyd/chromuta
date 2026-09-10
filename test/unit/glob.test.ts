import { describe, expect, it } from 'vitest';
import { matchesAnyGlob, matchesGlob } from '../../src/workspace/glob.js';

describe('exclude glob matching', () => {
  it.each([
    ['node_modules/react/index.js', '**/node_modules/**', true],
    ['app/node_modules/react/index.js', '**/node_modules/**', true],
    ['src/nodes/index.js', '**/node_modules/**', false],
    ['dist/main.js', '**/dist/**', true],
    ['packages/a/dist/main.js', '**/dist/**', true],
    ['src/app.min.css', '**/*.min.*', true],
    ['src/app.css', '**/*.min.*', false],
    ['a/b/c.css', '**/*.css', true],
    ['c.css', '**/*.css', true],
    ['src/a.ts', 'src/*.ts', true],
    ['src/nested/a.ts', 'src/*.ts', false]
  ])('%s vs %s', (candidate, pattern, expected) => {
    expect(matchesGlob(candidate, pattern)).toBe(expected);
  });

  it('treats a leading **/ as optional so top-level directories match too', () => {
    expect(matchesGlob('dist/x.js', '**/dist/**')).toBe(true);
  });

  it('does not let * cross a path separator', () => {
    expect(matchesGlob('a/b.css', 'a*.css')).toBe(false);
  });

  it('escapes regex metacharacters in the pattern', () => {
    expect(matchesGlob('a+b.css', '**/a+b.css')).toBe(true);
    expect(matchesGlob('axb.css', '**/a+b.css')).toBe(false);
  });

  it('normalizes Windows separators', () => {
    expect(matchesGlob('src\\node_modules\\a.js', '**/node_modules/**')).toBe(true);
  });

  it('matches against any pattern in a list', () => {
    const patterns = ['**/node_modules/**', '**/*.min.*'];
    expect(matchesAnyGlob('a/b.min.js', patterns)).toBe(true);
    expect(matchesAnyGlob('a/b.js', patterns)).toBe(false);
  });
});
