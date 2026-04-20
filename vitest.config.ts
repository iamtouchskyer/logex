import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    exclude: ['e2e/**', '**/node_modules/**', '.claude/**', 'vscode-extension/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      exclude: [
        '**/node_modules/**',
        '**/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        'e2e/**',
        '.claude/**',
        'vscode-extension/**',
        'src/test-setup.ts',
        'src/main.tsx',
        'src/index.ts',
        'src/index.css',
        'src/types/**',
        'src/bin/**',
        'src/lib/storage/types.ts',
        'src/lib/storage/index.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 90,
        branches: 85,
        statements: 90,
        functions: 90,
      },
    },
  },
})
