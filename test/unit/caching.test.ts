import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { DEFAULT_FORMAT_OPTIONS } from '../../src/core/color/types.js';
import { scanText } from '../../src/core/detect/scanText.js';
import { ColorIndex } from '../../src/workspace/index.js';
import { withPositions } from '../../src/workspace/positions.js';
import { clearDocumentScanCache, scanDocument } from '../../src/features/documentScan.js';
import type { ChromutaConfig } from '../../src/config.js';

function fill(index: ColorIndex, files: number, colorsPerFile: number): void {
  for (let f = 0; f < files; f++) {
    const text = Array.from(
      { length: colorsPerFile },
      (_, i) => `.c${i}{color:#${(i % 16).toString(16).repeat(6)}}`
    ).join('\n');
    index.set(
      vscode.Uri.file(`/w/f${f}.css`),
      withPositions(scanText(text, { languageId: 'css' }), text)
    );
  }
}

describe('palette grouping is memoized', () => {
  it('groups once for repeated reads at the same threshold', () => {
    const index = new ColorIndex();
    fill(index, 20, 10);

    const before = index.groupComputationCount;
    for (let i = 0; i < 50; i++) index.groups(0.5);
    expect(index.groupComputationCount).toBe(before + 1);
  });

  it('does not regroup for repeated find calls, which the hover makes constantly', () => {
    const index = new ColorIndex();
    fill(index, 20, 10);

    index.groups(0.5);
    const before = index.groupComputationCount;
    for (let i = 0; i < 50; i++) index.find('nonexistent-key', 0.5);
    expect(index.groupComputationCount).toBe(before);
  });

  it('groups separately per threshold', () => {
    const index = new ColorIndex();
    fill(index, 5, 5);

    const before = index.groupComputationCount;
    index.groups(0.5);
    index.groups(0.9);
    index.groups(0.5);
    expect(index.groupComputationCount).toBe(before + 2);
  });

  it('regroups after the index changes', () => {
    const index = new ColorIndex();
    fill(index, 5, 5);
    index.groups(0.5);

    const before = index.groupComputationCount;
    const text = 'a{color:#123456}';
    index.set(
      vscode.Uri.file('/w/new.css'),
      withPositions(scanText(text, { languageId: 'css' }), text)
    );
    index.groups(0.5);
    expect(index.groupComputationCount).toBe(before + 1);
  });

  it('regroups after a delete and after a clear', () => {
    const index = new ColorIndex();
    fill(index, 5, 5);
    index.groups(0.5);

    const baseline = index.groupComputationCount;

    index.delete(vscode.Uri.file('/w/f0.css'));
    index.groups(0.5);
    expect(index.groupComputationCount).toBe(baseline + 1);

    index.clear();
    index.groups(0.5);
    expect(index.groupComputationCount).toBe(baseline + 2);
  });

  it('still returns correct results from the cache', () => {
    const index = new ColorIndex();
    const text = 'a{color:#fff}b{color:#fff}c{color:#000}';
    index.set(
      vscode.Uri.file('/w/a.css'),
      withPositions(scanText(text, { languageId: 'css' }), text)
    );

    const first = index.groups(0.5);
    const second = index.groups(0.5);
    expect(second).toBe(first);
    expect(first.palette.map((e) => e.occurrences.length)).toEqual([2, 1]);
  });
});

describe('document scans are memoized by version', () => {
  const config = {
    namedColors: true,
    dialects: ['css'],
    inferStyleFromFile: true,
    format: DEFAULT_FORMAT_OPTIONS,
    formatOverrides: new Set()
  } as unknown as ChromutaConfig;

  /** Just enough of a TextDocument for scanDocument, with a call counter. */
  function fakeDocument(path: string, text: string, version: number) {
    let reads = 0;
    return {
      uri: vscode.Uri.file(path),
      languageId: 'css',
      version,
      getText: () => {
        reads++;
        return text;
      },
      get reads() {
        return reads;
      }
    };
  }

  it('reads the text once for repeated scans of the same version', () => {
    clearDocumentScanCache();
    const doc = fakeDocument('/w/a.css', 'a{color:#fff}', 1);

    for (let i = 0; i < 10; i++) scanDocument(doc as never, config);
    expect(doc.reads).toBe(1);
  });

  it('rescans when the version changes', () => {
    clearDocumentScanCache();
    const first = fakeDocument('/w/b.css', 'a{color:#fff}', 1);
    scanDocument(first as never, config);

    const second = fakeDocument('/w/b.css', 'a{color:#000}', 2);
    const scan = scanDocument(second as never, config);

    expect(second.reads).toBe(1);
    expect(scan.matches[0]!.text).toBe('#000');
  });

  it('rescans after the cache is cleared, which a settings change does', () => {
    clearDocumentScanCache();
    const doc = fakeDocument('/w/c.css', 'a{color:#fff}', 1);

    scanDocument(doc as never, config);
    clearDocumentScanCache();
    scanDocument(doc as never, config);

    expect(doc.reads).toBe(2);
  });

  it('keeps distinct documents apart', () => {
    clearDocumentScanCache();
    const a = fakeDocument('/w/d.css', 'a{color:#fff}', 1);
    const b = fakeDocument('/w/e.css', 'a{color:#000}', 1);

    expect(scanDocument(a as never, config).matches[0]!.text).toBe('#fff');
    expect(scanDocument(b as never, config).matches[0]!.text).toBe('#000');
    expect(scanDocument(a as never, config).matches[0]!.text).toBe('#fff');
    expect(a.reads).toBe(1);
  });

  it('bounds its own size so a long session cannot grow it without limit', () => {
    clearDocumentScanCache();
    const docs = Array.from({ length: 20 }, (_, i) =>
      fakeDocument(`/w/n${i}.css`, 'a{color:#fff}', 1)
    );
    for (const doc of docs) scanDocument(doc as never, config);

    // The earliest entries have been evicted, so re-scanning one reads again.
    scanDocument(docs[0]! as never, config);
    expect(docs[0]!.reads).toBe(2);
    // The most recent is still cached.
    scanDocument(docs[19]! as never, config);
    expect(docs[19]!.reads).toBe(1);
  });
});
