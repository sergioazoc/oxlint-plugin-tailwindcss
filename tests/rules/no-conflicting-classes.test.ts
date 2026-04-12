import { resolve } from 'node:path'
import { beforeAll, describe, test, expect } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noConflictingClasses } from '../../src/rules/no-conflicting-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { loadDesignSystemSync } from '../../src/design-system/sync-loader'
import { DesignSystemCache } from '../../src/design-system/cache'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const PROSE_ENTRY = resolve(__dirname, '../fixtures/with-typography.css')
const LETTER_SPACING_ENTRY = resolve(__dirname, '../fixtures/with-letter-spacing.css')

// --- Default design system tests ---

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

ruleTester.run('no-conflicting-classes', noConflictingClasses, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="p-4 m-2" />', filename: 'test.tsx' },
    // Different variants = no conflict
    { code: '<div className="hover:bg-red-500 focus:bg-blue-500" />', filename: 'test.tsx' },
    // Gradient utilities are complementary, not conflicting
    { code: '<div className="from-white to-transparent" />', filename: 'test.tsx' },
    { code: '<div className="from-blue-500 via-purple-500 to-pink-500" />', filename: 'test.tsx' },
    // divide-* targets children (> * + *), border-* targets the element itself
    { code: '<div className="divide-border border-input" />', filename: 'test.tsx' },
    // shadow-* and ring-* compose via CSS custom properties in box-shadow
    { code: '<div className="shadow-sm ring-2" />', filename: 'test.tsx' },
    { code: '<div className="shadow-lg ring-1 ring-offset-2" />', filename: 'test.tsx' },
    // inset-ring-* and inset-shadow-* compose with shadow/ring (#3)
    { code: '<div className="inset-ring-1 shadow-md" />', filename: 'test.tsx' },
    { code: '<div className="inset-shadow-sm shadow-lg" />', filename: 'test.tsx' },
    { code: '<div className="inset-ring-2 ring-2" />', filename: 'test.tsx' },
    { code: '<div className="inset-shadow-xs ring-1 shadow-sm" />', filename: 'test.tsx' },
    {
      code: '<div className="inset-ring-1 inset-shadow-sm shadow-md ring-2 ring-offset-2" />',
      filename: 'test.tsx',
    },
    // text-* sets line-height as default, leading-* overrides it
    { code: '<div className="text-sm leading-relaxed" />', filename: 'test.tsx' },
    { code: '<div className="text-xs leading-tight" />', filename: 'test.tsx' },
    // transition-* + duration-*/ease-*/delay-* compose
    { code: '<div className="transition-all duration-500 ease-out" />', filename: 'test.tsx' },
    { code: '<div className="transition-colors duration-150" />', filename: 'test.tsx' },
    // border width + border style compose
    { code: '<div className="border border-dashed" />', filename: 'test.tsx' },
    { code: '<div className="border-2 border-dotted" />', filename: 'test.tsx' },
    // transform axes compose (x + y are independent)
    { code: '<div className="translate-x-2 -translate-y-2" />', filename: 'test.tsx' },
    { code: '<div className="scale-x-50 scale-y-75" />', filename: 'test.tsx' },
    // backdrop-filter utilities compose via CSS custom properties
    { code: '<div className="backdrop-blur-lg backdrop-brightness-50" />', filename: 'test.tsx' },
    {
      code: '<div className="backdrop-blur-sm backdrop-contrast-100 backdrop-saturate-150" />',
      filename: 'test.tsx',
    },
    // filter utilities compose via CSS custom properties
    { code: '<div className="blur-lg brightness-50" />', filename: 'test.tsx' },
    { code: '<div className="blur-sm drop-shadow-md contrast-100" />', filename: 'test.tsx' },
    // contain-* utilities compose via CSS custom properties
    { code: '<div className="contain-layout contain-paint" />', filename: 'test.tsx' },
    { code: '<div className="contain-size contain-style" />', filename: 'test.tsx' },
    // font-variant-numeric utilities compose
    { code: '<div className="lining-nums tabular-nums" />', filename: 'test.tsx' },
    { code: '<div className="ordinal slashed-zero" />', filename: 'test.tsx' },
    // touch-action utilities compose
    { code: '<div className="touch-pan-x touch-pan-y" />', filename: 'test.tsx' },
    { code: '<div className="touch-pan-x touch-pinch-zoom" />', filename: 'test.tsx' },
    // border-spacing axis composition
    { code: '<div className="border-spacing-x-2 border-spacing-y-4" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="text-red-500 text-blue-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Same longhand properties conflict
    {
      code: '<div className="mt-2 mt-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Three-way conflict
    {
      code: '<div className="text-red-500 text-blue-500 text-green-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }, { messageId: 'conflict' }, { messageId: 'conflict' }],
    },
    // Same variant conflict
    {
      code: '<div className="hover:bg-red-500 hover:bg-blue-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // ! important modifier conflict
    {
      code: '<div className="!text-red-500 !text-blue-500" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    // Same-utility conflicts within composition groups must still be detected
    {
      code: '<div className="shadow-sm shadow-lg" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="blur-sm blur-lg" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="backdrop-blur-sm backdrop-blur-lg" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="ring-1 ring-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
    {
      code: '<div className="inset-ring-1 inset-ring-4" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'conflict' }],
    },
  ],
})

// --- Descendant selector filtering (prose-like classes from @tailwindcss/typography) ---

describe('descendant selector filtering', () => {
  test('prose root properties should NOT include descendant selector properties', () => {
    const data = loadDesignSystemSync(PROSE_ENTRY)
    expect(data).not.toBeNull()
    const cache = DesignSystemCache.fromPrecomputed(data!)
    const proseProps = cache.getCssProperties('prose')
    // prose root element sets: color, max-width
    // It should NOT include overflow-x (from :where(pre)),
    // font-weight (from :where(h1/a/code)), text-decoration (from :where(a)), etc.
    expect(proseProps).toContain('color')
    expect(proseProps).toContain('max-width')
    expect(proseProps).not.toContain('overflow-x')
    expect(proseProps).not.toContain('text-decoration')
  })

  test('not-prose should be recognized as a valid class', () => {
    const data = loadDesignSystemSync(PROSE_ENTRY)
    expect(data).not.toBeNull()
    const cache = DesignSystemCache.fromPrecomputed(data!)
    // not-prose is referenced via [class~="not-prose"] in typography CSS output
    expect(cache.isValid('not-prose')).toBe(true)
  })
})

// --- text-* + tracking-* composition when theme defines letter-spacing (#8) ---

describe('text + tracking composition with letter-spacing', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(LETTER_SPACING_ENTRY)
  })

  const trackingTester = new RuleTester()

  trackingTester.run('no-conflicting-classes (text + tracking)', noConflictingClasses, {
    valid: [
      // text-* sets letter-spacing as default, tracking-* overrides it (#8)
      { code: '<div className="text-base tracking-tight" />', filename: 'test.tsx' },
      { code: '<div className="text-lg tracking-wide" />', filename: 'test.tsx' },
      { code: '<div className="text-base tracking-normal" />', filename: 'test.tsx' },
    ],
    invalid: [],
  })
})
