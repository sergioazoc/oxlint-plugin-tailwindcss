import { resolve } from 'node:path'
import { beforeAll } from 'vitest'
import { RuleTester } from 'oxlint/plugins-dev'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'

const ENTRY_POINT = resolve(__dirname, '../fixtures/default.css')

beforeAll(() => {
  resetDesignSystem()
  getLoadedDesignSystem(ENTRY_POINT)
})

const ruleTester = new RuleTester()

ruleTester.run('enforce-canonical', enforceCanonical, {
  valid: [
    { code: '<div className="flex items-center" />', filename: 'test.tsx' },
    { code: '<div className="bg-blue-500 p-4" />', filename: 'test.tsx' },
    { code: '<div className="m-0" />', filename: 'test.tsx' },
    // Important modifier: position is not enforce-canonical's concern
    { code: '<div className="!rounded-lg" />', filename: 'test.tsx' },
    { code: '<div className="rounded-lg!" />', filename: 'test.tsx' },
  ],
  invalid: [
    {
      code: '<div className="-m-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="m-0" />',
    },
    {
      code: '<div className="flex -mt-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="flex mt-0" />',
    },
    // Template literal: preserve trailing space before expression
    {
      code: '<div className={`flex -m-0 ${x}`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className={`flex m-0 ${x}`} />',
    },
    // Template literal: preserve leading space after expression
    {
      code: '<div className={`${base} -m-0`} />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className={`${base} m-0`} />',
    },
    // Important prefix preserved when bare class is canonicalized
    {
      code: '<div className="!-m-0" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="!m-0" />',
    },
    // Important suffix preserved when bare class is canonicalized
    {
      code: '<div className="-m-0!" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="m-0!" />',
    },
    // Issue #11: arbitrary values with named equivalents (px → named via rem conversion)
    {
      code: '<div className="p-[2px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="p-0.5" />',
    },
    {
      code: '<div className="max-w-[400px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="max-w-100" />',
    },
    // Issue #11: var() syntax canonicalization with opacity modifier
    {
      code: '<div className="text-[var(--color-text)]/90" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="text-(--color-text)/90" />',
    },
    // Issue #11: theme() function canonicalization
    {
      code: '<div className="[--w-padding:theme(spacing.1)]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="[--w-padding:--spacing(1)]" />',
    },
    // Issue #11: with variant prefix
    {
      code: '<div className="hover:p-[2px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="hover:p-0.5" />',
    },
    // Issue #11: with important modifier
    {
      code: '<div className="!p-[2px]" />',
      filename: 'test.tsx',
      errors: [{ messageId: 'nonCanonical' }],
      output: '<div className="!p-0.5" />',
    },
    // Issue #11: multiple in same string
    {
      code: '<div className="p-[2px] max-w-[400px] flex" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'nonCanonical' },
        {
          messageId: 'nonCanonical',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: 'max-w-[400px]', replacement: 'max-w-100' },
              output: '<div className="p-0.5 max-w-100 flex" />',
            },
          ],
        },
      ],
      output: '<div className="p-0.5 max-w-100 flex" />',
    },
    // Multiple non-canonical classes in same string
    {
      code: '<div className="-m-0 -mt-0 flex" />',
      filename: 'test.tsx',
      errors: [
        { messageId: 'nonCanonical' },
        {
          messageId: 'nonCanonical',
          suggestions: [
            {
              messageId: 'suggestReplace',
              data: { className: '-mt-0', replacement: 'mt-0' },
              output: '<div className="m-0 mt-0 flex" />',
            },
          ],
        },
      ],
      output: '<div className="m-0 mt-0 flex" />',
    },
  ],
})
