import type { Color, ColorNotation } from '../color/types.js';

/** A regex hit, before parsing or scoring. */
export interface RawMatch {
  /** Offset into the scanned text. */
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly notation: ColorNotation;
}

/** A hit that parsed successfully and has been scored. */
export interface ColorMatch extends RawMatch {
  readonly color: Color;
  /** 0..1. Below the configured threshold, bulk operations skip it. */
  readonly confidence: number;
  /** Human-readable reasons the score was reduced, shown in the review UI. */
  readonly flags: readonly string[];
}

export interface ScanContext {
  /** VS Code language id, used to gate language-specific heuristics. */
  readonly languageId?: string;
  /** Workspace-relative path, used to detect test fixtures and snapshots. */
  readonly filePath?: string;
  /** Detect CSS named colors. Off means `tomato` is never a match. */
  readonly namedColors?: boolean;
}

/** Half-open ranges of the text that sit inside comments. */
export interface CommentRanges {
  contains(offset: number): boolean;
}
