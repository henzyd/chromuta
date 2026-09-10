const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    // Prefer each dependency's ESM entry. esbuild defaults to `main` on the node
    // platform, and jsonc-parser's `main` is a UMD bundle whose require() goes
    // through a function parameter, which no bundler can trace: the result builds
    // fine and then throws "Cannot find module './impl/format'" at load time.
    mainFields: ['module', 'main'],
    sourcemap: !production,
    minify: production,
    logLevel: 'info'
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
