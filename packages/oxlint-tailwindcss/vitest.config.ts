import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// Give each `pnpm test` invocation its OWN design-system disk-cache dir. The
// cache in sync-loader is otherwise a single per-uid dir shared by every
// process on the machine, so two concurrent runs — a background `vitest` and
// the stop-hook's `pnpm test`, `--repeats`, or a dev's editor running oxlint
// alongside the tests — collide on the same cache files and flake the
// persistence tests (EISDIR when one run plants a directory at a cache path the
// other writes; stale reads otherwise). A per-run dir makes each run hermetic.
//
// Set here (main process) so `tests/global-setup.ts` (pre-warm + teardown) uses
// it too, and forwarded to workers via `test.env` so every pool agrees on it.
// `??=` respects an explicit override (debugging / pinning). It's a plain
// timestamp+pid name — unique per invocation — cleaned up in global-setup.
process.env.OXLINT_TAILWINDCSS_CACHE_DIR ??= join(
  tmpdir(),
  `oxlint-tw-test-cache-${process.pid}-${Date.now().toString(36)}`,
)

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './tests/global-setup.ts',
    // Forward the per-run cache dir into every worker (forked workers inherit
    // it already; `threads` needs it stated). Keeps main + workers on one dir,
    // so global-setup's pre-warm actually warms the dir the tests read.
    env: { OXLINT_TAILWINDCSS_CACHE_DIR: process.env.OXLINT_TAILWINDCSS_CACHE_DIR },
    // Generous timeouts: Windows runners are markedly slower at the worker-thread
    // design-system load / worker-service init, and the disk cache + sort/
    // canonicalize workers aren't free to spin up. 60s guards against a hang
    // without flaking on a slow-but-working cold path.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Benchmarks are slow and timing-sensitive — keep them out of the default
    // run so a bare `vitest run` (CI, IDE) doesn't pick them up (TST-M4). The
    // `bench` script overrides this to run them explicitly.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/benchmarks/**'],
  },
})
