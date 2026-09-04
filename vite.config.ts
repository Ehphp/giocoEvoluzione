import { execFileSync } from 'node:child_process'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

function resolveBuildId(): string {
  const configuredBuildId = process.env.VITE_BUILD_ID
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.CF_PAGES_COMMIT_SHA
    ?? process.env.GITHUB_SHA

  if (configuredBuildId?.trim()) {
    return configuredBuildId.trim().slice(0, 12)
  }

  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'dev-unversioned'
  }
}

const BUILD_ID = resolveBuildId()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __EVORI_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  test: {
    environment: 'jsdom',
    // Vitest stubs CSS imports to empty modules by default, which also empties `?raw`. The motion
    // contract asserts against the stylesheet text, so it needs the real thing.
    css: true,
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'shared/**/*.test.ts', 'supabase/functions/**/*.test.ts', 'tools/**/*.test.ts'],
  },
})
