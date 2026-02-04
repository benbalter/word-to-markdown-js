import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't empty dist as build:pages writes there
    rollupOptions: {
      output: {
        // Use simple file names for output
        entryFileNames: 'main.js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      './main.js': './src/main.ts',
    },
  },
});
