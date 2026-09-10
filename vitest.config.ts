import * as path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    alias: {
      // src/core never imports vscode. src/workspace does, by design, and its palette
      // grouping is worth testing, so tests get a minimal stub instead of a host.
      vscode: path.resolve(__dirname, 'test/stubs/vscode.ts')
    }
  }
});
