import type { CommentRanges, RawMatch, ScanContext } from './types.js';

/** Languages where a bare `red` is far more likely to be a color than an identifier. */
const CSS_FAMILY = new Set(['css', 'scss', 'less', 'sass', 'postcss', 'stylus']);

/** Languages that embed CSS alongside other code, so named colors are plausible but weaker. */
const CSS_EMBEDDING = new Set(['html', 'vue', 'svelte', 'astro', 'markdown']);

const JS_FAMILY = new Set([
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'vue',
  'svelte'
]);

const PREPROCESSOR =
  /^\s*#\s*(include|define|if|ifdef|ifndef|elif|endif|pragma|import|error|warning|undef)\b/;

const VCS_CONTEXT = /\b(commit|sha|hash|revision|rev|checksum|digest|etag)\b/i;

const URL_CONTEXT = /(href\s*=|src\s*=|url\s*\(|https?:\/\/|\]\()[^\s]*$/i;

const FIXTURE_PATH = /(__snapshots__|__fixtures__|\.snap$|[/\\]fixtures?[/\\]|\.test\.|\.spec\.)/i;

/**
 * Words that make a raw integer literal plausibly a color.
 *
 * `0xFF3B82F6` is a valid ARGB color and an equally valid bitmask. Nothing in the
 * literal itself distinguishes them, so the surrounding identifier is the only signal
 * available short of parsing the file.
 *
 * Matched as substrings rather than whole words, because the names that carry the
 * signal are overwhelmingly camelCase: `brandColor` and `surfaceTint` contain no word
 * boundary before `Color` or `Tint`. Being generous is the right error here, since
 * this evidence only ever raises confidence.
 */
const COLOR_CONTEXT =
  /colou?r|tint|shade|swatch|palette|theme|brand|background|foreground|fill|stroke|border|accent|surface|primary|secondary|scaffold|material|argb|rgba?/i;

export interface Scored {
  confidence: number;
  flags: string[];
}

/**
 * Score a raw match from 1.0 downward.
 *
 * Regex detection produces real false positives: git hashes, URL fragments, C
 * preprocessor directives, JavaScript private fields, and the many CSS color names
 * that are also ordinary English words. Rather than dropping ambiguous hits or
 * rewriting them blindly, each one carries a score, and anything below the
 * configured threshold is surfaced for review instead of bulk-edited.
 */
export function scoreMatch(
  match: RawMatch,
  text: string,
  context: ScanContext,
  comments: CommentRanges
): Scored {
  let confidence = 1;
  const flags: string[] = [];

  const penalize = (amount: number, flag: string): void => {
    confidence -= amount;
    flags.push(flag);
  };

  const lineStart = text.lastIndexOf('\n', match.start - 1) + 1;
  const lineEnd = (() => {
    const i = text.indexOf('\n', match.end);
    return i === -1 ? text.length : i;
  })();
  const line = text.slice(lineStart, lineEnd);
  const before = text.slice(lineStart, match.start);
  const after = text.slice(match.end, lineEnd);

  // Functional notations are unambiguous; only hex and named words need the full battery.
  const isHex = match.notation === 'hex';
  const isNamed = match.notation === 'named';

  if (isHex) {
    if (PREPROCESSOR.test(line)) {
      penalize(1, 'preprocessor directive');
    }

    if (VCS_CONTEXT.test(text.slice(Math.max(0, match.start - 24), match.start))) {
      penalize(0.9, 'looks like a revision hash');
    }

    if (URL_CONTEXT.test(before)) {
      penalize(0.9, 'inside a URL or link target');
    }

    if (context.languageId && JS_FAMILY.has(context.languageId)) {
      // `this.#abc` and `#dead = 1` are private fields, not colors.
      if (before.endsWith('.')) {
        penalize(0.8, 'private class field access');
      } else if (/^\s*[=(;]/.test(after) && /[{;}]\s*$|^\s*$/.test(before)) {
        penalize(0.6, 'looks like a private class field');
      }
    }
  }

  if (isNamed) {
    const lang = context.languageId;
    if (lang && CSS_FAMILY.has(lang)) {
      // No language penalty.
    } else if (lang && CSS_EMBEDDING.has(lang)) {
      penalize(0.3, 'named color in a mixed-content file');
    } else {
      penalize(0.6, 'named color outside a stylesheet');
    }

    // A color keyword should sit on the value side of a declaration or assignment.
    if (!/[:=]\s*[^:=]*$/.test(before)) {
      penalize(0.4, 'not in a property-value position');
    }
  }

  // A bare `0x…` integer carries no syntax that says "color". Matches inside
  // `Color(0x…)` are claimed by a longer pattern, so anything reaching here is
  // genuinely bare and only the surrounding line can vouch for it.
  if (match.notation === 'argb-hex') {
    if (!COLOR_CONTEXT.test(line)) {
      penalize(0.55, 'bare integer literal with nothing to suggest it is a color');
    }
  }

  if (comments.contains(match.start)) {
    penalize(0.2, 'inside a comment');
  }

  if (context.filePath && FIXTURE_PATH.test(context.filePath)) {
    penalize(0.3, 'test fixture or snapshot');
  }

  return { confidence: Math.min(1, Math.max(0, confidence)), flags };
}
