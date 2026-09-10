import * as vscode from 'vscode';
import { clampToSrgbGamut } from '../core/color/gamut.js';
import type { Color } from '../core/color/types.js';
import { logError } from '../logging.js';

/**
 * Renders color swatches as SVG files on disk and hands back their URIs.
 *
 * `TreeItem.iconPath` needs a real resource, and `ThemeColor` only accepts registered
 * theme color ids rather than arbitrary values, so an on-disk file is the way to show
 * a swatch for a color the theme has never heard of.
 */
export class SwatchProvider {
  private readonly written = new Set<string>();
  private ready: Promise<void> | undefined;

  constructor(private readonly storage: vscode.Uri) {}

  /** URI of a 16px swatch for this color, writing the file on first use. */
  async iconFor(color: Color): Promise<vscode.Uri | undefined> {
    try {
      await this.ensureDirectory();

      const name = fileName(color);
      const uri = vscode.Uri.joinPath(this.storage, name);

      if (!this.written.has(name)) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(svg(color), 'utf8'));
        this.written.add(name);
      }

      return uri;
    } catch (error) {
      // A swatch is decoration. Losing it should not empty the tree.
      logError('swatch', error);
      return undefined;
    }
  }

  private ensureDirectory(): Promise<void> {
    this.ready ??= Promise.resolve(vscode.workspace.fs.createDirectory(this.storage));
    return this.ready;
  }
}

function bytes(color: Color): { r: number; g: number; b: number; a: number } {
  const rgb = clampToSrgbGamut(color.ok);
  const to255 = (v: number): number => Math.round(v * 255);
  return { r: to255(rgb.r), g: to255(rgb.g), b: to255(rgb.b), a: to255(color.alpha) };
}

function fileName(color: Color): string {
  const { r, g, b, a } = bytes(color);
  const hex = (v: number): string => v.toString(16).padStart(2, '0');
  return `swatch-${hex(r)}${hex(g)}${hex(b)}${hex(a)}.svg`;
}

function svg(color: Color): string {
  const { r, g, b, a } = bytes(color);
  const fill = `rgb(${r},${g},${b})`;
  const opacity = (a / 255).toFixed(3);

  // Transparency is drawn over a checker so a 20%-alpha white is distinguishable
  // from an opaque white.
  const checker =
    a < 255
      ? '<rect width="16" height="16" fill="#ffffff"/>' +
        '<path d="M0 0h8v8H0zM8 8h8v8H8z" fill="#c8c8c8"/>'
      : '';

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
    '<clipPath id="c"><rect x="1" y="1" width="14" height="14" rx="3"/></clipPath>' +
    `<g clip-path="url(#c)">${checker}` +
    `<rect width="16" height="16" fill="${fill}" fill-opacity="${opacity}"/></g>` +
    '<rect x="1" y="1" width="14" height="14" rx="3" fill="none" ' +
    'stroke="#000000" stroke-opacity="0.25"/></svg>'
  );
}
