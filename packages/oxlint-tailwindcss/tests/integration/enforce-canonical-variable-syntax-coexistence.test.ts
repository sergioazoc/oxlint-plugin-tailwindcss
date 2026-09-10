/**
 * `enforce-canonical` vs `enforce-consistent-variable-syntax` (#152).
 *
 * `bg-[var(--x)]` is sugar for `bg-(--x)`. `canonicalizeCandidates` returns the
 * shorthand as the canonical form, so `enforce-canonical` used to report that
 * swap too — the exact fix `enforce-consistent-variable-syntax` produces. Both
 * fired on the same class (a duplicate diagnostic), and under the dedicated
 * rule's `explicit` setting the two autofixes fought each other (oscillation).
 *
 * #152 makes `enforce-canonical` CEDE the pure bracket↔paren swap to
 * `enforce-consistent-variable-syntax` — the single owner of variable-syntax
 * policy — the same way it already cedes the v3 renames to `no-deprecated-classes`.
 *
 * What canonical KEEPS (the dedicated rule's regex doesn't match these, so there
 * is no overlap to cede): value-changing canonicalizations
 * (`rounded-[var(--radius-sm)]` → `rounded-sm`) and opacity-modifier forms
 * (`text-[var(--color-text)]/90` → `text-(--color-text)/90`).
 */

import { resolve } from 'node:path'
import { afterAll, beforeAll, describe } from 'vitest'
import { makeFixtureRunner } from '../utils/with-fixture'
import { enforceCanonical } from '../../src/rules/enforce-canonical'
import { enforceConsistentVariableSyntax } from '../../src/rules/enforce-consistent-variable-syntax'
import { getLoadedDesignSystem, resetDesignSystem } from '../../src/design-system/loader'
import { resetCanonicalizeService } from '../../src/design-system/canonicalize-service'

const DEFAULT_FIXTURE = resolve(__dirname, '../fixtures/default.css')
const SHADCN_FIXTURE = resolve(__dirname, '../fixtures/shadcn.css')

describe('enforce-canonical ↔ enforce-consistent-variable-syntax (#152)', () => {
  const run = makeFixtureRunner(DEFAULT_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
    getLoadedDesignSystem(DEFAULT_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
  })

  // enforce-canonical CEDES the pure syntax swap, but KEEPS token/opacity cases.
  run('enforce-canonical cedes the var-syntax swap', enforceCanonical, {
    valid: [
      // The #152 inputs — canonical is now silent (dedicated rule owns them).
      { code: '<div className="bg-[var(--custom-color)]" />', filename: 'test.tsx' },
      { code: '<div className="w-[var(--custom-width)]" />', filename: 'test.tsx' },
      {
        code: '<div className="bg-[var(--custom-color)] w-[var(--custom-width)]" />',
        filename: 'test.tsx',
      },
      // Already shorthand — nothing to do either way.
      { code: '<div className="bg-(--custom-color)" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Opacity-modifier form is NOT a plain swap (the dedicated rule's regex
      // won't match `/90`), so canonical still owns it.
      {
        code: '<div className="text-[var(--color-text)]/90" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="text-(--color-text)/90" />',
      },
    ],
  })

  // The dedicated rule OWNS the swap, in both directions.
  run('variable-syntax owns the swap (shorthand)', enforceConsistentVariableSyntax, {
    valid: [{ code: '<div className="bg-(--custom-color)" />', filename: 'test.tsx' }],
    invalid: [
      {
        code: '<div className="bg-[var(--custom-color)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'useShorthand' }],
        output: '<div className="bg-(--custom-color)" />',
      },
    ],
  })

  // `explicit` mode: no oscillation. The dedicated rule pushes shorthand →
  // explicit; enforce-canonical no longer pushes the other way, so `bg-[var()]`
  // is a stable fixed point instead of a fight.
  run('variable-syntax owns the swap (explicit)', enforceConsistentVariableSyntax, {
    valid: [
      {
        code: '<div className="bg-[var(--custom-color)]" />',
        filename: 'test.tsx',
        options: [{ syntax: 'explicit' }],
      },
    ],
    invalid: [
      {
        code: '<div className="bg-(--custom-color)" />',
        filename: 'test.tsx',
        options: [{ syntax: 'explicit' }],
        errors: [{ messageId: 'useExplicit' }],
        output: '<div className="bg-[var(--custom-color)]" />',
      },
    ],
  })
})

// Value-changing canonicalization (bracket → named TOKEN) is not a syntax swap,
// so canonical keeps owning it even when the value is a var reference.
describe('enforce-canonical keeps var→token (#152, shadcn theme)', () => {
  const run = makeFixtureRunner(SHADCN_FIXTURE)
  beforeAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
    getLoadedDesignSystem(SHADCN_FIXTURE)
  })
  afterAll(() => {
    resetDesignSystem()
    resetCanonicalizeService()
  })

  run('enforce-canonical (shadcn theme)', enforceCanonical, {
    valid: [
      // Pure syntax swap is ceded here too.
      { code: '<div className="border-[var(--border)]" />', filename: 'test.tsx' },
    ],
    invalid: [
      // Named-token change (different utility name) stays with canonical.
      {
        code: '<div className="rounded-[var(--radius-sm)]" />',
        filename: 'test.tsx',
        errors: [{ messageId: 'nonCanonical' }],
        output: '<div className="rounded-sm" />',
      },
    ],
  })
})
