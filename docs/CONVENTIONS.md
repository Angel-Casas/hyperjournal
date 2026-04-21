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

_To be populated as patterns emerge._ Initial expectations:

- A feature exposes its public surface through `index.ts`. Everything else in the folder is internal.
- Components are named the same as their file: `TradeCard.tsx` exports `TradeCard`.
- Co-locate tests: `foo.ts` + `foo.test.ts` in the same directory.
- Hooks start with `use`, domain functions use verbs (`reconstructTrades`, `computeExpectancy`).

---

## 3. Domain layer (`domain/`)

_To be populated as patterns emerge._ Initial expectations:

- Pure functions only. No `Date.now()`, `Math.random()`, network, or storage calls — inject them as parameters if needed.
- Inputs and outputs are plain data (no class instances).
- Errors are returned as `Result<T, E>` unions, not thrown, for code paths where the caller must make a decision.
- Every public function has at least one Vitest test covering the happy path and one edge case.

---

## 4. Components and hooks

_To be populated as patterns emerge._

---

## 5. Styling

_To be populated as patterns emerge._ Initial expectations:

- Tailwind utility classes, not inline styles.
- Design tokens (colors, spacing, radii) defined once in the Tailwind config; never hardcode hex values in components.
- Gain / loss / risk / neutral states have named semantic classes or tokens, not raw color values.

---

## 6. State management

_To be populated as patterns emerge._ Initial expectations:

- Server / cached data → TanStack Query.
- UI state that outlives a component → Zustand store.
- Component-local ephemeral state → `useState` / `useReducer`.
- Never store Hyperliquid API responses directly in Zustand; they belong in TanStack Query's cache or Dexie.

---

## 7. Error handling and provenance

_To be populated as patterns emerge._ Initial expectations:

- External boundaries (API, storage, file import) validate with Zod and surface parse errors distinctly from network errors.
- Provenance is attached at the point a value is first produced and preserved through transforms.
- UI renders `unknown` values with a neutral placeholder and a tooltip explaining why the value is missing.

---

## 8. Testing

_To be populated as patterns emerge._ Initial expectations:

- Vitest for unit tests (fast, Node-only where possible).
- React Testing Library for component tests — test user-visible behavior, not implementation details.
- Playwright for E2E smoke tests on critical flows (wallet lookup, journal save, export/import).
- Use realistic fixtures for domain tests. A small, checked-in set of anonymized Hyperliquid sample payloads lives in `tests/fixtures/`.

---

## 9. Accessibility and motion

_To be populated as patterns emerge._ Initial expectations:

- All interactive elements reachable by keyboard.
- Focus states visible and consistent.
- Every animation checks `prefers-reduced-motion` and degrades to an instant transition.
- Contrast meets WCAG AA in both dark and any future light theme.

---

## 10. Commit messages

_To be populated as patterns emerge._ Initial expectations:

- Imperative mood: "Add P/L calendar", not "Added" or "Adds".
- Reference the SESSION_LOG entry in the body when relevant.
- One logical change per commit.
