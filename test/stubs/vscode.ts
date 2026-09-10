/**
 * Minimal stand-in for the `vscode` module, aliased in by vitest.
 *
 * The engine under src/core never imports vscode, but src/workspace deliberately
 * does, and its palette grouping is real logic worth testing. This provides just
 * enough surface for those modules to load outside an extension host.
 */

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string
  ) {}

  static file(fsPath: string): Uri {
    return new Uri('file', fsPath);
  }

  static parse(value: string): Uri {
    return new Uri('file', value.replace(/^file:\/\//, ''));
  }

  static joinPath(base: Uri, ...parts: string[]): Uri {
    return new Uri(base.scheme, [base.fsPath, ...parts].join('/'));
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export class EventEmitter<T> {
  private listeners: ((value: T) => void)[] = [];

  readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.push(listener);
    return new Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    });
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }

  dispose(): void {
    this.listeners = [];
  }
}

export class Disposable {
  constructor(private readonly callback: () => void = () => {}) {}
  dispose(): void {
    this.callback();
  }
}

export const workspace = {
  asRelativePath(uri: Uri | string): string {
    const value = typeof uri === 'string' ? uri : uri.fsPath;
    return value.replace(/^\/?workspace\//, '');
  },
  textDocuments: [] as unknown[],
  getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback, inspect: () => undefined })
};
