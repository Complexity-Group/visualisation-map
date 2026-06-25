import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  source: {
    // Explicitly defines the TypeScript compilation entry point
    entry: {
      index: './src/index.ts',
    },
  },
  html: {
    // Defines the source HTML template to inject assets into
    template: './src/index.html',
  },
  output: {
    // Forces the bundler to emit scripts inline within <script> tags
    inlineScripts: true,
    // Forces the bundler to emit styles inline within <style> tags
    inlineStyles: true,
    // Disables the generation of external source maps in production
    sourceMap: {
      js: false,
      css: false,
    },
  },
});