import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Vitest stubs CSS imports to empty modules by default, which also empties `?raw`. The motion
    // contract asserts against the stylesheet text, so it needs the real thing.
    css: true,
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'shared/**/*.test.ts', 'supabase/functions/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
