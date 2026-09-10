import * as vscode from 'vscode';
import { colorKey } from '../core/color/distance.js';
import type { Color } from '../core/color/types.js';
import type { IndexedMatch } from './positions.js';

export interface Occurrence {
  readonly uri: vscode.Uri;
  readonly match: IndexedMatch;
}

/** One distinct color and every place it appears. */
export interface PaletteEntry {
  readonly key: string;
  /** A representative parsed color; all occurrences share the same key. */
  readonly color: Color;
  readonly occurrences: readonly Occurrence[];
  readonly fileCount: number;
}

export interface PaletteGroups {
  /** Colors confident enough to bulk-edit. */
  readonly palette: readonly PaletteEntry[];
  /** Colors that parsed but scored below the threshold, surfaced for a human to judge. */
  readonly review: readonly PaletteEntry[];
}

export interface IndexStats {
  readonly fileCount: number;
  readonly matchCount: number;
  readonly colorCount: number;
}

/**
 * In-memory store of every color found in the workspace.
 *
 * Two views over the same data: by file, which the watcher invalidates, and by
 * normalized color, which drives the palette. The normalized key comes from OKLab
 * coordinates, so `#FFF`, `#ffffff` and `rgb(255 255 255)` collapse into a single
 * palette entry with three occurrences rather than three entries.
 */
export class ColorIndex implements vscode.Disposable {
  private readonly files = new Map<string, readonly IndexedMatch[]>();
  private readonly uris = new Map<string, vscode.Uri>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  /**
   * Memoized grouping, keyed by threshold.
   *
   * Grouping walks every match in the workspace. The hover provider calls `find` on
   * every hover and the tree calls `groups` for every expanded node, so without this
   * a large repository pays a full regroup for each mouse movement.
   */
  private grouped = new Map<number, PaletteGroups>();

  /** Incremented on every mutation, for tests and diagnostics. */
  private groupComputations = 0;

  readonly onDidChange = this.changeEmitter.event;

  set(uri: vscode.Uri, matches: readonly IndexedMatch[]): void {
    this.grouped.clear();
    const key = uri.toString();
    if (matches.length === 0) {
      // Keeping empty entries would grow the index with every file in the repo.
      this.files.delete(key);
      this.uris.delete(key);
    } else {
      this.files.set(key, matches);
      this.uris.set(key, uri);
    }
  }

  delete(uri: vscode.Uri): void {
    this.grouped.clear();
    const key = uri.toString();
    this.files.delete(key);
    this.uris.delete(key);
  }

  clear(): void {
    this.grouped.clear();
    this.files.clear();
    this.uris.clear();
  }

  has(uri: vscode.Uri): boolean {
    return this.files.has(uri.toString());
  }

  byFile(uri: vscode.Uri): readonly IndexedMatch[] {
    return this.files.get(uri.toString()) ?? [];
  }

  entries(): Iterable<[vscode.Uri, readonly IndexedMatch[]]> {
    const result: [vscode.Uri, readonly IndexedMatch[]][] = [];
    for (const [key, matches] of this.files) {
      const uri = this.uris.get(key);
      if (uri) result.push([uri, matches]);
    }
    return result;
  }

  /** Group every indexed match by color, splitting on the confidence threshold. */
  groups(threshold: number): PaletteGroups {
    const cached = this.grouped.get(threshold);
    if (cached) return cached;

    const computed = this.computeGroups(threshold);
    this.grouped.set(threshold, computed);
    return computed;
  }

  /** How many times grouping has actually been computed, for the memoization test. */
  get groupComputationCount(): number {
    return this.groupComputations;
  }

  private computeGroups(threshold: number): PaletteGroups {
    this.groupComputations++;
    const palette = new Map<string, Occurrence[]>();
    const review = new Map<string, Occurrence[]>();

    for (const [uri, matches] of this.entries()) {
      for (const match of matches) {
        const bucket = match.confidence >= threshold ? palette : review;
        const key = colorKey(match.color);
        const existing = bucket.get(key);
        if (existing) existing.push({ uri, match });
        else bucket.set(key, [{ uri, match }]);
      }
    }

    return { palette: toEntries(palette), review: toEntries(review) };
  }

  /** The palette entry for one color key, or undefined if it is no longer indexed. */
  find(key: string, threshold: number): PaletteEntry | undefined {
    const { palette, review } = this.groups(threshold);
    return palette.find((e) => e.key === key) ?? review.find((e) => e.key === key);
  }

  stats(threshold: number): IndexStats {
    let matchCount = 0;
    for (const matches of this.files.values()) matchCount += matches.length;
    const { palette, review } = this.groups(threshold);
    return { fileCount: this.files.size, matchCount, colorCount: palette.length + review.length };
  }

  get isEmpty(): boolean {
    return this.files.size === 0;
  }

  notifyChanged(): void {
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
    this.clear();
  }
}

/** Most-used colors first, since that is the order someone auditing a palette wants. */
function toEntries(buckets: Map<string, Occurrence[]>): PaletteEntry[] {
  const entries: PaletteEntry[] = [];

  for (const [key, occurrences] of buckets) {
    occurrences.sort(
      (a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath) || a.match.start - b.match.start
    );
    const files = new Set(occurrences.map((o) => o.uri.toString()));
    entries.push({
      key,
      color: occurrences[0]!.match.color,
      occurrences,
      fileCount: files.size
    });
  }

  entries.sort((a, b) => b.occurrences.length - a.occurrences.length || a.key.localeCompare(b.key));
  return entries;
}
