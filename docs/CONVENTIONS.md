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
- Worked example (simple): `src/domain/wallets/isValidWalletAddress.ts` — pure predicate, narrows `string` to the branded `WalletAddress` type, 100% covered.
- Worked example (multi-file algorithm): `src/domain/reconstruction/` — one file per concern (group, per-coin reconstruct, top-level orchestrator, PnL oracle), each with its own co-located test. Running-state walks use local `let` variables in a pure function; mutation is scoped to the function, the function's inputs and outputs remain immutable. Future multi-file domains should follow this shape.
- When a domain module throws on unexpected input (unknown enum, dangling state, impossible invariant), the error message must name the function, the relevant keys (coin, wallet, etc.), and the offending identifier (tid, hash, etc.) so a production stack trace is debuggable without the full input.
- **Oracle-gated correctness:** algorithms whose output must match an external source (like HL's own realizedPnl) ship with a cross-check function that compares both sides. `checkRealizedPnl` is the canonical example — it is the real correctness gate for reconstruction, not just a test. Future algorithms with external ground truth (e.g., Sharpe ratio against TradingView if we ever add that) should ship their oracle alongside.
- **Handle truncation gracefully.** Production data from Hyperliquid is capped at 2000 fills per request — trades can span that boundary and appear mid-lifecycle in our window. Prime state from HL's `startPosition` field on the first fill (signed: positive=long, negative=short) rather than assuming zero. Emitted trades whose opens were truncated have `avgEntryPx: null` and `openedSize: 0`; this is honest, not lossy.

---

## 4. Components and hooks

- Hooks that reach into storage (e.g., `useUserFills`, `useSavedWallets`) accept a `{ db?: HyperJournalDb }` options bag. Callers in the app use the default; tests inject a uniquely-named in-memory Dexie via the `db` option. Keep this pattern — it lets repository tests stay in `lib/storage/` and hook tests stay in `features/` without cross-pollution.
- shadcn-style primitives (Button, Input, Label) live at `@lib/ui/components/*` and are imported directly (`import { Button } from '@lib/ui/components/button'`). Do NOT re-export them through feature `index.ts` — each consumer imports from the canonical path so refactors stay localized.
- `cva` variant config lives in a sibling `.ts` file (e.g., `button-variants.ts`) not inside the component `.tsx`, so the component module stays component-only for React Fast Refresh (`react-refresh/only-export-components`).
- For forms with submit buttons, disable the button whenever the domain predicate says the input is invalid. Do not rely on `onSubmit` guards alone — the disabled state communicates intent to the user.
- **Null-vs-zero for analytical outputs.** Any number field that could be undefined for an input set (e.g., `winRate` on zero closed trades, `avgEntryPx` on a truncated-opens trade) is typed `number | null`. `null` means "no data" and renders as em-dash (`—`); `0` means a real zero result and renders as its numeric form. Formatters in `@lib/ui/format` enforce this convention — pass `null` through, don't coerce to 0.
- **Tone + provenance on MetricCard.** `MetricCard` takes a `tone` (`'neutral' | 'gain' | 'loss' | 'risk'`) that colours the value, and an optional `provenance` that renders a 2×2px dot with a title-attribute tooltip. Decorative-only (`aria-hidden`); screen readers see just the label and value. When passing a conditional subtext (`cond ? 'x' : undefined`) ensure the prop type allows explicit undefined — `exactOptionalPropertyTypes: true` is strict about this.

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
- **Dexie is the single persistent store** for user data (wallets, cached API responses, journals when they land, settings). All Dexie access goes through repository factories in `src/lib/storage/*-repo.ts` that expose typed methods; no direct `db.<table>.get(...)` calls from features, hooks, or components. Repository factories take the `HyperJournalDb` instance so tests inject a uniquely-named database per test.
- **Cache-through pattern** for API-backed queries: `queryFn` reads Dexie first; if the entry is within TTL, returns it instantly; otherwise fetches live, validates, writes back to Dexie, returns fresh. On fetch failure with a prior cache, return stale data instead of an error. `useUserFills` is the canonical reference.

---

## 7. Error handling and provenance

- External boundaries (API, storage, file import) validate with Zod and surface parse errors distinctly from network errors.
- API clients in `lib/api/**` **throw** typed error classes (e.g., `HyperliquidApiError` with `status` and `body`) on transport failures and let `ZodError` bubble on schema mismatches. Thrown errors flow naturally into TanStack Query's `error` state. Pure-domain and domain-adjacent code returns `Result<T, E>` unions per §3 instead of throwing.
- **Dependency direction for shared shapes:** types that cross into `domain/` (e.g., `RawFill`) live in `src/entities/` as plain TypeScript declarations. The Zod schema in `lib/validation/**` carries a compile-time `_schemaCheck` constant that asserts `z.infer<typeof Schema>` is mutually assignable with the entity. This keeps entities as the stable contract while keeping `lib/validation` as the verifier. Types consumed only by `features/**` (e.g., `ClearinghouseState`) may stay inferred from the Zod schema — YAGNI; promote to entity only when a lower layer needs them.
- **Zod + transforms:** functions that take schemas with input transforms (e.g., `NumericString: string → number`) type the schema parameter as `z.ZodType<Output, z.ZodTypeDef, unknown>` — the default `z.ZodType<T>` ties input to output and breaks on transforms. Output stays fully typed.
- Provenance is attached at the point a value is first produced and preserved through transforms.
- UI renders `unknown` values with a neutral placeholder and a tooltip explaining why the value is missing.

---

## 8. Testing

- Vitest for unit tests. `globals: true` in `vitest.config.ts` makes `describe`/`it`/`expect` available without import, but explicit imports are also fine. `environment: 'jsdom'` for component tests.
- Setup file at `src/tests/setup.ts` — imports `@testing-library/jest-dom/vitest` matchers and runs `cleanup()` after each test.
- React Testing Library for component tests — test user-visible behavior, not implementation details. Prefer `getByRole`/`getByText` over `getByTestId`.
- Tests are co-located: `Foo.tsx` + `Foo.test.tsx` in the same directory (including for `src/app/` and `src/domain/**/`).
- TDD for `domain/`: write the failing test first, confirm RED locally, then the minimal impl. `src/domain/wallets/isValidWalletAddress.*` is the canonical reference. The RED phase must be observed (run the test and see the failure for the expected reason) but does not need to be preserved as a separate commit — bundling the failing test + passing impl into one clean commit is acceptable, provided the RED observation happened in execution.
- Playwright for E2E smoke tests — deferred to Session 4+ when a real user flow exists.
- Anonymized response fixtures live in `tests/fixtures/<source>/`. Unit tests in `lib/validation/` and `lib/api/` read them via `readFileSync` + `JSON.parse`; no unit test ever hits a live API. Refreshing fixtures is a manual one-off operation documented in each fixture directory's `README.md`.
- API client tests mock `global.fetch` with `vi.stubGlobal('fetch', vi.fn())` in `beforeEach` and `vi.unstubAllGlobals()` + `vi.restoreAllMocks()` in `afterEach`. Response bodies are streamed from the committed fixtures so the real validation pipeline runs end-to-end.

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

---

## 11. Charts and data visualization

- **ECharts integration** lives at `@lib/charts/EChartsBase` — a thin React wrapper owning imperative lifecycle (init, `setOption`, `resize` via `ResizeObserver`, `dispose`) per ADR-0007. Consumers pass a complete `EChartsOption`. The wrapper never constructs or mutates options itself.
- **Memoize option objects.** Identical-contents-with-new-reference triggers `setOption` on every render. Wrap your option build in `useMemo([...derivedData])`; prefer a single pure-domain helper (`buildEquityCurve`, `buildPnlCalendar`) as the single source of truth.
- **HSL tokens in chart options are hardcoded.** ECharts receives JS values, not Tailwind classes, so the semantic-token-only rule from §5 has a narrow exception for chart components: hoist the HSL strings into a `TOKEN` const at the top of the file. Do not inline hex values or raw `hsl(...)` deep inside nested config.
- **Testing charts.** Real ECharts requires canvas and DOM layout that jsdom lacks. Use `vi.hoisted()` + `vi.mock('echarts', ...)` to replace the module with a fake `init` that returns a stub instance exposing `setOption`, `resize`, `dispose`, `on`, `off` as `vi.fn()`s. Tests verify the option shape passed to `setOption`, not the rendered chart. Visual correctness is confirmed in a browser during the session's manual check.
- **Virtualized lists** use `@tanstack/react-virtual`. `useVirtualizer({ count, getScrollElement, estimateSize, overscan })` wires a scrollable parent div; render items absolutely-positioned via `translateY(v.start)`. jsdom also cannot compute scroll geometry, so virtualization-window behavior must be verified in-browser.
