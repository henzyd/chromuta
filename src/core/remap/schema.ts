import {
  findNodeAtLocation,
  parse,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError
} from 'jsonc-parser';
import { colorKey, colorDistance } from '../color/distance.js';
import { parseColor } from '../color/parse.js';
import { isOutputNotation, OUTPUT_NOTATIONS, type OutputNotation } from '../color/types.js';

/** The only mapping format this build understands. */
export const MAPPING_VERSION = 1;

/** ΔE-OK. Roughly a just-noticeable difference, so near-identical colors still map. */
export const DEFAULT_TOLERANCE = 0.02;

export interface MappingRule {
  readonly from: string;
  readonly to: string;
  /** Overrides the mapping-level tolerance for this rule. 0 means exact match only. */
  readonly tolerance?: number;
}

export interface Mapping {
  readonly version: number;
  /**
   * Notation the replacement is written in. When absent, each replacement keeps the
   * notation its own `to` value was authored in.
   */
  readonly defaultNotation?: OutputNotation;
  readonly tolerance: number;
  readonly rules: readonly MappingRule[];
  readonly exclude: readonly string[];
}

export type ProblemSeverity = 'error' | 'warning';

/**
 * A validation problem carrying its exact location in the source text.
 *
 * Offsets come from the syntax tree rather than being reconstructed by searching, so
 * the extension can put a squiggle on the offending value instead of on line 1.
 */
export interface MappingProblem {
  readonly offset: number;
  readonly length: number;
  readonly message: string;
  readonly severity: ProblemSeverity;
}

export interface ParsedMapping {
  /** Null when the text could not yield a usable mapping. */
  readonly mapping: Mapping | null;
  readonly problems: readonly MappingProblem[];
}

/**
 * Parse and validate a mapping file.
 *
 * Comments and trailing commas are accepted, because the file is documented as JSONC
 * and is meant to be hand-edited with notes about what each color is.
 */
export function parseMapping(text: string): ParsedMapping {
  const errors: ParseError[] = [];
  const options = { allowTrailingComma: true, disallowComments: false };

  const root = parseTree(text, errors, options);
  const problems: MappingProblem[] = [];

  for (const error of errors) {
    problems.push({
      offset: error.offset,
      length: Math.max(1, error.length),
      message: `JSON syntax: ${printParseErrorCode(error.error)}`,
      severity: 'error'
    });
  }

  if (!root || errors.length > 0) {
    if (!root) {
      problems.push({ offset: 0, length: Math.max(1, text.length), message: 'Not valid JSON.', severity: 'error' });
    }
    return { mapping: null, problems };
  }

  const value: unknown = parse(text, [], options);
  const locate = (...path: (string | number)[]): { offset: number; length: number } =>
    span(findNodeAtLocation(root, path) ?? root);

  const fail = (message: string, ...path: (string | number)[]): void => {
    problems.push({ ...locate(...path), message, severity: 'error' });
  };
  const warn = (message: string, ...path: (string | number)[]): void => {
    problems.push({ ...locate(...path), message, severity: 'warning' });
  };

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('A mapping file must contain a JSON object.');
    return { mapping: null, problems };
  }

  const raw = value as Record<string, unknown>;

  // --- version -------------------------------------------------------------
  if (raw.version === undefined) {
    warn(`No "version" field; assuming ${MAPPING_VERSION}.`);
  } else if (raw.version !== MAPPING_VERSION) {
    fail(
      `Unsupported mapping version ${JSON.stringify(raw.version)}. This build understands version ${MAPPING_VERSION}.`,
      'version'
    );
    return { mapping: null, problems };
  }

  // --- tolerance -----------------------------------------------------------
  let tolerance = DEFAULT_TOLERANCE;
  if (raw.tolerance !== undefined) {
    if (typeof raw.tolerance !== 'number' || !Number.isFinite(raw.tolerance) || raw.tolerance < 0) {
      fail('"tolerance" must be a number of 0 or more.', 'tolerance');
    } else {
      tolerance = raw.tolerance;
      if (tolerance > 0.5) {
        warn(
          `A tolerance of ${tolerance} is very wide; unrelated colors will match. ` +
            '0.02 is about a just-noticeable difference.',
          'tolerance'
        );
      }
    }
  }

  // --- defaultNotation -----------------------------------------------------
  let defaultNotation: OutputNotation | undefined;
  if (raw.defaultNotation !== undefined) {
    if (!isOutputNotation(raw.defaultNotation)) {
      fail(
        `"defaultNotation" must be one of: ${OUTPUT_NOTATIONS.join(', ')}.`,
        'defaultNotation'
      );
    } else {
      defaultNotation = raw.defaultNotation;
    }
  }

  // --- exclude -------------------------------------------------------------
  const exclude: string[] = [];
  if (raw.exclude !== undefined) {
    if (!Array.isArray(raw.exclude)) {
      fail('"exclude" must be an array of glob strings.', 'exclude');
    } else {
      raw.exclude.forEach((entry, i) => {
        if (typeof entry !== 'string') fail('Each "exclude" entry must be a string.', 'exclude', i);
        else exclude.push(entry);
      });
    }
  }

  // --- rules ---------------------------------------------------------------
  const rules: MappingRule[] = [];

  if (raw.rules === undefined) {
    fail('A mapping file must have a "rules" array.');
    return { mapping: null, problems };
  }
  if (!Array.isArray(raw.rules)) {
    fail('"rules" must be an array.', 'rules');
    return { mapping: null, problems };
  }
  if (raw.rules.length === 0) {
    warn('"rules" is empty, so applying this mapping would change nothing.', 'rules');
  }

  raw.rules.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail('Each rule must be an object with "from" and "to".', 'rules', i);
      return;
    }

    const rule = entry as Record<string, unknown>;
    let ok = true;

    if (typeof rule.from !== 'string') {
      fail('"from" must be a color string.', 'rules', i, 'from');
      ok = false;
    } else if (parseColor(rule.from) === null) {
      fail(`"${rule.from}" is not a color Chromuta can read.`, 'rules', i, 'from');
      ok = false;
    }

    if (typeof rule.to !== 'string') {
      fail('"to" must be a color string.', 'rules', i, 'to');
      ok = false;
    } else if (parseColor(rule.to) === null) {
      fail(`"${rule.to}" is not a color Chromuta can write.`, 'rules', i, 'to');
      ok = false;
    }

    let ruleTolerance: number | undefined;
    if (rule.tolerance !== undefined) {
      if (typeof rule.tolerance !== 'number' || !Number.isFinite(rule.tolerance) || rule.tolerance < 0) {
        fail('Rule "tolerance" must be a number of 0 or more.', 'rules', i, 'tolerance');
        ok = false;
      } else {
        ruleTolerance = rule.tolerance;
      }
    }

    if (!ok) return;

    rules.push({
      from: rule.from as string,
      to: rule.to as string,
      ...(ruleTolerance === undefined ? {} : { tolerance: ruleTolerance })
    });
  });

  reportRuleConflicts(raw.rules, rules, tolerance, problems, root);

  return {
    mapping: { version: MAPPING_VERSION, defaultNotation, tolerance, rules, exclude },
    problems
  };
}

/**
 * Flag rules that would compete for the same literal.
 *
 * Two rules with the same `from` can never both apply, so that is an error. Two rules
 * whose `from` colors sit inside each other's tolerance are reported as a warning
 * here, because at apply time they produce an ambiguity that stops the rewrite.
 */
function reportRuleConflicts(
  rawRules: readonly unknown[],
  rules: readonly MappingRule[],
  mappingTolerance: number,
  problems: MappingProblem[],
  root: Node
): void {
  const parsed = rules.map((rule) => ({
    rule,
    color: parseColor(rule.from)!,
    tolerance: rule.tolerance ?? mappingTolerance
  }));

  // Rule indices in `rules` can differ from the source array when entries were
  // rejected, so locate each by matching its `from` text in the original.
  const sourceIndex = (rule: MappingRule): number =>
    rawRules.findIndex(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as Record<string, unknown>).from === rule.from &&
        (entry as Record<string, unknown>).to === rule.to
    );

  const seen = new Map<string, MappingRule>();

  for (const { rule, color } of parsed) {
    const key = colorKey(color);
    const previous = seen.get(key);
    if (previous) {
      const i = sourceIndex(rule);
      problems.push({
        ...span(findNodeAtLocation(root, ['rules', i, 'from']) ?? root),
        message: `Duplicate "from" color; an earlier rule already maps ${previous.from} to ${previous.to}.`,
        severity: 'error'
      });
    } else {
      seen.set(key, rule);
    }
  }

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i]!;
      const b = parsed[j]!;
      if (colorKey(a.color) === colorKey(b.color)) continue;

      const distance = colorDistance(a.color, b.color);
      const limit = Math.max(a.tolerance, b.tolerance);
      if (limit > 0 && distance <= limit) {
        problems.push({
          ...span(findNodeAtLocation(root, ['rules', sourceIndex(b.rule), 'from']) ?? root),
          message:
            `${b.rule.from} is within tolerance of ${a.rule.from} (ΔE ${distance.toFixed(4)}). ` +
            'A color near both will be reported as ambiguous and left unchanged. ' +
            'Lower the tolerance or set "tolerance": 0 on one of these rules.',
          severity: 'warning'
        });
      }
    }
  }
}

function span(node: Node): { offset: number; length: number } {
  return { offset: node.offset, length: Math.max(1, node.length) };
}
