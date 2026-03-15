import { defineRule } from '@oxlint/plugins'
import {
  extractFromJSXAttribute,
  extractFromCallExpression,
  extractFromTaggedTemplate,
  extractFromVariableDeclarator,
  DEFAULT_EXTRACTOR_CONFIG,
  preserveSpaces,
  type ClassLocation,
} from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { hasArbitraryValue, splitUtilityAndVariant } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'

export const noUnnecessaryArbitraryValue = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow arbitrary values when a named Tailwind class produces the same CSS',
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
    messages: {
      unnecessaryArbitrary:
        '"{{className}}" can be written as "{{replacement}}". Use the named class instead.',
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
        const offending: Array<{ cls: string; replacement: string }> = []

        for (const cls of classes) {
          if (!hasArbitraryValue(cls)) continue

          const { utility, variant } = splitUtilityAndVariant(cls)

          // Strip ! (important) for lookup — prefix or suffix
          const hasImportantPrefix = utility.startsWith('!')
          const hasImportantSuffix = !hasImportantPrefix && utility.endsWith('!')
          const bareUtility = hasImportantPrefix
            ? utility.slice(1)
            : hasImportantSuffix
              ? utility.slice(0, -1)
              : utility

          const named = cache.getNamedEquivalent(bareUtility)
          if (!named) continue

          offending.push({
            cls,
            replacement:
              variant + (hasImportantPrefix ? '!' : '') + named + (hasImportantSuffix ? '!' : ''),
          })
        }

        if (offending.length === 0) continue

        const replacements = new Map(offending.map(({ cls, replacement }) => [cls, replacement]))
        const fixedValue = classes.map((cls) => replacements.get(cls) ?? cls).join(' ')

        for (let i = 0; i < offending.length; i++) {
          const { cls, replacement } = offending[i]
          if (i === 0) {
            context.report({
              node: loc.node,
              messageId: 'unnecessaryArbitrary',
              data: { className: cls, replacement },
              fix(fixer) {
                return fixer.replaceTextRange(loc.range, preserveSpaces(loc, fixedValue))
              },
            })
          } else {
            context.report({
              node: loc.node,
              messageId: 'unnecessaryArbitrary',
              data: { className: cls, replacement },
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
