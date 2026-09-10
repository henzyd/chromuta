/**
 * Load the built bundle against a stubbed editor API and assert that activation
 * registers what it should.
 *
 * This exists because a bundle can compile perfectly and still fail the moment it is
 * loaded. A dependency whose CommonJS entry calls require() through a function
 * parameter cannot be traced by any bundler: the build succeeds, and the extension
 * throws "Cannot find module" on activation. Nothing else in CI catches that.
 *
 * Run after `npm run build`:  node .github/scripts/smoke.mjs
 */
import { createRequire } from 'node:module';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundle = path.join(root, 'dist', 'extension.js');

const seen = {
  commands: [],
  colorProviders: 0,
  hoverProviders: 0,
  codeActionProviders: 0,
  treeViews: [],
  watchers: 0,
  diagnosticCollections: [],
  contextKeys: {},
  disposables: 0
};

const noop = () => ({ dispose() {} });
const emitter = () => ({ event: noop, fire() {}, dispose() {} });

const vscode = {
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    createTreeView: (id) => {
      seen.treeViews.push(id);
      return { description: undefined, dispose() {} };
    },
    onDidChangeActiveTextEditor: noop,
    activeTextEditor: undefined,
    withProgress: (_options, task) => task({ report() {} }, { isCancellationRequested: false }),
    showInformationMessage: noop,
    showWarningMessage: noop,
    showErrorMessage: noop,
    showQuickPick: noop,
    showTextDocument: noop
  },
  commands: {
    registerCommand: (id) => {
      seen.commands.push(id);
      return { dispose() {} };
    },
    executeCommand: (command, key, value) => {
      if (command === 'setContext') seen.contextKeys[key] = value;
      return Promise.resolve();
    }
  },
  languages: {
    registerColorProvider: () => {
      seen.colorProviders++;
      return { dispose() {} };
    },
    registerHoverProvider: () => {
      seen.hoverProviders++;
      return { dispose() {} };
    },
    registerCodeActionsProvider: () => {
      seen.codeActionProviders++;
      return { dispose() {} };
    },
    createDiagnosticCollection: (name) => {
      seen.diagnosticCollections.push(name);
      return { set() {}, delete() {}, clear() {}, dispose() {} };
    }
  },
  workspace: {
    getConfiguration: () => ({ get: (_key, fallback) => fallback, inspect: () => ({}) }),
    onDidChangeConfiguration: noop,
    onDidChangeTextDocument: noop,
    onDidCloseTextDocument: noop,
    onDidOpenTextDocument: noop,
    createFileSystemWatcher: () => {
      seen.watchers++;
      return { onDidCreate: noop, onDidChange: noop, onDidDelete: noop, dispose() {} };
    },
    textDocuments: [],
    workspaceFolders: [],
    asRelativePath: (uri) => (typeof uri === 'string' ? uri : uri.fsPath),
    openTextDocument: async () => ({}),
    applyEdit: async () => true,
    findFiles: async () => [],
    fs: {
      stat: async () => ({}),
      readFile: async () => new Uint8Array(),
      writeFile: async () => {},
      createDirectory: async () => {}
    }
  },
  env: { clipboard: { writeText: async () => {} } },
  EventEmitter: class {
    constructor() {
      return emitter();
    }
  },
  Disposable: class {
    constructor(fn) {
      this.dispose = fn ?? (() => {});
    }
  },
  Uri: {
    file: (p) => ({ fsPath: p, toString: () => p }),
    joinPath: (base, ...parts) => ({ ...base, path: [base.path, ...parts].join('/') })
  },
  Range: class {},
  Position: class {},
  TextEdit: class {},
  WorkspaceEdit: class {
    replace() {}
  },
  TreeItem: class {
    constructor(label, state) {
      this.label = label;
      this.collapsibleState = state;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(id) {
      this.id = id;
    }
  },
  MarkdownString: class {
    appendMarkdown() {
      return this;
    }
  },
  CodeAction: class {},
  CodeActionKind: { RefactorRewrite: 'refactor.rewrite' },
  ColorInformation: class {},
  Color: class {},
  ColorPresentation: class {},
  Diagnostic: class {},
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  ProgressLocation: { Notification: 15 }
};
vscode.ThemeIcon.File = new vscode.ThemeIcon('file');

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return vscode;
  return originalLoad.call(this, request, ...rest);
};

const extension = require(bundle);

extension.activate({
  subscriptions: {
    push: (...items) => {
      seen.disposables += items.length;
    }
  },
  workspaceState: { get: () => undefined, update: async () => {} },
  globalStorageUri: { scheme: 'file', path: '/tmp/chromuta' }
});
extension.deactivate();

// The contributed commands must all actually be registered, or they appear in the
// palette and then fail when invoked.
const contributed = require(path.join(root, 'package.json')).contributes.commands.map(
  (command) => command.command
);

const failures = [];

const missing = contributed.filter((id) => !seen.commands.includes(id));
if (missing.length > 0) failures.push(`contributed but not registered: ${missing.join(', ')}`);

const extra = seen.commands.filter((id) => !contributed.includes(id));
if (extra.length > 0) failures.push(`registered but not contributed: ${extra.join(', ')}`);

const expected = {
  colorProviders: 1,
  hoverProviders: 1,
  codeActionProviders: 1,
  watchers: 1
};
for (const [key, count] of Object.entries(expected)) {
  if (seen[key] !== count) failures.push(`${key}: expected ${count}, got ${seen[key]}`);
}

if (seen.treeViews.length !== 1) {
  failures.push(`tree views: expected 1, got ${seen.treeViews.length}`);
}
if (seen.diagnosticCollections.length !== 1) {
  failures.push(`diagnostic collections: expected 1, got ${seen.diagnosticCollections.length}`);
}
if (typeof extension.activate !== 'function' || typeof extension.deactivate !== 'function') {
  failures.push('bundle does not export both activate and deactivate');
}

console.log(`commands registered: ${seen.commands.length}`);
console.log(`tree views: ${seen.treeViews.join(', ')}`);
console.log(
  `providers: color=${seen.colorProviders} hover=${seen.hoverProviders} ` +
    `codeAction=${seen.codeActionProviders}`
);
console.log(`file watchers: ${seen.watchers}`);
console.log(`diagnostic collections: ${seen.diagnosticCollections.join(', ')}`);
console.log(`disposables: ${seen.disposables}`);

if (failures.length > 0) {
  console.error('\nsmoke test failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('\nsmoke test passed');
