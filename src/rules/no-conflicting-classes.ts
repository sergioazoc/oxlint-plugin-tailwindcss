import { defineRule } from '@oxlint/plugins'
import { createExtractorVisitors, type ClassLocation } from '../utils/extractors'
import { splitClasses } from '../utils/class-splitter'
import { extractUtility, getVariantPrefix } from '../utils/class-parser'
import { createLazyLoader } from '../design-system/loader'

export const noConflictingClasses = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Tailwind CSS classes that generate conflicting CSS properties',
    },
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
      conflict:
        '"{{classA}}" and "{{classB}}" affect {{properties}}. "{{winner}}" takes precedence (appears later).',
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
        if (classes.length < 2) continue

        // Group classes by variant prefix (bracket-aware)
        const byVariant = new Map<string, string[]>()
        for (const cls of classes) {
          const variant = getVariantPrefix(cls)
          const existing = byVariant.get(variant) ?? []
          existing.push(cls)
          byVariant.set(variant, existing)
        }

        for (const [, variantClasses] of byVariant) {
          if (variantClasses.length < 2) continue

          // For each pair of classes in the same variant, compare CSS properties
          const propsMap = new Map<string, string[]>()
          for (const cls of variantClasses) {
            let utility = extractUtility(cls)
            // Strip ! (important) for lookup — prefix or suffix
            if (utility.startsWith('!')) utility = utility.slice(1)
            else if (utility.endsWith('!')) utility = utility.slice(0, -1)
            const props = cache.getCssProperties(utility)
            propsMap.set(cls, props)
          }

          // Utilities that share a CSS property but are designed to compose.
          // Most composition is detected automatically via CSS custom properties
          // (see isCompositionViaCssVars below). These groups cover cases where
          // the heuristic fails: shared intermediate vars or missing custom props.
          const COMPLEMENTARY_GROUPS = [
            /^(?:from|via|to)-/, // gradient stops (share --tw-gradient-stops)
            /^(?:transition|duration|ease|delay)(?:-|$)/, // transition composition (transition-all has no custom vars)
            /^-?(?:translate|scale|rotate|skew)-/, // transform axis composition (overlap not in cssProps)
            /^prose(?:-|$)/, // prose + prose-sm/lg/xl modifiers
          ]
          // Pairs where one utility sets defaults and the other overrides a specific property
          const COMPOSITION_PAIRS: [RegExp, RegExp][] = [
            [/^text-/, /^leading-/], // text-sm sets line-height, leading-* overrides
            [/^border(?:-[0-9]|$)/, /^border-(?:solid|dashed|dotted|double|hidden|none)$/], // border width + style
            [/^divide-/, /^border(?:-[trblxyse])?-/], // divide-* targets children
            [/^prose(?:-|$)/, /^max-w-/], // prose sets max-width, max-w-* overrides
          ]

          // Detect composition via CSS custom properties: if both classes use
          // custom properties (--tw-*) but none overlap, they compose into a
          // shared shorthand (e.g. shadow + ring both set box-shadow via different vars).
          function isCompositionViaCssVars(propsA: string[], propsB: string[]): boolean {
            const customA = propsA.filter((p) => p.startsWith('--'))
            const customB = propsB.filter((p) => p.startsWith('--'))
            if (customA.length === 0 || customB.length === 0) return false
            return !customA.some((p) => customB.includes(p))
          }

          function shouldSkipPair(
            a: string,
            b: string,
            propsA: string[],
            propsB: string[],
          ): boolean {
            // CSS custom property composition (handles shadow/ring, filter, contain, etc.)
            if (isCompositionViaCssVars(propsA, propsB)) return true

            let ua = extractUtility(a)
            let ub = extractUtility(b)
            if (ua.startsWith('!')) ua = ua.slice(1)
            else if (ua.endsWith('!')) ua = ua.slice(0, -1)
            if (ub.startsWith('!')) ub = ub.slice(1)
            else if (ub.endsWith('!')) ub = ub.slice(0, -1)
            // Complementary utilities within the same group
            for (const re of COMPLEMENTARY_GROUPS) {
              if (re.test(ua) && re.test(ub)) return true
            }
            // Composition pairs where one sets defaults and the other overrides
            for (const [reA, reB] of COMPOSITION_PAIRS) {
              if ((reA.test(ua) && reB.test(ub)) || (reA.test(ub) && reB.test(ua))) return true
            }
            return false
          }

          // Detect conflicts
          for (let i = 0; i < variantClasses.length; i++) {
            const classA = variantClasses[i]
            const propsA = propsMap.get(classA) ?? []

            for (let j = i + 1; j < variantClasses.length; j++) {
              const classB = variantClasses[j]
              const propsB = propsMap.get(classB) ?? []

              // Skip pairs that share CSS properties but target different elements/roles
              if (shouldSkipPair(classA, classB, propsA, propsB)) continue

              const overlap = propsA.filter((p) => propsB.includes(p))
              if (overlap.length > 0) {
                const propList =
                  overlap.length <= 3
                    ? `"${overlap.join('", "')}"`
                    : `${overlap.length} CSS properties`

                context.report({
                  node: loc.node,
                  messageId: 'conflict',
                  data: {
                    classA,
                    classB,
                    properties: propList,
                    winner: classB,
                  },
                })
              }
            }
          }
        }
      }
    }

    return createExtractorVisitors(context, check)
  },
})
