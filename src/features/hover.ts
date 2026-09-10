import * as vscode from 'vscode';
import { formatColor, isLossyConversion } from '../core/color/format.js';
import { colorKey } from '../core/color/distance.js';
import { matchAtOffset } from '../core/detect/scanText.js';
import { readConfig } from '../config.js';
import type { ColorIndex } from '../workspace/index.js';
import { rangeOf, scanDocument } from './documentScan.js';

/**
 * A conversion table for the color under the cursor, plus how often it appears
 * elsewhere in the workspace.
 *
 * There is deliberately no swatch here: the color decorator already draws one
 * directly beside the literal, so repeating it in the hover would only add a second
 * thing that can fail to load.
 */
export class ChromutaHoverProvider implements vscode.HoverProvider {
  constructor(private readonly index: ColorIndex) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    if (token.isCancellationRequested) return undefined;

    const config = readConfig(document.uri);
    if (!config.hoverEnabled) return undefined;

    const { matches, formatOptions } = scanDocument(document, config);
    const match = matchAtOffset(matches, document.offsetAt(position));
    if (!match) return undefined;

    const markdown = new vscode.MarkdownString();
    // Required for the command link at the end to be clickable.
    markdown.isTrusted = true;

    markdown.appendMarkdown(`**${match.text}** · \`${match.notation}\`\n\n`);

    const rows: string[] = [];
    for (const notation of config.notations) {
      if (notation === match.notation) continue;
      const text = formatColor(match.color, notation, formatOptions);
      if (text === null) continue;
      const lossy = isLossyConversion(match.color, notation) ? ' ⚠︎' : '';
      rows.push(`| \`${notation}\` | \`${text}\`${lossy} |`);
    }

    if (rows.length > 0) {
      markdown.appendMarkdown('| | |\n|---|---|\n' + rows.join('\n') + '\n\n');
    }

    if (rows.some((row) => row.includes('⚠︎'))) {
      markdown.appendMarkdown('⚠︎ outside sRGB; converting reduces chroma permanently\n\n');
    }

    if (match.confidence < config.confidenceThreshold) {
      markdown.appendMarkdown(
        `_Low confidence (${match.confidence.toFixed(2)}), excluded from bulk conversion:_ ` +
          `${match.flags.join(', ')}\n\n`
      );
    }

    appendWorkspaceUsage(markdown, this.index, match.color, config.confidenceThreshold);

    return new vscode.Hover(markdown, rangeOf(document, match));
  }
}

function appendWorkspaceUsage(
  markdown: vscode.MarkdownString,
  index: ColorIndex,
  color: Parameters<typeof colorKey>[0],
  threshold: number
): void {
  const key = colorKey(color);
  const entry = index.find(key, threshold);
  if (!entry || entry.occurrences.length <= 1) return;

  const args = encodeURIComponent(JSON.stringify([key]));
  markdown.appendMarkdown(
    `Used ${entry.occurrences.length} times in ${entry.fileCount} file` +
      `${entry.fileCount === 1 ? '' : 's'} · ` +
      `[convert everywhere](command:chromuta.convertColorEverywhere?${args})`
  );
}
