import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.ts',
      'src/**/*.{test,spec}.tsx',
      // Pure Edge Function modules (no Deno/URL imports) are tested here too
      'supabase/functions/_shared/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist', 'src-tauri'],
  },
})
