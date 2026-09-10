import * as vscode from 'vscode';
import { colorFromRgb } from '../core/color/parse.js';
import { matchAtOffset } from '../core/detect/scanText.js';
import { formatAny, notationsForMatch } from '../core/notation.js';
import { clampToSrgbGamut } from '../core/color/gamut.js';
import type { AnyOutputNotation } from '../core/color/types.js';
import { readConfig, type ChromutaConfig } from '../config.js';
import { dialectContextFor, rangeOf, scanDocument, type DocumentScan } from './documentScan.js';

/**
 * Draws a swatch next to every detected color and populates the built-in color
 * picker.
 *
 * This is the highest-leverage integration available: implementing
 * `provideColorPresentations` means single-color conversion reuses VS Code's own
 * picker UI, so Chromuta ships that feature without building any interface for it.
 */
export class ChromutaColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ColorInformation[] {
    if (token.isCancellationRequested) return [];

    const config = readConfig(document.uri);
    const { matches } = scanDocument(document, config);

    const result: vscode.ColorInformation[] = [];
    for (const match of matches) {
      if (match.confidence < config.confidenceThreshold) continue;
      const rgb = clampToSrgbGamut(match.color.ok);
      result.push(
        new vscode.ColorInformation(
          rangeOf(document, match),
          new vscode.Color(rgb.r, rgb.g, rgb.b, match.color.alpha)
        )
      );
    }
    return result;
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
    token: vscode.CancellationToken
  ): vscode.ColorPresentation[] {
    if (token.isCancellationRequested) return [];

    const config = readConfig(context.document.uri);
    const scan = scanDocument(context.document, config);
    const parsed = colorFromRgb({ r: color.red, g: color.green, b: color.blue }, color.alpha);

    const presentations: vscode.ColorPresentation[] = [];
    for (const notation of orderNotations(config, context, scan)) {
      const text = formatAny(parsed, notation, scan.formatOptions);
      // `named` yields null when no keyword matches exactly. Offering it anyway
      // would emit hex under a "named" label, so it is skipped instead.
      if (text === null) continue;

      const presentation = new vscode.ColorPresentation(text);
      presentation.textEdit = new vscode.TextEdit(context.range, text);
      presentations.push(presentation);
    }
    return presentations;
  }
}

/**
 * The first presentation is what the picker applies while the user drags, so the
 * notation already in the file leads. Dragging a hex value should not silently
 * rewrite it as oklch.
 */
function orderNotations(
  config: ChromutaConfig,
  context: { document: vscode.TextDocument; range: vscode.Range },
  scan: DocumentScan
): AnyOutputNotation[] {
  // The notation comes from the scan rather than from re-parsing the text, because the
  // CSS parser cannot read a dialect literal: asking it about `Color(0xFF3B82F6)`
  // returns nothing, and the picker would then lead with CSS notations in a Dart file.
  const offset = context.document.offsetAt(context.range.start);
  const current = matchAtOffset(scan.matches, offset)?.notation;

  // Whatever the literal already is leads the list, and its own idiom follows, so a
  // Dart color offers the other Flutter forms before it offers hsl().
  const enabled = notationsForMatch(
    current ?? 'hex',
    dialectContextFor(context.document),
    config.dialects,
    config.notations
  );

  if (!current) return enabled;

  const index = enabled.indexOf(current as AnyOutputNotation);
  if (index <= 0) return enabled;

  return [enabled[index]!, ...enabled.slice(0, index), ...enabled.slice(index + 1)];
}
