import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Benchmarks run under their own config.
 *
 * The default config excludes `tests/benchmarks/**` so a bare `vitest run` (CI,
 * IDE) doesn't pick them up — but a CLI path filter does NOT override that
 * exclude, and `--exclude` appends to it rather than replacing it. So
 * `vitest run tests/benchmarks` matched nothing and the `bench` script had been
 * silently reporting "No test files found" instead of measuring anything.
 */

// Isolate the disk-cache dir per invocation, same rationale as vitest.config.ts:
// a `pnpm bench` run must not share the shared per-uid cache dir with a
// concurrent `pnpm test` (or an editor's oxlint) and race on its files.
process.env.OXLINT_TAILWINDCSS_CACHE_DIR ??= join(
  tmpdir(),
  `oxlint-tw-bench-cache-${process.pid}-${Date.now().toString(36)}`,
)

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/global-setup.ts',
    env: { OXLINT_TAILWINDCSS_CACHE_DIR: process.env.OXLINT_TAILWINDCSS_CACHE_DIR },
    include: ['tests/benchmarks/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
