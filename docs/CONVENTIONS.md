# Conventions

This file captures coding and UI patterns that have emerged during development. It is **living documentation** — patterns get added as they stabilize, and removed when they are superseded.

Conventions here are weaker than rules in `CLAUDE.md`. Rules are invariants; conventions are strong defaults. If you deviate from a convention, leave a short comment explaining why.

When a genuinely new pattern emerges that others will copy, document it here before it proliferates.

---

## 1. TypeScript

_To be populated as patterns emerge._ Initial expectations:

- Prefer `type` over `interface` except when declaration merging or class implementation is needed.
- Branded types for identifiers that are stringly-typed in the API (e.g., `type WalletAddress = string & { readonly __brand: 'WalletAddress' }`).
- Use `satisfies` to type literal configs without widening.
- Discriminated unions for state shapes that represent alternatives (loading / loaded / error).

---

## 2. File and module layout

- A feature exposes its public surface through `index.ts`. Everything else in the folder is internal.
- Components are named the same as their file: `TradeCard.tsx` exports `TradeCard`.
- Co-locate tests: `foo.ts` + `foo.test.ts` in the same directory.
- Hooks start with `use`, domain functions use verbs (`reconstructTrades`, `computeExpectancy`).
- Path aliases (`@app/*`, `@features/*`, `@domain/*`, `@entities/*`, `@lib/*`, `@state/*`, `@styles/*`) are the canonical import form for cross-layer references. They are declared in `tsconfig.json` (`paths`), mirrored in `vite.config.ts` (`resolve.alias`) and `vitest.config.ts` (`resolve.alias`), and resolved for ESLint via `eslint-import-resolver-typescript` (ADR-0005). Any new alias must be added to all three configs or lint will silently miss boundary violations.
- Cross-feature composition lives in `app/`, not in a new `features/*` folder. CLAUDE.md §3.7 forbids `features/*` from importing siblings; `app/` is allowed to depend on any feature, which is exactly what a composed view like `SplitHome` needs.

---

## 3. Domain layer (`domain/`)

- Pure functions only. No `Date.now()`, `Math.random()`, network, or storage calls — inject them as parameters if needed.
- Inputs and outputs are plain data (no class instances).
- Errors are returned as `Result<T, E>` unions, not thrown, for code paths where the caller must make a decision.
- Every public function has at least one Vitest test covering the happy path and one edge case.
- `domain/` may only import from `@entities/*` (and other `@domain/*`). The boundary is lint-enforced (`boundaries/element-types`).
- Coverage threshold for `src/domain/**/*.ts` is 90% lines / branches / functions / statements, configured in `vitest.config.ts`. Adding a domain function without a test will fail `pnpm test:coverage` and therefore fail CI.
- Worked example: `src/domain/wallets/isValidWalletAddress.ts` — pure predicate, narrows `string` to the branded `WalletAddress` type, 100% covered.

---

## 4. Components and hooks

_To be populated as patterns emerge._

---

## 5. Styling

- Tailwind utility classes, not inline styles.
- Design tokens are HSL CSS custom properties in `src/styles/globals.css` (`:root { --bg-base: ...; --gain: ...; ... }`) and mapped to Tailwind color names in `tailwind.config.ts` via `hsl(var(--name) / <alpha-value>)`. Alpha modifiers work (`bg-bg-raised/50`).
- Semantic color names available: `bg-base` / `bg-raised` / `bg-overlay`, `fg-base` / `fg-muted` / `fg-subtle`, `border` / `border-strong`, `gain`, `loss`, `risk`, `neutral`, `accent`. Never hardcode hex or `hsl(...)` literals in components.
- Typography uses `font-sans` (InterVariable) and `font-mono` (JetBrains Mono). Radii: `rounded-sm` (6px), `rounded-md` (10px), `rounded-lg` (14px), `rounded-xl` (20px).

---

## 6. State management

- Server / cached data → TanStack Query. One `QueryClient` instantiated inside `useState` in `src/app/providers.tsx`; defaults: `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1`.
- UI state that outlives a component → Zustand store (`src/state/ui-store.ts`).
- Component-local ephemeral state → `useState` / `useReducer`.
- **Addressable vs non-addressable UI state** (ADR-0004): anything worth a deep-link or browser-back lives in the route (wallet address, expanded-view selection, filter state if shareable). Only non-addressable UI state (panel hover, drawer-open toggles) lives in Zustand. Never put `selectedWalletAddress` in Zustand.
- Never store Hyperliquid API responses directly in Zustand; they belong in TanStack Query's cache or Dexie.

---

## 7. Error handling and provenance

_To be populated as patterns emerge._ Initial expectations:

- External boundaries (API, storage, file import) validate with Zod and surface parse errors distinctly from network errors.
- Provenance is attached at the point a value is first produced and preserved through transforms.
- UI renders `unknown` values with a neutral placeholder and a tooltip explaining why the value is missing.

---

## 8. Testing

- Vitest for unit tests. `globals: true` in `vitest.config.ts` makes `describe`/`it`/`expect` available without import, but explicit imports are also fine. `environment: 'jsdom'` for component tests.
- Setup file at `src/tests/setup.ts` — imports `@testing-library/jest-dom/vitest` matchers and runs `cleanup()` after each test.
- React Testing Library for component tests — test user-visible behavior, not implementation details. Prefer `getByRole`/`getByText` over `getByTestId`.
- Tests are co-located: `Foo.tsx` + `Foo.test.tsx` in the same directory (including for `src/app/` and `src/domain/**/`).
- TDD for `domain/`: write the failing test first, confirm RED, then the minimal impl. `src/domain/wallets/isValidWalletAddress.*` is the canonical reference.
- Playwright for E2E smoke tests — deferred to Session 4+ when a real user flow exists.
- Use realistic fixtures for domain tests. A small, checked-in set of anonymized Hyperliquid sample payloads will live in `tests/fixtures/` (introduced in Session 2).

---

## 9. Accessibility and motion

- All interactive elements reachable by keyboard.
- Focus states visible and consistent.
- `src/styles/globals.css` contains a global `@media (prefers-reduced-motion: reduce)` override that neutralizes animations and transitions across the board. Component-level motion does not need per-instance reduced-motion guards — but if a component relies on a long animation for affordance (e.g., revealing hidden content), it must provide an instant alternative that does not depend on animation timing.
- Contrast meets WCAG AA in both dark and any future light theme.
- Sections use `<section aria-labelledby="...-heading">` + `<h2 id="...-heading">` pattern (see `AnalyticsPanel`, `JournalPanel`).

---

## 10. Commit messages

- Imperative mood: "Add P/L calendar", not "Added" or "Adds".
- Conventional-commit-style prefixes are used in practice: `feat(scope):`, `fix(scope):`, `chore(scope):`, `refactor(scope):`, `test:`, `ci:`, `docs:`.
- Reference the SESSION_LOG entry in the body when relevant.
- One logical change per commit. When a review finds an issue, the fix goes in a new commit (do not amend accepted commits).
- Every commit ends with a `Co-Authored-By` trailer attributing the LLM that produced it, per repo convention.
