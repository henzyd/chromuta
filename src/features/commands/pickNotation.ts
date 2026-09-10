import * as vscode from 'vscode';
import type { AnyOutputNotation, Color, FormatOptions } from '../../core/color/types.js';
import { formatAny, isLossyAny, notationLabel } from '../../core/notation.js';

export interface NotationChoice {
  readonly notation: AnyOutputNotation;
  readonly text: string;
  readonly lossy: boolean;
}

interface NotationItem extends vscode.QuickPickItem {
  readonly choice: NotationChoice;
}

/**
 * Offer conversion targets, each previewed as the exact string that will be written.
 *
 * Notations that cannot represent the color are omitted rather than shown as a
 * silently different value.
 */
export async function pickNotation(
  color: Color,
  notations: readonly AnyOutputNotation[],
  options: FormatOptions,
  title: string
): Promise<NotationChoice | undefined> {
  const items: NotationItem[] = [];

  for (const notation of notations) {
    const text = formatAny(color, notation, options);
    if (text === null) continue;

    const lossy = isLossyAny(color, notation);
    items.push({
      label: text,
      description: notationLabel(notation),
      detail: lossy
        ? 'Outside the sRGB gamut. Chroma will be reduced to fit, so this is not reversible.'
        : undefined,
      choice: { notation, text, lossy }
    });
  }

  if (items.length === 0) {
    void vscode.window.showWarningMessage(
      'Chromuta: no enabled notation can represent this color.'
    );
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(items, {
    title,
    placeHolder: 'Choose the target notation'
  });

  return picked?.choice;
}
