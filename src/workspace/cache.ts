import type * as vscode from 'vscode';
import { log } from '../logging.js';
import type { IndexedMatch } from './positions.js';

/**
 * Bumped whenever detection or scoring changes shape.
 *
 * Without this, a cache written by an older build would keep serving matches that
 * the current patterns would score differently, and the change would appear not to
 * have taken effect.
 */
const CACHE_VERSION = 1;

const STORAGE_KEY = 'chromuta.scanCache.v1';

/** Above this, the cache is dropped rather than written. workspaceState is not a database. */
const MAX_CACHED_MATCHES = 60_000;

interface CachedFile {
  readonly mtime: number;
  readonly size: number;
  readonly matches: readonly IndexedMatch[];
}

interface Persisted {
  readonly version: number;
  readonly files: Record<string, CachedFile>;
}

/**
 * Per-file scan results keyed by size and modification time.
 *
 * A cold scan of a large repository is the one genuinely slow operation here, and it
 * would otherwise repeat on every window reload.
 */
export class ScanCache {
  private files = new Map<string, CachedFile>();
  private dirty = false;

  constructor(
    private readonly state: vscode.Memento,
    private readonly enabled: boolean
  ) {
    if (enabled) this.load();
  }

  private load(): void {
    const stored = this.state.get<Persisted>(STORAGE_KEY);
    if (!stored) return;

    if (stored.version !== CACHE_VERSION) {
      log(`cache: discarding version ${stored.version}, expected ${CACHE_VERSION}`);
      return;
    }

    for (const [key, entry] of Object.entries(stored.files)) {
      this.files.set(key, entry);
    }
    log(`cache: loaded ${this.files.size} file(s)`);
  }

  /** Cached matches for a file, if its size and mtime are unchanged. */
  get(uri: vscode.Uri, stat: vscode.FileStat): readonly IndexedMatch[] | undefined {
    if (!this.enabled) return undefined;
    const entry = this.files.get(uri.toString());
    if (!entry) return undefined;
    if (entry.mtime !== stat.mtime || entry.size !== stat.size) return undefined;
    return entry.matches;
  }

  set(uri: vscode.Uri, stat: vscode.FileStat, matches: readonly IndexedMatch[]): void {
    if (!this.enabled) return;
    this.files.set(uri.toString(), { mtime: stat.mtime, size: stat.size, matches });
    this.dirty = true;
  }

  invalidate(uri: vscode.Uri): void {
    if (this.files.delete(uri.toString())) this.dirty = true;
  }

  clear(): void {
    this.files.clear();
    this.dirty = true;
  }

  /** Persist if anything changed. Called once at the end of a scan, never per file. */
  async flush(): Promise<void> {
    if (!this.enabled || !this.dirty) return;
    this.dirty = false;

    let total = 0;
    for (const entry of this.files.values()) total += entry.matches.length;

    if (total > MAX_CACHED_MATCHES) {
      log(`cache: ${total} matches exceeds the ${MAX_CACHED_MATCHES} cap, not persisting`);
      await this.state.update(STORAGE_KEY, undefined);
      return;
    }

    const files: Record<string, CachedFile> = {};
    for (const [key, entry] of this.files) files[key] = entry;

    await this.state.update(STORAGE_KEY, { version: CACHE_VERSION, files } satisfies Persisted);
    log(`cache: persisted ${this.files.size} file(s), ${total} match(es)`);
  }
}
