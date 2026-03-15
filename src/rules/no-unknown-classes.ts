import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { findBestSuggestion } from '../utils/levenshtein'
import { createLazyLoader } from '../design-system/loader'
import { safeOptions } from '../types'

interface Options {
  entryPoint?: string
  allowlist?: string[]
  ignorePrefixes?: string[]
}

export const noUnknownClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow classes that are not defined in the Tailwind CSS design system',
    },
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
          allowlist: { type: 'array', items: { type: 'string' } },
          ignorePrefixes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unknown: '"{{className}}" is not a valid Tailwind class.',
      unknownWithSuggestion:
        '"{{className}}" is not a valid Tailwind class. Did you mean "{{suggestion}}"?',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    let _allowlist: Set<string> | null = null
    let _ignorePrefixes: string[] | null = null
    function getLazyOptions() {
      if (_allowlist === null) {
        const opts = safeOptions<Options>(context)
        _allowlist = new Set(opts?.allowlist ?? [])
        _ignorePrefixes = opts?.ignorePrefixes ?? []
      }
      return { allowlist: _allowlist, ignorePrefixes: _ignorePrefixes! }
    }

    function shouldIgnore(className: string): boolean {
      const { allowlist, ignorePrefixes } = getLazyOptions()
      if (allowlist.has(className)) return true
      return ignorePrefixes.some((prefix) => className.startsWith(prefix))
    }

    function stripModifiers(className: string): string {
      // Strip ! (important) for validation — prefix or suffix form
      let stripped = className
      if (stripped.startsWith('!')) stripped = stripped.slice(1)
      if (stripped.endsWith('!')) stripped = stripped.slice(0, -1)
      return stripped
    }

    function check(locations: ClassLocation[]) {
      const ds = getDS()
      if (!ds) return
      const { cache } = ds

      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        // First pass: collect classes not in the precomputed list
        const unknown: Array<{ cls: string; stripped: string }> = []
        for (const cls of classes) {
          if (shouldIgnore(cls)) continue
          const stripped = stripModifiers(cls)
          if (!cache.isValid(stripped)) {
            unknown.push({ cls, stripped })
          }
        }

        if (unknown.length === 0) continue

        // Batch validate via candidatesToCss — the definitive check
        const toValidate = [...new Set(unknown.map((u) => u.stripped))]
        const invalid = cache.validateUnknown(toValidate)

        // Report only truly invalid classes
        for (const { cls, stripped } of unknown) {
          if (!invalid.has(stripped)) continue

          const suggestion = findBestSuggestion(stripped, cache.validClasses)

          if (suggestion) {
            context.report({
              node: loc.node,
              messageId: 'unknownWithSuggestion',
              data: { className: cls, suggestion },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'unknown',
              data: { className: cls },
            })
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        check(extractFromJSXAttribute(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      CallExpression(node) {
        check(extractFromCallExpression(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      TaggedTemplateExpression(node) {
        check(extractFromTaggedTemplate(node, DEFAULT_EXTRACTOR_CONFIG))
      },
      VariableDeclarator(node) {
        check(extractFromVariableDeclarator(node, DEFAULT_EXTRACTOR_CONFIG))
      },
    }
  },
})
