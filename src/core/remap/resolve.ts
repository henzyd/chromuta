import { colorDistance, colorKey } from '../color/distance.js';
import { parseColor } from '../color/parse.js';
import type { AnyOutputNotation, Color } from '../color/types.js';
import type { Mapping, MappingRule } from './schema.js';

/** Distance below which two colors are considered the same value, not merely close. */
const EXACT_EPSILON = 1e-4;

export interface CompiledRule {
  /** Index in the mapping's rule array, for error messages. */
  readonly index: number;
  readonly raw: MappingRule;
  readonly from: Color;
  readonly to: Color;
  /** Fallback notation for the replacement, used when nothing better is available. */
  readonly notation: AnyOutputNotation;
  /**
   * True when the mapping named a notation explicitly. Otherwise the replacement
   * follows the notation of whatever literal it is replacing.
   */
  readonly pinned: boolean;
  readonly tolerance: number;
}

export interface CompiledMapping {
  readonly rules: readonly CompiledRule[];
  readonly exclude: readonly string[];
}

export interface Replacement {
  readonly rule: CompiledRule;
  readonly exact: boolean;
  readonly distance: number;
}

export type Resolution =
  | { readonly kind: 'none' }
  | { readonly kind: 'match'; readonly replacement: Replacement }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly Replacement[] };

/**
 * Parse every rule's colors once.
 *
 * Resolution runs against every color literal in the workspace, so the per-match path
 * must not re-parse rule strings.
 */
export function compileMapping(mapping: Mapping): CompiledMapping {
  const rules: CompiledRule[] = [];

  mapping.rules.forEach((raw, index) => {
    const from = parseColor(raw.from);
    const to = parseColor(raw.to);
    // Validation already rejected unparseable rules; this is belt and braces.
    if (!from || !to) return;

    rules.push({
      index,
      raw,
      from,
      to,
      // With no mapping-level notation the planner writes each replacement in the
      // notation of the literal it replaces, so a palette swap rewrites Dart colors as
      // Dart and CSS as CSS. This value is only the fallback for when the matched
      // notation cannot be written back.
      notation: mapping.defaultNotation ?? (to.source?.notation as AnyOutputNotation) ?? 'hex',
      pinned: mapping.defaultNotation !== undefined,
      tolerance: raw.tolerance ?? mapping.tolerance
    });
  });

  return { rules, exclude: mapping.exclude };
}

/**
 * Find the rule that applies to a color.
 *
 * An exact match always wins over a near one, so adding a wide tolerance can never
 * change what an exactly-specified rule does. When several rules match only
 * approximately, the result is an ambiguity rather than a guess: silently picking the
 * marginally closer of two plausible rules is how a bulk rewrite goes wrong in a way
 * nobody notices until much later.
 */
export function resolveColor(color: Color, mapping: CompiledMapping): Resolution {
  const key = colorKey(color);

  const exact: Replacement[] = [];
  const near: Replacement[] = [];

  for (const rule of mapping.rules) {
    if (colorKey(rule.from) === key) {
      exact.push({ rule, exact: true, distance: 0 });
      continue;
    }

    const distance = colorDistance(color, rule.from);
    if (distance <= EXACT_EPSILON) {
      exact.push({ rule, exact: true, distance });
    } else if (rule.tolerance > 0 && distance <= rule.tolerance) {
      near.push({ rule, exact: false, distance });
    }
  }

  if (exact.length === 1) return { kind: 'match', replacement: exact[0]! };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: exact };

  if (near.length === 0) return { kind: 'none' };
  if (near.length === 1) return { kind: 'match', replacement: near[0]! };

  return {
    kind: 'ambiguous',
    candidates: [...near].sort((a, b) => a.distance - b.distance)
  };
}

/** True when applying this rule would leave the color unchanged. */
export function isNoOp(replacement: Replacement): boolean {
  return colorKey(replacement.rule.from) === colorKey(replacement.rule.to);
}
