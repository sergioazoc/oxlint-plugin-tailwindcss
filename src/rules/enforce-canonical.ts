import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, preserveSpaces, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { createLazyLoader } from '../design-system/loader'

export const enforceCanonical = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce canonical Tailwind CSS class names using canonicalizeCandidates()',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          entryPoint: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
    messages: {
      nonCanonical: '"{{className}}" can be written as "{{canonical}}". Use the canonical form.',
      suggestReplace: 'Replace "{{className}}" with "{{replacement}}".',
    },
  },
  createOnce(context) {
    const getDS = createLazyLoader(context)

    function check(locations: ClassLocation[]) {
      const ds = getDS()
      if (!ds) return
      const { cache } = ds
      for (const loc of locations) {
        const classes = splitClasses(loc.value)

        // Pre-compute canonical forms for all classes once
        const canonicals = classes.map((cls) => cache.canonicalize(cls))
        let firstNonCanonical = true

        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i]
          const canonical = canonicals[i]
          if (canonical === cls) continue

          if (firstNonCanonical) {
            firstNonCanonical = false
            const fixedValue = canonicals.join(' ')
            context.report({
              node: loc.node,
              messageId: 'nonCanonical',
              data: { className: cls, canonical },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            const fixedValue = canonicals.join(' ')
            context.report({
              node: loc.node,
              messageId: 'nonCanonical',
              data: { className: cls, canonical },
              suggest: [
                {
                  messageId: 'suggestReplace',
                  data: { className: cls, replacement: canonical },
                  fix(fixer) {
                    return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
                  },
                },
              ],
            })
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
