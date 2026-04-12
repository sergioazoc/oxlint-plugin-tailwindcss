import { DesignSystemCache } from './cache'
import { loadDesignSystemSync } from './sync-loader'
import { autoDetectEntryPoint } from './auto-detect'
import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface LoadResult {
  cache: DesignSystemCache
  entryPoint: string
}

// Per-entry-point DS cache — supports multiple design systems in monorepos
const dsCache = new Map<string, { cache: DesignSystemCache; mtime: number }>()

// Auto-detect result cache by directory — avoids repeated filesystem walks
const autoDetectCache = new Map<string, string | null>()

// Fallback path — only set by explicit entryPoint calls (tests, rule options),
// never by auto-detect. Prevents cross-package contamination in monorepos.
let lastLoadedPath: string | null = null

/**
 * Extracts `entryPoint` from `context.settings.tailwindcss`.
 */
function entryPointFromSettings(settings?: Readonly<Record<string, unknown>>): string | undefined {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'entryPoint' in tw) {
    const ep = (tw as Record<string, unknown>).entryPoint
    if (typeof ep === 'string') return ep
  }
  return undefined
}

/**
 * Extracts `timeout` from `context.settings.tailwindcss`.
 */
function timeoutFromSettings(settings?: Readonly<Record<string, unknown>>): number | undefined {
  const tw = settings?.tailwindcss
  if (tw && typeof tw === 'object' && 'timeout' in tw) {
    const t = (tw as Record<string, unknown>).timeout
    if (typeof t === 'number' && t > 0) return t
  }
  return undefined
}

/**
 * Cached auto-detect: caches by directory since all files in the same directory
 * resolve to the same entry point. Avoids repeated filesystem walks.
 */
function cachedAutoDetect(filePath?: string): string | null {
  if (!filePath) return autoDetectEntryPoint(filePath)
  const dir = dirname(resolve(filePath))
  const cached = autoDetectCache.get(dir)
  if (cached !== undefined) return cached
  const result = autoDetectEntryPoint(filePath)
  autoDetectCache.set(dir, result)
  return result
}

/**
 * Returns the design system cache, loading synchronously on first call.
 * Uses execFileSync internally to bridge the async Tailwind API.
 *
 * Supports multiple design systems: each unique CSS entry point gets its own cache.
 * In monorepos, files in different packages auto-detect to different entry points
 * and each gets the correct DS.
 *
 * Resolution order: rule option `entryPoint` > `settings.tailwindcss.entryPoint` > auto-detect.
 */
export function getLoadedDesignSystem(
  entryPoint?: string,
  settings?: Readonly<Record<string, unknown>>,
  filePath?: string,
): LoadResult | null {
  // Explicit entry points (rule option or settings) update the fallback path.
  // Auto-detect results do NOT — this prevents cross-package contamination in monorepos.
  const explicitEntry = entryPoint ?? entryPointFromSettings(settings)
  const cssPath = explicitEntry ?? cachedAutoDetect(filePath) ?? lastLoadedPath
  if (!cssPath) return null

  const resolvedPath = resolve(cssPath)

  try {
    const mtime = statSync(resolvedPath).mtimeMs
    const cached = dsCache.get(resolvedPath)
    if (cached && cached.mtime === mtime) {
      if (explicitEntry) lastLoadedPath = resolvedPath
      return { cache: cached.cache, entryPoint: resolvedPath }
    }

    const data = loadDesignSystemSync(resolvedPath, timeoutFromSettings(settings))
    if (!data) return null

    const cache = DesignSystemCache.fromPrecomputed(data)
    dsCache.set(resolvedPath, { cache, mtime })
    console.error(`[oxlint-tailwindcss] Loaded design system from "${resolvedPath}"`)
    if (explicitEntry) lastLoadedPath = resolvedPath
    return { cache, entryPoint: resolvedPath }
  } catch {
    return null
  }
}

/**
 * Creates a lazy DS loader that resolves the correct design system per file.
 *
 * In `createOnce`, `context.settings` and `context.filename` throw. When visitors
 * run, they become available. The loader re-resolves when the filename changes,
 * supporting monorepos where different files need different design systems.
 *
 * When a fixed entryPoint is provided (rule option or settings), it's used for all
 * files and cached after first resolution.
 */
export function createLazyLoader(context: {
  options?: readonly unknown[]
  settings?: Readonly<Record<string, unknown>>
  filename?: string
}): () => LoadResult | null {
  let lastFilePath: string | undefined
  let lastResult: LoadResult | null = null
  let fixedEntryResolved = false
  let fixedResult: LoadResult | null = null

  return () => {
    let entryPoint: string | undefined
    try {
      const opts = context.options?.[0] as { entryPoint?: string } | undefined
      entryPoint = opts?.entryPoint
    } catch {}

    let settings: Readonly<Record<string, unknown>> | undefined
    try {
      settings = context.settings
    } catch {}

    let filePath: string | undefined
    try {
      filePath = context.filename
    } catch {}

    // Fixed entry point (rule option or settings) — same for all files
    const fixedEntry = entryPoint ?? entryPointFromSettings(settings)
    if (fixedEntry) {
      if (fixedEntryResolved) return fixedResult
      fixedEntryResolved = true
      fixedResult = getLoadedDesignSystem(fixedEntry, settings, filePath)
      return fixedResult
    }

    // Auto-detect mode: re-resolve when the file changes
    if (filePath && filePath === lastFilePath) return lastResult
    if (filePath) lastFilePath = filePath

    lastResult = getLoadedDesignSystem(undefined, settings, filePath)
    return lastResult
  }
}

/**
 * Resets all DS caches (useful for tests).
 */
export function resetDesignSystem(): void {
  dsCache.clear()
  autoDetectCache.clear()
  lastLoadedPath = null
}
