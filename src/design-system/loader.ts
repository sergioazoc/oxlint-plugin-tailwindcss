import { DesignSystemCache } from './cache'
import { loadDesignSystemSync } from './sync-loader'
import { autoDetectEntryPoint } from './auto-detect'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

export interface LoadResult {
  cache: DesignSystemCache
  entryPoint: string
}

// Module-level SINGLETON — shared across ALL rules
let singleton: {
  cache: DesignSystemCache
  path: string
  mtime: number
} | null = null

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
 * Returns the design system cache, loading synchronously on first call.
 * Uses execFileSync internally to bridge the async Tailwind API.
 * All rules receive the SAME instance.
 *
 * Resolution order: rule option `entryPoint` > `settings.tailwindcss.entryPoint` > auto-detect.
 */
export function getLoadedDesignSystem(
  entryPoint?: string,
  settings?: Readonly<Record<string, unknown>>,
  filePath?: string,
): LoadResult | null {
  const cssPath =
    entryPoint ??
    entryPointFromSettings(settings) ??
    singleton?.path ??
    autoDetectEntryPoint(filePath)
  if (!cssPath) return null

  const resolvedPath = resolve(cssPath)

  try {
    const mtime = statSync(resolvedPath).mtimeMs
    if (singleton !== null && singleton.path === resolvedPath && singleton.mtime === mtime) {
      return { cache: singleton.cache, entryPoint: resolvedPath }
    }

    const data = loadDesignSystemSync(resolvedPath)
    if (!data) return null

    const cache = DesignSystemCache.fromPrecomputed(data)
    singleton = { cache, path: resolvedPath, mtime }
    return { cache, entryPoint: resolvedPath }
  } catch {
    return null
  }
}

/**
 * Creates a lazy DS loader that retries with more context as it becomes available.
 *
 * In `createOnce`, `context.settings` and `context.filename` throw. When visitors
 * run, they become available. This function retries until it has the file path
 * (meaning we're in a visitor with full context), then gives up.
 */
export function createLazyLoader(context: {
  options?: readonly unknown[]
  settings?: Readonly<Record<string, unknown>>
  filename?: string
}): () => LoadResult | null {
  let result: LoadResult | null = null
  let triedWithFilePath = false

  return () => {
    if (result) return result
    if (triedWithFilePath) return null

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

    result = getLoadedDesignSystem(entryPoint, settings, filePath)
    if (filePath) triedWithFilePath = true

    return result
  }
}

/**
 * Resets the singleton (useful for tests).
 */
export function resetDesignSystem(): void {
  singleton = null
}
