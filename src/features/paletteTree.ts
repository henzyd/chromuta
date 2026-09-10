import * as path from 'path';
import * as vscode from 'vscode';
import { formatAny, notationLabel } from '../core/notation.js';
import { readConfig } from '../config.js';
import type { ColorIndex, Occurrence, PaletteEntry } from '../workspace/index.js';
import type { SwatchProvider } from './swatches.js';

export const PALETTE_VIEW_ID = 'chromuta.palette';

/** Marks a color node for the `viewItem ==` clauses in the view's context menu. */
export const COLOR_CONTEXT_VALUE = 'chromutaColor';

interface ReviewGroupNode {
  readonly kind: 'reviewGroup';
  readonly count: number;
}

interface ColorNode {
  readonly kind: 'color';
  readonly entry: PaletteEntry;
  readonly needsReview: boolean;
}

interface OccurrenceNode {
  readonly kind: 'occurrence';
  readonly occurrence: Occurrence;
}

export type PaletteNode = ReviewGroupNode | ColorNode | OccurrenceNode;

/**
 * The workspace palette.
 *
 * Confident colors sit at the root, ordered by how often they appear, because that is
 * the order someone auditing hard-coded colors wants. Low-confidence matches are
 * collected under a single "Needs review" node at the top rather than mixed in, so
 * the regex-first approach stays honest about what it is unsure of.
 */
export class PaletteTreeProvider implements vscode.TreeDataProvider<PaletteNode> {
  private readonly changeEmitter = new vscode.EventEmitter<PaletteNode | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly index: ColorIndex,
    private readonly swatches: SwatchProvider
  ) {}

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  getChildren(element?: PaletteNode): PaletteNode[] {
    const threshold = readConfig().confidenceThreshold;

    if (!element) {
      const { palette, review } = this.index.groups(threshold);
      const nodes: PaletteNode[] = [];
      if (review.length > 0) {
        nodes.push({ kind: 'reviewGroup', count: review.length });
      }
      nodes.push(
        ...palette.map((entry) => ({ kind: 'color' as const, entry, needsReview: false }))
      );
      return nodes;
    }

    if (element.kind === 'reviewGroup') {
      return this.index
        .groups(threshold)
        .review.map((entry) => ({ kind: 'color' as const, entry, needsReview: true }));
    }

    if (element.kind === 'color') {
      return element.entry.occurrences.map((occurrence) => ({ kind: 'occurrence', occurrence }));
    }

    return [];
  }

  async getTreeItem(node: PaletteNode): Promise<vscode.TreeItem> {
    switch (node.kind) {
      case 'reviewGroup':
        return reviewGroupItem(node);
      case 'color':
        return this.colorItem(node);
      case 'occurrence':
        return occurrenceItem(node);
    }
  }

  private async colorItem(node: ColorNode): Promise<vscode.TreeItem> {
    const config = readConfig();
    const label =
      formatAny(node.entry.color, config.defaultNotation, config.format) ??
      formatAny(node.entry.color, 'hex', config.format) ??
      node.entry.key;

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    const count = node.entry.occurrences.length;
    item.description = `${count}× in ${node.entry.fileCount} file${node.entry.fileCount === 1 ? '' : 's'}`;
    item.iconPath = await this.swatches.iconFor(node.entry.color);
    item.tooltip = await colorTooltip(node.entry, config);
    // Only confident colors get the convert-everywhere action, matching what bulk
    // conversion would actually touch.
    item.contextValue = node.needsReview ? 'chromutaReviewColor' : COLOR_CONTEXT_VALUE;
    item.id = `color:${node.needsReview ? 'r' : 'p'}:${node.entry.key}`;
    return item;
  }
}

function reviewGroupItem(node: ReviewGroupNode): vscode.TreeItem {
  const item = new vscode.TreeItem('Needs review', vscode.TreeItemCollapsibleState.Collapsed);
  item.description = `${node.count} color${node.count === 1 ? '' : 's'}`;
  item.iconPath = new vscode.ThemeIcon('warning');
  item.tooltip = new vscode.MarkdownString(
    'These parsed as colors but scored below `chromuta.confidenceThreshold`.\n\n' +
      'Bulk conversion leaves them alone. Common causes are revision hashes, URL ' +
      'fragments, preprocessor directives, and color keywords used as identifiers.'
  );
  item.contextValue = 'chromutaReviewGroup';
  item.id = 'group:review';
  return item;
}

function occurrenceItem(node: OccurrenceNode): vscode.TreeItem {
  const { uri, match } = node.occurrence;
  const relative = vscode.workspace.asRelativePath(uri, false);

  const item = new vscode.TreeItem(path.basename(relative), vscode.TreeItemCollapsibleState.None);
  item.description = `${path.dirname(relative) === '.' ? '' : path.dirname(relative) + ' · '}line ${match.startLine + 1}`;
  item.resourceUri = uri;
  item.iconPath = vscode.ThemeIcon.File;

  const range = new vscode.Range(
    match.startLine,
    match.startColumn,
    match.endLine,
    match.endColumn
  );

  item.command = {
    command: 'vscode.open',
    title: 'Reveal color',
    arguments: [uri, { selection: range, preview: true } satisfies vscode.TextDocumentShowOptions]
  };

  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown(`\`${match.text}\` in \`${relative}\`\n\n`);
  tooltip.appendMarkdown(
    `${notationLabel(match.notation)} · confidence ${match.confidence.toFixed(2)}`
  );
  if (match.flags.length > 0) {
    tooltip.appendMarkdown(`\n\n${match.flags.map((f) => `- ${f}`).join('\n')}`);
  }
  item.tooltip = tooltip;

  return item;
}

async function colorTooltip(
  entry: PaletteEntry,
  config: ReturnType<typeof readConfig>
): Promise<vscode.MarkdownString> {
  const tooltip = new vscode.MarkdownString();
  for (const notation of config.notations) {
    const text = formatAny(entry.color, notation, config.format);
    if (text) tooltip.appendMarkdown(`\`${text}\`\n\n`);
  }
  tooltip.appendMarkdown(
    `${entry.occurrences.length} occurrence${entry.occurrences.length === 1 ? '' : 's'}`
  );
  return tooltip;
}

/**
 * Create the view and keep its title description in sync with the index, so the
 * headline count is visible without expanding anything.
 */
export function registerPaletteView(
  index: ColorIndex,
  swatches: SwatchProvider
): { provider: PaletteTreeProvider; disposables: vscode.Disposable[] } {
  const provider = new PaletteTreeProvider(index, swatches);
  const view = vscode.window.createTreeView<PaletteNode>(PALETTE_VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true
  });

  const update = (): void => {
    const stats = index.stats(readConfig().confidenceThreshold);
    view.description =
      stats.matchCount === 0
        ? undefined
        : `${stats.colorCount} colors · ${stats.matchCount} uses · ${stats.fileCount} files`;
    void vscode.commands.executeCommand('setContext', 'chromuta.hasIndex', !index.isEmpty);
    provider.refresh();
  };

  update();

  return { provider, disposables: [view, index.onDidChange(update)] };
}
