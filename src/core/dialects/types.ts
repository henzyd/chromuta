import type { Color, ColorNotation } from '../color/types.js';

/** Dialects the user can switch on. `css` is always active. */
export type DialectId = 'css' | 'tailwind' | 'flutter' | 'android' | 'swift';

export const DIALECT_IDS: readonly DialectId[] = ['css', 'tailwind', 'flutter', 'android', 'swift'];

export function isDialectId(value: unknown): value is DialectId {
  return typeof value === 'string' && (DIALECT_IDS as readonly string[]).includes(value);
}

/** What a dialect needs to know about the file to decide whether it applies. */
export interface DialectContext {
  readonly languageId?: string;
  readonly filePath?: string;
}

export interface DialectPattern {
  readonly notation: ColorNotation;
  readonly regex: RegExp;
  /**
   * Breaks ties when two patterns claim the same span and both parse. Android's
   * 8-digit hex and CSS's 8-digit hex are the case that needs it: they cover the same
   * characters and mean different colors.
   */
  readonly priority?: number;
  readonly parse: (raw: string) => Color | null;
  /**
   * Refines the notation from the matched text, for patterns that cover more than one
   * spelling. `UIColor(...)` and `NSColor(...)` share an initializer shape but must be
   * written back with the type they came from.
   */
  readonly notationFor?: (raw: string) => ColorNotation;
}

export interface Dialect {
  readonly id: DialectId;
  /** True when this dialect's patterns should run against the given file. */
  applies(context: DialectContext): boolean;
  readonly patterns: readonly DialectPattern[];
}
