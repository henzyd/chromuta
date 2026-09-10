import { isAnyOutputNotation, type AnyOutputNotation, type FormatOptions } from '../color/types.js';
import { dialectOf } from '../dialects/registry.js';
import { formatAny, isLossyAny } from '../notation.js';
import type { ColorMatch } from '../detect/types.js';
import { resolveColor, type CompiledMapping, type CompiledRule, type Replacement } from './resolve.js';

export interface PlannedEdit<M extends ColorMatch = ColorMatch> {
  readonly match: M;
  /** Text currently in the file. */
  readonly from: string;
  /** Text that will replace it. */
  readonly to: string;
  readonly rule: CompiledRule;
  /** Notation the replacement was written in. */
  readonly notation: AnyOutputNotation;
  /** False when the rule matched within tolerance rather than exactly. */
  readonly exact: boolean;
  readonly distance: number;
  /** The replacement falls outside sRGB and the target notation had to clamp it. */
  readonly lossy: boolean;
}

export interface Ambiguity<M extends ColorMatch = ColorMatch> {
  readonly path: string;
  readonly match: M;
  readonly candidates: readonly Replacement[];
}

export interface FilePlan<M extends ColorMatch = ColorMatch> {
  readonly path: string;
  readonly edits: readonly PlannedEdit<M>[];
}

export interface PlanCounts {
  /** Parsed as a color but scored below the confidence threshold. */
  readonly lowConfidence: number;
  /** In a file the mapping's own exclude list covers. */
  readonly excluded: number;
  /** No rule matched. */
  readonly unmapped: number;
  /** A rule matched but the text would not change. */
  readonly unchanged: number;
}

export interface ChangePlan<M extends ColorMatch = ColorMatch> {
  readonly files: readonly FilePlan<M>[];
  readonly editCount: number;
  readonly fileCount: number;
  readonly ambiguities: readonly Ambiguity<M>[];
  readonly counts: PlanCounts;
  readonly lossyCount: number;
  /** Rule indices that matched nothing, so the user can see which rules are dead. */
  readonly unusedRules: readonly number[];
}

/** One file's current content, as the planner needs to see it. */
export interface PlanInput<M extends ColorMatch = ColorMatch> {
  readonly path: string;
  readonly matches: readonly M[];
  readonly formatOptions: FormatOptions;
  /** True when the mapping's exclude list covers this file. */
  readonly excluded?: boolean;
}

/**
 * Turn scan results plus a mapping into an ordered set of edits.
 *
 * Pure by design: it takes text-derived matches and returns text replacements, so the
 * whole rewrite can be tested, and later driven from a CLI, without an editor.
 */
export function buildPlan<M extends ColorMatch>(
  inputs: readonly PlanInput<M>[],
  mapping: CompiledMapping,
  confidenceThreshold: number
): ChangePlan<M> {
  const files: FilePlan<M>[] = [];
  const ambiguities: Ambiguity<M>[] = [];
  const usedRules = new Set<number>();

  let lowConfidence = 0;
  let excluded = 0;
  let unmapped = 0;
  let unchanged = 0;
  let lossyCount = 0;

  for (const input of inputs) {
    if (input.excluded) {
      excluded += input.matches.length;
      continue;
    }

    const edits: PlannedEdit<M>[] = [];

    for (const match of input.matches) {
      if (match.confidence < confidenceThreshold) {
        lowConfidence++;
        continue;
      }

      const resolution = resolveColor(match.color, mapping);

      if (resolution.kind === 'none') {
        unmapped++;
        continue;
      }

      if (resolution.kind === 'ambiguous') {
        ambiguities.push({ path: input.path, match, candidates: resolution.candidates });
        continue;
      }

      const { rule, exact, distance } = resolution.replacement;

      const notation = replacementNotation(match.notation, rule);

      const to = formatAny(rule.to, notation, input.formatOptions);

      // A `named` target with no exact keyword yields null. Skipping is right: the
      // alternative is emitting hex under a rule that asked for a keyword.
      if (to === null || to === match.text) {
        unchanged++;
        continue;
      }

      const lossy = isLossyAny(rule.to, notation);
      if (lossy) lossyCount++;

      usedRules.add(rule.index);
      edits.push({ match, from: match.text, to, rule, notation, exact, distance, lossy });
    }

    if (edits.length > 0) {
      // Ascending by offset for readable previews. Matches never overlap, so ordering
      // is presentational here; `applyEditsToText` sorts descending for itself.
      edits.sort((a, b) => a.match.start - b.match.start);
      files.push({ path: input.path, edits });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  const unusedRules = mapping.rules
    .map((rule) => rule.index)
    .filter((index) => !usedRules.has(index));

  return {
    files,
    editCount: files.reduce((total, file) => total + file.edits.length, 0),
    fileCount: files.length,
    ambiguities,
    counts: { lowConfidence, excluded, unmapped, unchanged },
    lossyCount,
    unusedRules
  };
}

/**
 * Decide which notation a replacement is written in.
 *
 * A pinned `defaultNotation` always wins. Otherwise the replacement keeps the notation
 * its `to` value was authored in, which is predictable: a mapping that says
 * `"to": "#2563eb"` writes `#2563eb`.
 *
 * The exception is a platform literal. Writing `#2563eb` over a Dart
 * `Color(0xFF3B82F6)` produces code that does not compile, so those keep the idiom of
 * the site instead. Preserving CSS notations the same way was tried and is worse: a
 * rule replacing the keyword `tomato` would try to write a keyword for a color that
 * has none, and silently skip the edit.
 */
function replacementNotation(
  matchNotation: ColorMatch['notation'],
  rule: CompiledRule
): AnyOutputNotation {
  if (rule.pinned) return rule.notation;
  if (dialectOf(matchNotation) !== 'css' && isAnyOutputNotation(matchNotation)) {
    return matchNotation;
  }
  return rule.notation;
}

/**
 * Apply a file's edits to its text.
 *
 * Edits are applied from the end backwards so that each replacement cannot shift the
 * offsets of the ones still to come. This is the reference implementation the tests
 * check plans against, and what a non-editor caller would use.
 */
export function applyEditsToText(text: string, edits: readonly PlannedEdit<ColorMatch>[]): string {
  const ordered = [...edits].sort((a, b) => b.match.start - a.match.start);

  let result = text;
  for (const edit of ordered) {
    result = result.slice(0, edit.match.start) + edit.to + result.slice(edit.match.end);
  }
  return result;
}

/** A short human summary of what the plan will do, for a confirmation prompt. */
export function describePlan<M extends ColorMatch>(plan: ChangePlan<M>): string {
  const parts = [
    `${plan.editCount} replacement${plan.editCount === 1 ? '' : 's'} in ${plan.fileCount} file${plan.fileCount === 1 ? '' : 's'}`
  ];

  const approximate = plan.files
    .flatMap((file) => file.edits)
    .filter((edit) => !edit.exact).length;

  if (approximate > 0) parts.push(`${approximate} matched within tolerance`);
  if (plan.ambiguities.length > 0) parts.push(`${plan.ambiguities.length} ambiguous, left unchanged`);
  if (plan.counts.lowConfidence > 0) parts.push(`${plan.counts.lowConfidence} low-confidence, skipped`);
  if (plan.counts.excluded > 0) parts.push(`${plan.counts.excluded} in excluded files`);
  if (plan.lossyCount > 0) parts.push(`${plan.lossyCount} clamped to sRGB`);

  return parts.join(' · ');
}
