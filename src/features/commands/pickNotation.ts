import * as vscode from 'vscode';
import { formatColor, isLossyConversion } from '../../core/color/format.js';
import type { Color, FormatOptions, OutputNotation } from '../../core/color/types.js';

export interface NotationChoice {
  readonly notation: OutputNotation;
  readonly text: string;
  readonly lossy: boolean;
}

interface NotationItem extends vscode.QuickPickItem {
  readonly choice: NotationChoice;
}

/**
 * Offer the enabled notations, each previewed as the exact string that will be
 * written. Notations that cannot represent the color are omitted rather than shown
 * as a silently different value.
 */
export async function pickNotation(
  color: Color,
  notations: readonly OutputNotation[],
  options: FormatOptions,
  title: string
): Promise<NotationChoice | undefined> {
  const items: NotationItem[] = [];

  for (const notation of notations) {
    const text = formatColor(color, notation, options);
    if (text === null) continue;

    const lossy = isLossyConversion(color, notation);
    items.push({
      label: text,
      description: notation,
      detail: lossy
        ? 'Outside the sRGB gamut. Chroma will be reduced to fit, so this is not reversible.'
        : undefined,
      choice: { notation, text, lossy }
    });
  }

  if (items.length === 0) {
    void vscode.window.showWarningMessage('Chromuta: no enabled notation can represent this color.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title,
    placeHolder: 'Choose the target notation'
  });

  return picked?.choice;
}
