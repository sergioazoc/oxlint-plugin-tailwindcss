import { resolve } from 'node:path'
import { beforeAll, describe } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { noUnknownClasses } from '../../src/rules/no-unknown-classes'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')
const COMPONENTS_ENTRY_POINT = resolve(__dirname, '../fixtures/with-components.css')

// Pre-load the design system singleton so rules find it
beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

ruleTester.run('no-unknown-classes', noUnknownClasses, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500 text-white p-4" />', filename: 'test.tsx' },
    { code: '<div className="hover:bg-blue-700" />', filename: 'test.tsx' },
    { code: '<div className="bg-[#123456]" />', filename: 'test.tsx' },
    { code: '<div className="w-[200px]" />', filename: 'test.tsx' },
    { code: 'cn("flex", "items-center")', filename: 'test.tsx' },
    // Variable: name doesn't match pattern — should be ignored
    { code: 'const foo = "fex"', filename: 'test.tsx' },
    // Important modifier on valid class
    { code: '<div className="!flex" />', filename: 'test.tsx' },
    { code: '<div className="!items-center" />', filename: 'test.tsx' },
    // Suffix ! (Tailwind CSS v4 important syntax)
    { code: '<div className="flex!" />', filename: 'test.tsx' },
    { code: '<div className="items-center!" />', filename: 'test.tsx' },
    // Opacity modifiers
    { code: '<div className="bg-black/80" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500/50 text-white/90" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="fex items-center" />',
      filename: 'test.tsx',
      errors: [
        {
          messageId: 'unknownWithSuggestion',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'fex', replacement: 'flex' },
              output: '<div className="flex items-center" />',
            },
          ],
        },
      ],
    },
    {
      code: '<div className="itms-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknownWithSuggestion' }],
    },
    {
      code: '<div className="not-a-real-class" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknown' }],
    },
    // Variable detection: typo in className variable
    {
      code: 'const classes = "fex"',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknownWithSuggestion' }],
    },
    // Important modifier on invalid class
    {
      code: '<div className="!itms-center" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'unknownWithSuggestion' }],
    },
    // Multiple unknown classes in same string
    {
      code: '<div className="itms-center fex bg-blu-500" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'unknownWithSuggestion' },
        { messageId: 'unknownWithSuggestion' },
        { messageId: 'unknownWithSuggestion' },
      ],
    },
  ],
})

// --- tw-classed: template literal as first arg (#9) ---

describe('tw-classed template literal', () => {
  const classedTester = new RuleTester()

  classedTester.run('no-unknown-classes (classed template literal)', noUnknownClasses, {
    valid: [
      // First arg as string literal — element type skipped
      { code: 'classed("div", "truncate")', filename: 'test.tsx' },
      // First arg as template literal — element type should also be skipped (#9)
      { code: 'classed(`div`, "truncate")', filename: 'test.tsx' },
      { code: 'classed(`button`, "flex items-center")', filename: 'test.tsx' },
      // Component reference as first arg
      { code: 'classed(Button, "flex")', filename: 'test.tsx' },
    ],
    invalid: [
      // Unknown class in second arg should still be detected
      {
        code: 'classed(`div`, "fex")',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
      {
        code: 'classed("div", "fex")',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknownWithSuggestion' }],
      },
    ],
  })
})

// Test with component classes
describe('component classes', () => {
  beforeAll(() => {
    resetDesignSystem()
    getLoadedDesignSystem(COMPONENTS_ENTRY_POINT)
  })

  const componentTester = new RuleTester()

  componentTester.run('no-unknown-classes (with components)', noUnknownClasses, {
    valid: [
      // Component classes should be recognized as valid
      { code: '<div className="btn" />', filename: 'test.tsx' },
      { code: '<div className="card" />', filename: 'test.tsx' },
      // Regular Tailwind classes still valid
      { code: '<div className="flex p-4" />', filename: 'test.tsx' },
    ],
    invalid: [
      {
        code: '<div className="fake-component" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'unknown' }],
      },
    ],
  })
})
