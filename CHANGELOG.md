# Changelog

## 0.2.0 (2026-04-09)

- **Custom class detection via settings** ([#1](https://github.com/sergioazoc/oxlint-tailwindcss/issues/1)) — New `settings.tailwindcss` options to extend class detection: `attributes` (additional JSX attribute names), `callees` (additional function names), `tags` (additional tagged template tags), and `variablePatterns` (additional regex patterns for variable names). All values are additive to the built-in defaults. Applies to all 22 rules at once.
- **Object-valued JSX attribute support** ([#1](https://github.com/sergioazoc/oxlint-tailwindcss/issues/1)) — Attributes like `classNames={{ root: "flex", label: "text-sm" }}` now extract class strings from object values. Supports string literals, ternaries, and logical expressions in values.
- **Built-in tw-classed support** ([#2](https://github.com/sergioazoc/oxlint-tailwindcss/issues/2)) — `classed()` calls are now detected by default. The first argument (element type or component reference) is skipped, and remaining arguments are extracted as class strings or cva-like config objects (variants, compoundVariants).
- **Fix `no-conflicting-classes` false positive with `inset-ring` and `shadow`** ([#3](https://github.com/sergioazoc/oxlint-tailwindcss/issues/3)) — Classes like `inset-ring-1` and `shadow-md` both set `box-shadow` but compose via different CSS custom properties (`--tw-inset-ring-shadow` vs `--tw-shadow`). These are no longer reported as conflicting. The fix uses a CSS custom property heuristic: if two classes both use `--tw-*` variables but none overlap, they are composing, not conflicting. This also fixes false positives for `inset-shadow` + `shadow`, `inset-ring` + `ring`, and all other composition patterns (filter, backdrop-filter, contain, font-variant-numeric, touch-action, border-spacing, mask).
- **Internal: `createExtractorVisitors` helper** — All 22 rules now use a shared visitor factory instead of duplicating 4 AST visitor callbacks each. Reduces boilerplate and ensures custom config is applied uniformly.
- **Dependencies updated** — @oxlint/plugins 1.59.0, oxlint 1.59.0, oxfmt 0.44.0.
- 591 tests (up from 571).

## 0.1.10 (2026-03-27)

- **Fix `no-conflicting-classes` false positives with plugin classes** — Classes from plugins like `@tailwindcss/typography` (`prose`) generate CSS with nested descendant selectors (`:where(.prose pre)`, `:where(.prose a)`, etc.). Previously, ALL properties from descendant selectors were treated as if they applied to the root element, causing false conflicts. Now only root-level CSS properties are used for conflict detection. Example: `prose overflow-x-auto` no longer reports a conflict because `overflow-x` only applies to `.prose pre`, not to `.prose` itself.
- **Fix `no-unknown-classes` false positive for modifier classes** — Classes like `not-prose` (from `@tailwindcss/typography`) that don't generate their own CSS but are referenced via `[class~="not-prose"]` attribute selectors in other classes' output are now recognized as valid.
- 550 tests (up from 548).

## 0.1.9 (2026-03-19)

- **Fix `enforce-sort-order` in VS Code** — The sort service worker thread failed to resolve `@tailwindcss/node` in VS Code's extension host due to a different module resolution context. The parent thread now resolves the module path via `require.resolve()` and passes it to the worker, fixing false positives that only appeared in VS Code.
- **Fix heuristic sort for null-order classes** — Marker classes like `group/name` and `peer/name` (which return `null` from `ds.getClassOrder()`) now sort first in the heuristic fallback, matching the behavior of oxfmt and prettier-plugin-tailwindcss.
- **Fix heuristic sort for dynamic numeric values** — Classes like `underline-offset-3` and `gap-13` that are valid in Tailwind v4 but missing from `getClassList()` now resolve their order via prefix lookup in `cache.getOrder()`, preventing incorrect sort positions in the heuristic fallback.
- 548 tests (up from 545).

## 0.1.8 (2026-03-18)

- **`enforce-consistent-important-position` default changed to suffix** — Tailwind v4's canonical form is `font-bold!` (suffix). The default was `prefix` (`!font-bold`), which is the deprecated v3 form. Using `"prefix"` may now conflict with `enforce-canonical`.
- **`enforce-canonical` preserves `!` position** — Canonicalization no longer forces `!` to prefix. If the user wrote `-m-0!` it now canonicalizes to `m-0!` (not `!m-0`), respecting the original modifier position.
- **`consistent-variant-order` supports `*`/`**` selectors** — Child (`\*:`) and descendant (`\*\*:`) selectors are now included in the default variant order. Fixed arbitrary variant brackets (`[...]`) no longer getting priority `-1`.
- **Dependencies updated** — tailwindcss 4.2.2, @oxlint/plugins 1.56.0, oxlint 1.56.0, oxfmt 0.41.0, tsdown 0.21.4, @typescript/native-preview 7.0.0-dev.20260318.1.
- 545 tests (up from 536).

## 0.1.7 (2026-03-16)

- **Fix sort service keeping process alive** — Add `worker.unref()` so the worker thread doesn't prevent Node.js from exiting naturally after linting completes.

## 0.1.6 (2026-03-16)

- **Add `enforce-physical` rule** — Inverse of `enforce-logical`. Converts logical properties (`ms-4`, `start-0`) to physical ones (`ml-4`, `left-0`). Autofix. 22 rules total.
- **Exact official Tailwind sort order** — `enforce-sort-order` now uses `ds.getClassOrder()` via a persistent child process (sort service) for results identical to oxfmt/prettier-plugin-tailwindcss. Falls back to improved heuristic sort on platforms without FIFO support.
- **Fix `enforce-sort-order` heuristic fallback** — Variant-prefixed classes, arbitrary values (`max-w-[200px]`), CSS function syntax (`h-(--size)`), and slash modifiers (`bg-muted/50`) now resolve correctly.
- **Fix `enforce-shorthand`** — Exclude viewport units (`dvw`, `dvh`, `svw`, `svh`, `lvw`, `lvh`) from w+h→size shorthand. Fix suggesting invalid `size-screen`.
- **Fix `no-conflicting-classes` false positives** — Transform axes, Tailwind composition patterns (shadow/ring, divide/border, gradient utilities).
- **Fix `no-unknown-classes` false positives** — Improved `candidatesToCss()` expansion, opacity modifiers (`bg-black/80`), gradient deprecations, dynamic numeric values, bare utilities.
- **Fix import resolution** — External CSS packages, group/peer detection, CSS class extraction from imports.
- **Add deprecated gradient classes** — `bg-gradient-to-{t,tr,r,br,b,bl,l,tl}` → `bg-linear-to-*` with autofix.
- Default config: `max-class-count` and `enforce-consistent-line-wrapping` default to "off".
- 536 tests (up from 484).

## 0.1.5 (2026-03-15)

- **Fix `!` (important) modifier handling across all rules** — Both prefix (`!flex`) and suffix (`flex!`) forms now work correctly in all 21 rules. Previously, classes with `!` were silently ignored by lookups in `enforce-shorthand`, `enforce-logical`, `enforce-canonical`, `enforce-sort-order`, `enforce-consistent-variable-syntax`, `enforce-negative-arbitrary-values`, `no-deprecated-classes`, `no-unnecessary-arbitrary-value`, `no-conflicting-classes`, `no-hardcoded-colors`, `no-arbitrary-value`, `no-dark-without-light`.
- **Fix `enforce-sort-order`** — Classes with `!` modifier (e.g., `!text-red-500`) were sorted incorrectly (always placed first). Now use the same sort order as their non-`!` equivalent.
- **Fix `no-deprecated-classes` autofix** — Multiple deprecated classes in the same string are now all fixed in one pass (previously only the first was fixed).
- **Fix monorepo auto-detection** — Entry point is now detected by walking up from the linted file's path, not from `process.cwd()`. Fixes auto-detection in monorepos where lint runs from the root.
- **`settings.tailwindcss.entryPoint`** — Configure the entry point once in `.oxlintrc.json` settings instead of repeating it per rule.
- **Disk cache** — Design system precomputed data is cached to disk. Subsequent loads are ~10x faster.
- **Expanded auto-detection** — 81 candidate paths (9 directories × 9 filenames).
- **Fix opacity modifier false positives** — Classes like `bg-black/80`, `text-white/90` were incorrectly reported as unknown.
- **Fix `no-conflicting-classes` false positives** — Filter out `@property` descriptors (`syntax`, `inherits`, `initial-value`) from CSS property extraction. These were incorrectly shared across unrelated utilities, causing false conflicts like `shadow-lg` vs `ease-in-out`.
- **Fix `no-unknown-classes` false positives** — Classes valid in Tailwind v4 but missing from `getClassList()` are now handled: dynamic numeric values (`w-45`, `min-h-17.5`) via prefix heuristic, bare utilities (`rounded`, `shadow`) and screen breakpoints (`max-w-screen-lg`) via precompute expansion with `candidatesToCss()`, opacity modifiers (`bg-black/80`) via slash stripping.
- Centralized `stripImportant()` in design system cache for consistent `!` handling.
- 484 tests (up from 344).

## 0.1.4 (2026-03-14)

- **Global `entryPoint` via settings** — Configure `settings.tailwindcss.entryPoint` once in `.oxlintrc.json` instead of repeating it per rule.
- **Disk cache for design system** — Precomputed data is cached to `/tmp/oxlint-tailwindcss/`. Subsequent loads are ~10x faster.
- **Expanded auto-detection** — 81 candidate paths (9 directories × 9 filenames). Adds `app/tailwind.css`, `css/`, `style/`, `assets/`, `resources/css/`, and more.
- Improved test coverage: tests now sync with source constants (`DEPRECATED_MAP`, `PHYSICAL_TO_LOGICAL`, `CANDIDATE_DIRS/NAMES`).
- Simplified README: removed redundant `entryPoint` option tables, trimmed verbose examples.

## 0.1.3 (2026-03-14)

- Fix all autofix rules stripping leading/trailing spaces in template literals (e.g., `` `h-3 w-3 ${x}` `` → `` `size-3${x}` ``). Affected rules: `enforce-shorthand`, `enforce-sort-order`, `enforce-canonical`, `enforce-logical`, `enforce-consistent-variable-syntax`, `enforce-consistent-important-position`, `enforce-negative-arbitrary-values`, `enforce-consistent-line-wrapping`, `consistent-variant-order`, `no-duplicate-classes`, `no-deprecated-classes`, `no-unnecessary-arbitrary-value`.

## 0.1.2 (2026-03-14)

- **no-contradicting-variants**: Fix false positives for variants that target different elements — pseudo-elements (`after:`, `before:`, `file:`, `placeholder:`), child/descendant selectors (`*:`, `**:`), and arbitrary selectors (`[&>svg]:`, `[&_div]:`).
- Remove unused `tailwind-api.ts` module.

## 0.1.1 (2026-03-14)

- Renamed package from `oxlint-plugin-tailwindcss` to `oxlint-tailwindcss`.

## 0.1.0 (2026-03-13)

Initial release with 21 Tailwind CSS v4 linting rules for oxlint.

### Correctness Rules

- **no-unknown-classes** — Flags classes not defined in the Tailwind design system, with typo suggestions via Levenshtein distance.
- **no-duplicate-classes** — Detects and auto-fixes duplicate classes within class strings.
- **no-conflicting-classes** — Warns when two classes affect the same CSS properties.
- **no-deprecated-classes** — Flags deprecated Tailwind v4 classes (`flex-grow` → `grow`, etc.) with auto-fix.
- **no-unnecessary-whitespace** — Normalizes extra spaces in class strings.
- **no-dark-without-light** — Requires a base utility when using `dark:` variant on the same element.

### Style Rules

- **enforce-sort-order** — Sorts classes according to Tailwind's official order with auto-fix.
- **enforce-canonical** — Rewrites non-canonical forms to their canonical equivalents (e.g., `-m-0` → `m-0`).
- **enforce-shorthand** — Suggests shorthand classes when all axes share the same value (`mt-2 mr-2 mb-2 ml-2` → `m-2`).
- **enforce-logical** — Suggests logical properties for RTL/LTR support (`ml-4` → `ms-4`).
- **enforce-consistent-important-position** — Enforces consistent `!` position: prefix (`!font-bold`) or suffix (`font-bold!`). Auto-fix.
- **enforce-negative-arbitrary-values** — Moves negative outside brackets inside: `-top-[5px]` → `top-[-5px]`. Auto-fix.
- **enforce-consistent-variable-syntax** — Enforces v4 shorthand `bg-(--var)` or explicit `bg-[var(--var)]`. Auto-fix.
- **consistent-variant-order** — Enforces variant order: responsive before state (`hover:sm:flex` → `sm:hover:flex`). Auto-fix.
- **no-unnecessary-arbitrary-value** — Replaces arbitrary values with named equivalents when available (`h-[auto]` → `h-auto`). Auto-fix.

### Complexity Rules

- **max-class-count** — Warns when an element exceeds the class count limit (default: 20).
- **enforce-consistent-line-wrapping** — Warns when a class string exceeds the print width (default: 80).

### Restriction Rules

- **no-restricted-classes** — Blocks specific classes by name or regex pattern.
- **no-arbitrary-value** — Prohibits arbitrary values (`w-[200px]`) to enforce design system usage.
- **no-hardcoded-colors** — Flags hardcoded color values like `bg-[#ff5733]` or `text-[rgb()]`.
- **no-contradicting-variants** — Detects redundant variant classes (`flex dark:flex`).

### Features

- Synchronous design system loading via `execFileSync` — no async overhead in the lint loop.
- Auto-detection of Tailwind CSS entry point (walks up from CWD).
- Supports JSX attributes, `cn()`/`clsx()`/`cva()`/`twMerge()`/`tv()` calls, and `tw` tagged templates.

- Graceful degradation — rules that need the design system return no errors if it can't load.
