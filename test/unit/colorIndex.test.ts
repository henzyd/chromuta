import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { colorKey } from '../../src/core/color/distance.js';
import { parseColor } from '../../src/core/color/parse.js';
import { scanText } from '../../src/core/detect/scanText.js';
import { ColorIndex } from '../../src/workspace/index.js';
import { withPositions } from '../../src/workspace/positions.js';

function indexed(text: string, languageId = 'css') {
  return withPositions(scanText(text, { languageId }), text);
}

function makeIndex(files: Record<string, string>): ColorIndex {
  const index = new ColorIndex();
  for (const [path, text] of Object.entries(files)) {
    index.set(vscode.Uri.file(path), indexed(text));
  }
  return index;
}

const keyOf = (literal: string): string => colorKey(parseColor(literal)!);

describe('color collapsing', () => {
  it('treats the same color written three ways as one palette entry', () => {
    const index = makeIndex({
      '/w/a.css': 'a { color: #fff; }',
      '/w/b.css': 'b { color: #FFFFFF; }',
      '/w/c.css': 'c { color: rgb(255 255 255); }'
    });

    const { palette } = index.groups(0.5);
    expect(palette).toHaveLength(1);
    expect(palette[0]!.occurrences).toHaveLength(3);
    expect(palette[0]!.fileCount).toBe(3);
    expect(palette[0]!.key).toBe(keyOf('#ffffff'));
  });

  it('keeps colors that differ only in alpha apart', () => {
    const index = makeIndex({ '/w/a.css': 'a{color:#000;background:rgb(0 0 0 / 50%)}' });
    expect(index.groups(0.5).palette).toHaveLength(2);
  });

  it('counts repeated uses within one file', () => {
    const index = makeIndex({ '/w/a.css': 'a{color:#fff}b{color:#fff}c{color:#fff}' });
    const entry = index.groups(0.5).palette[0]!;
    expect(entry.occurrences).toHaveLength(3);
    expect(entry.fileCount).toBe(1);
  });
});

describe('ordering', () => {
  it('puts the most-used color first', () => {
    const index = makeIndex({
      '/w/a.css': 'a{color:#fff}b{color:#fff}c{color:#fff}',
      '/w/b.css': 'd{color:#000}'
    });

    const { palette } = index.groups(0.5);
    expect(palette.map((e) => e.occurrences.length)).toEqual([3, 1]);
  });

  it('orders occurrences by file then position', () => {
    const index = makeIndex({
      '/w/b.css': 'x{color:#fff}y{color:#fff}',
      '/w/a.css': 'z{color:#fff}'
    });

    const entry = index.groups(0.5).palette[0]!;
    expect(entry.occurrences.map((o) => o.uri.fsPath)).toEqual(['/w/a.css', '/w/b.css', '/w/b.css']);
    expect(entry.occurrences[1]!.match.start).toBeLessThan(entry.occurrences[2]!.match.start);
  });
});

describe('confidence split', () => {
  it('routes low-confidence matches to the review group', () => {
    const index = new ColorIndex();
    index.set(vscode.Uri.file('/w/a.c'), indexed('#define FOO 1', 'c'));
    index.set(vscode.Uri.file('/w/b.css'), indexed('a { color: #3b82f6; }'));

    const { palette, review } = index.groups(0.5);
    expect(palette).toHaveLength(1);
    expect(review).toHaveLength(1);
    expect(review[0]!.occurrences[0]!.match.text).toBe('#def');
  });

  it('moves matches between groups as the threshold changes', () => {
    const index = makeIndex({ '/w/a.css': '/* brand #3b82f6 */' });
    // The comment penalty puts this at 0.8.
    expect(index.groups(0.5).palette).toHaveLength(1);
    expect(index.groups(0.9).palette).toHaveLength(0);
    expect(index.groups(0.9).review).toHaveLength(1);
  });
});

describe('mutation', () => {
  it('drops files with no colors rather than storing empty entries', () => {
    const index = new ColorIndex();
    const uri = vscode.Uri.file('/w/a.css');
    index.set(uri, indexed('a { color: #fff; }'));
    expect(index.has(uri)).toBe(true);

    index.set(uri, indexed('a { padding: 0; }'));
    expect(index.has(uri)).toBe(false);
    expect(index.isEmpty).toBe(true);
  });

  it('removes a deleted file from the palette', () => {
    const index = makeIndex({ '/w/a.css': 'a{color:#fff}', '/w/b.css': 'b{color:#fff}' });
    index.delete(vscode.Uri.file('/w/a.css'));
    expect(index.groups(0.5).palette[0]!.fileCount).toBe(1);
  });

  it('reports stats over the whole index', () => {
    const index = makeIndex({
      '/w/a.css': 'a{color:#fff;background:#000}',
      '/w/b.css': 'b{color:#fff}'
    });
    expect(index.stats(0.5)).toEqual({ fileCount: 2, matchCount: 3, colorCount: 2 });
  });

  it('clears everything', () => {
    const index = makeIndex({ '/w/a.css': 'a{color:#fff}' });
    index.clear();
    expect(index.isEmpty).toBe(true);
    expect(index.stats(0.5).matchCount).toBe(0);
  });
});

describe('lookup and notification', () => {
  it('finds an entry by key across both groups', () => {
    const index = new ColorIndex();
    index.set(vscode.Uri.file('/w/a.c'), indexed('#define FOO 1', 'c'));
    index.set(vscode.Uri.file('/w/b.css'), indexed('a{color:#3b82f6}'));

    expect(index.find(keyOf('#3b82f6'), 0.5)).toBeDefined();
    expect(index.find(keyOf('#123456'), 0.5)).toBeUndefined();
    // The low-confidence #def is still findable, so a hover can explain it. Note
    // #def expands to #ddeeff, so those two keys are deliberately the same.
    expect(index.find(keyOf('#def'), 0.5)).toBeDefined();
    expect(index.find(keyOf('#ddeeff'), 0.5)).toBeDefined();
  });

  it('notifies listeners on demand', () => {
    const index = makeIndex({ '/w/a.css': 'a{color:#fff}' });
    let fired = 0;
    index.onDidChange(() => fired++);
    index.notifyChanged();
    index.notifyChanged();
    expect(fired).toBe(2);
  });
});
