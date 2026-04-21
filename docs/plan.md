# HyperJournal — High-Level Product & Architecture Plan

## 1. Project Summary

**HyperJournal** is a **frontend-only Progressive Web App (PWA)** for **Hyperliquid perpetual/futures traders**.

The product turns a pasted Hyperliquid wallet address into:

- a beautiful, high-signal trading analytics dashboard,
- a local-first journaling workspace,
- and an optional AI-assisted coaching experience powered by the **NanoGPT API** using a **user-supplied API key**.

The app is **read-only**. It does **not** connect to wallets for signing or trading. This is intentional for safety, simplicity, and user trust.

The core value proposition:

> Paste a Hyperliquid wallet address and immediately understand trading history, performance, risk, recurring mistakes, and opportunities to improve — while journaling and optionally asking an AI coach for feedback.

---

## 2. Product Goals

### Primary goals

- Provide **instant, high-quality insight** from a Hyperliquid wallet address.
- Reconstruct and analyze **perpetual/futures trading history** as accurately as possible.
- Help users **journal trades, sessions, and strategies** locally in the browser.
- Surface **behavioral patterns** such as missing stop losses, poor sizing, or repeated execution mistakes.
- Offer optional **LLM-based insights** using NanoGPT with explicit user consent and granular data-sharing controls.
- Deliver an experience that feels **premium, animated, beautiful, and creator-worthy**, not like a basic analytics page.

### Secondary goals

- Support **saved wallets locally** for easy switching.
- Allow eventual **wallet comparison views**, while keeping v1 focused on single-wallet depth.
- Enable **export/import** for manual backup and pseudo-sync across devices.
- Be highly shareable for traders, creators, and KOLs.

---

## 3. Product Non-Goals (for v1)

- No backend.
- No wallet connection for signing.
- No trading execution.
- No cross-device sync.
- No full multi-user collaboration.
- No guaranteed perfect reconstruction where source data is incomplete.
- No presenting inferred metrics as hard facts.

---

## 4. Core Product Principles

### 4.1 Read-only and safe

The app must never request wallet permissions or private keys.

### 4.2 Local-first privacy

Analytics, journals, settings, AI key storage, and cached data live locally in the browser.

### 4.3 Insight over raw data

The app should not simply mirror Hyperliquid API responses. It must derive useful information.

### 4.4 Facts, derived values, and inferences must be clearly separated

Every metric or label should be classified as one of:

- **Observed**: direct from source data
- **Derived**: deterministic calculation from observed data
- **Inferred**: best-effort interpretation from available evidence

### 4.5 No guessing when data is weak

If order intent or stop-loss behavior cannot be reasonably inferred, mark it as **unknown** rather than fabricate certainty.

### 4.6 Design quality matters

The product must feel polished, modern, expressive, and intentionally designed, with minimal but captivating motion.

### 4.7 Pure functions wherever possible

Business logic and analytics should be implemented with **pure, deterministic functions** to reduce bugs and improve testability.

---

## 5. Target Users

### Primary audience

- Hyperliquid retail traders
- Active perpetual/futures traders
- Traders who want post-trade analysis and journaling without complex setup

### Secondary audience

- Hyperliquid creators and KOLs who want a visually impressive dashboard
- Traders who want to showcase performance and review patterns publicly or privately

---

## 6. Product Experience Overview

## 6.1 Main app concept

The main interface should initially present **two equal visual panels**:

### Panel A — Trading Analytics

Compact overview of:

- performance graph
- headline metrics
- current/open status
- key insights
- profit/loss calendar preview

### Panel B — Journal & Coaching

Compact overview of:

- recent journal notes
- recurring tags or themes
- strategy note summaries
- mood/discipline markers
- suggested coaching prompts

### Interaction model

- The app first shows both panels in a balanced split layout.
- Clicking one panel expands it into the **full dashboard/workspace** for that domain.
- This creates a simple one-click gate between:
  - **analytics mode**
  - **journaling/coaching mode**

This supports the user requirement that the product feel equally like:

- a trading intelligence dashboard, and
- a journaling coach.

---

## 7. UX Vision

The experience should feel:

- **fast**
- **elegant**
- **professional**
- **minimalist but expressive**
- **high-trust**
- **data-dense without feeling cluttered**

### Design qualities

- Strong typography hierarchy
- Refined spacing and rhythm
- Dark mode first, with excellent contrast
- Smooth transitions between overview and detail states
- Meaningful microinteractions
- Gentle motion, not noisy motion
- Rich chart interactions
- Clear empty states and loading states
- Visual distinction between:
  - performance
  - risk
  - journaling
  - AI outputs

### Motion guidelines

Use animation to:

- guide attention,
- soften layout changes,
- reveal drill-down detail,
- improve perceived responsiveness.

Avoid animation that:

- delays work,
- obscures data,
- feels gimmicky.

---

## 8. Recommended Technology Stack

This stack is selected specifically for a **frontend-only, local-first, static-deployable PWA**.

### Core frontend

- **React**
- **TypeScript**
- **Vite**

### Styling and UI

- **Tailwind CSS**
- **shadcn/ui** + **Radix UI primitives**
- **Framer Motion** for expressive motion and transitions

### Data and state

- **TanStack Query** for API fetching/caching
- **Zustand** for lightweight UI/app state
- **Zod** for runtime schema validation and safe parsing

### Local persistence

- **IndexedDB** via **Dexie**

### Charts and data visualization

- **Apache ECharts** (recommended) or equivalent high-flexibility charting library

### PWA

- **vite-plugin-pwa** / Workbox

### Utilities

- **date-fns**
- optional utility helpers for formatting, grouping, and numerical analysis

### Testing and quality

- **Vitest**
- **React Testing Library**
- **Playwright**
- **ESLint**
- **Prettier**

---

## 9. Why This Stack

### Why React + Vite

- Best fit for a pure frontend SPA/PWA
- Fast iteration
- Easy static deployment
- Great ecosystem for charts, local storage, and animation

### Why Dexie / IndexedDB

The app must persist:

- journal entries
- saved wallets
- cached API payloads
- derived analytics snapshots
- screenshots/images
- settings
- optional AI conversations
- NanoGPT API key (if user chooses to save it locally)

This is beyond what localStorage should handle.

### Why TanStack Query

Hyperliquid data fetching will benefit from:

- caching
- background refresh
- deduplication
- loading/error states
- query invalidation

### Why Zod

Hyperliquid responses must be validated before use. This is especially important in an app that reconstructs trade history and computes risk metrics.

### Why Framer Motion

The product explicitly requires premium-feeling animation and transitions. Motion should be part of the architecture, not an afterthought.

---

## 10. Architecture Overview

The app should be structured around five major layers.

## 10.1 Data Source Layer

Responsible for:

- calling Hyperliquid public endpoints
- optional NanoGPT API calls
- validating and normalizing responses

## 10.2 Domain / Analytics Layer

Pure business logic functions that:

- reconstruct trades from fills and exits
- classify entries/exits when possible
- calculate metrics
- produce derived views and pattern detections

This layer should be as pure and deterministic as possible.

## 10.3 Persistence Layer

Local-only storage for:

- cached wallets
- journals
- settings
- exported/imported snapshots
- optional saved AI sessions

## 10.4 UI State Layer

Handles:

- selected wallet
- filters
- selected chart ranges
- split-panel state
- expanded dashboard state
- comparison mode state
- AI sharing permissions state

## 10.5 Presentation Layer

Handles:

- screens
- panels
- charts
- transitions
- forms
- note editors
- guided insight cards

---

## 11. High-Level Module Breakdown

# 11.1 Wallet Lookup & Saved Wallets

### Purpose

Allow users to paste a Hyperliquid wallet address and immediately analyze it.

### v1 requirements

- wallet input with validation
- recent wallet history
- save wallet locally
- switch between saved wallets
- clear/remove wallet
- refresh data manually

### v1.5+ possibility

- compare saved wallets side-by-side
- comparison mode should be separate from single-wallet detailed mode

### Important UX note

Single-wallet depth should remain the primary workflow. Multi-wallet support should not degrade clarity.

---

# 11.2 Trading Data Ingestion

### Scope

Focus on **futures/perpetual trading data** only.

### Responsibilities

- fetch available wallet trading activity
- fetch fills, orders, positions, PnL-related data, and any relevant account/performance context
- normalize all timestamps, asset symbols, sides, fees, sizing, and status fields
- cache source data locally

### Data policy

All source data should be treated as:

- unstable until validated,
- versioned if necessary,
- normalized into an internal schema.

---

# 11.3 Trade Reconstruction Engine

This is one of the most important parts of the product.

### Goal

Reconstruct complete or partial trades from raw fills and related events.

### Responsibilities

- group fills into trade sequences
- determine whether positions are:
  - open
  - reduced
  - closed
  - flipped
- infer entry and exit relationships
- compute realized trade-level metrics
- attach metadata when available:
  - entry method
  - exit method
  - limit/market behavior
  - stop-loss / take-profit indications
  - scaling in/out behavior

### Rules

- Prefer deterministic reconstruction.
- If ambiguity exists, expose uncertainty.
- Do not overclaim classification quality.

### Output

A normalized internal trade model that powers:

- trade history
- analytics
- journaling
- AI context

---

# 11.4 Trading Analytics Dashboard

### Purpose

Show a compact but powerful overview first, then allow drill-down.

### Default first impressions

The first expanded analytics view should prioritize:

1. **overall historic performance graph**
2. **profit/loss calendar**
3. headline performance metrics
4. key risk metrics
5. recent trade behavior summary

### Core analytics metrics

- Win rate
- Expectancy
- Profit factor
- Sharpe-like ratios
- Drawdown
- Risk of ruin
- Kelly criterion
- Average hold time
- Best/worst setups
- Stop-loss usage rate
- Average winner / average loser
- Longest win/loss streak
- Performance by asset
- Long vs short performance
- Trade frequency
- Position size consistency

### Important note

Metrics such as Kelly criterion or risk of ruin should include:

- assumptions
- caveats
- interpretation guidance

---

# 11.5 Filtering & Exploration System

### Requirement

The user should be able to view data from multiple angles without cluttering the main dashboard.

### Filter dimensions

- date range
- market/asset
- long vs short
- closed vs open
- winning vs losing
- hold duration bucket
- leverage bucket, if derivable
- time of day
- day of week
- tagged strategy/setup
- stop-loss usage / inferred stop handling
- trade size ranges

### UX guidance

- Keep filters powerful but not overwhelming.
- Preserve sharable or savable filter states locally.
- Use progressive disclosure for advanced filters.

---

# 11.6 Profit/Loss Calendar

### Priority

This is explicitly important and should appear early in the analytics experience.

### Function

Provide a calendar view showing:

- daily profit/loss
- session outcomes
- streak clusters
- high-drawdown periods
- journal coverage overlay (optional)

### Useful overlays

- days with journal entries
- days with large losses
- days with no stop-loss usage
- mood markers

---

# 11.7 Behavioral Pattern Detection

This is a major differentiator.

### Goal

Highlight repeated decision-quality issues and high-value learning patterns.

### Candidate patterns

- no stop loss on losing trades
- poor stop-loss usage rate
- larger sizing after losses
- adding to losers
- exiting winners too early
- holding losers too long
- overtrading after drawdowns
- poor performance at specific times/days
- strong performance in specific setups
- strategy drift
- low journal coverage during worst periods
- strong/worse performance under specific moods or session notes

### Pattern output style

Patterns should be written as:

- concise cards,
- evidence-based summaries,
- linked to relevant trades or periods,
- marked as observed/derived/inferred.

### Example style

- “You underperform materially on trades entered after a 3-loss streak.”
- “Your losing trades without an inferred stop-loss plan are significantly larger than your average loss.”
- “Your best expectancy appears in BTC long setups held between 1–4 hours.”

---

# 11.8 Journaling System

### Journal scopes

Support all three:

#### A. Trade journal

Per trade:

- pre-trade thesis
- post-trade review
- what went right
- what went wrong
- plan followed?
- stop loss used?
- emotions
- lesson learned
- screenshot/image

#### B. Session/day journal

Per day/session:

- market conditions
- mindset
- discipline score
- mistakes
- summary of the day
- what to repeat
- what to avoid

#### C. Strategy/setup journal

Per setup:

- strategy name
- conditions
- invalidation logic
- ideal R:R
- examples
- recurring mistakes for this setup
- notes tied to multiple trades

### Required fields/features

- free text
- tags
- screenshots/images
- mood/psychology markers
- pre/post trade sections
- manual link to strategies
- local edit history if feasible
- export/import compatibility

### Journal design principle

Journaling should feel lightweight enough to use regularly, not like filling tax forms.

---

# 11.9 AI Coaching Layer (NanoGPT)

### Integration model

- Fully optional
- User pastes their own NanoGPT API key
- User explicitly chooses what data to send
- No AI calls happen without consent

### Supported AI use cases

1. **Chat-style insight**

   - “Why are my losses larger than my winners?”
   - “Which setup seems strongest?”

2. **Automatic trade review summaries**

   - summarize clusters of trades
   - summarize a bad week
   - summarize a strategy’s weaknesses

3. **Journal note classification**

   - fear / greed / revenge / overconfidence / hesitation / discipline lapses
   - recurring themes across notes

4. **Prompted reflection**
   - ask users useful follow-up questions based on their own data

### AI output scope

Advice only:

- mistakes
- pitfalls
- behavioral patterns
- possible improvements
- journaling prompts
- suggested rules to test

### AI should not:

- provide trading signals
- present financial advice as certainty
- fabricate unsupported conclusions

### Data-sharing control

The user must be able to select exactly what is sent:

- full analytics summary
- selected metrics only
- selected trades only
- selected journal entries only
- selected date range only

### NanoGPT documentation note

The provided NanoGPT introduction URL currently returns a **404 / page not found**. Implementation should use the provider’s current **Quickstart** and **API reference** documentation when actual integration begins.

---

## 12. Information Architecture

## 12.1 Screens / Top-Level Areas

### 1. Landing / Onboarding

- product pitch
- wallet paste input
- privacy explanation
- “local-first” explanation
- AI is optional explanation

### 2. Split Home View

- two equal panels:
  - Trading Analytics
  - Journal & Coaching

### 3. Analytics Expanded View

- overview
- equity/performance charts
- P/L calendar
- metrics
- trade history access
- insight cards
- filters

### 4. Journal Expanded View

- recent entries
- trade journals
- session journals
- strategy journals
- tags
- mood markers
- suggested prompts

### 5. Trade Detail View

- reconstructed trade timeline
- fill summary
- entry/exit classification
- notes
- screenshots
- related strategy
- AI summary option

### 6. AI Coach View

- API key management
- data-sharing controls
- suggested prompts
- chat interface
- generated summaries
- saved local conversation history

### 7. Settings

- theme
- local data controls
- export/import
- saved wallets
- AI key management
- privacy controls
- debug/advanced data views if needed

---

## 13. Data Model Strategy

The exact schema can evolve, but the app should define stable internal entities.

### Core entities

- **Wallet**
- **RawFill**
- **RawOrder/Event**
- **ReconstructedTrade**
- **TradeLeg**
- **PositionSegment**
- **TradeStats**
- **WalletAnalyticsSnapshot**
- **JournalEntry**
- **StrategyProfile**
- **Tag**
- **MoodMarker**
- **AISession**
- **UserSettings**

### JournalEntry scopes

- trade
- session/day
- strategy

### Data labeling

Every relevant field/metric should optionally carry provenance:

- observed
- derived
- inferred
- unknown

This will greatly improve transparency and AI prompt quality.

---

## 14. Local Persistence Strategy

All user-generated and cached data should be stored locally.

### Store locally

- saved wallets
- last selected wallet
- normalized API cache
- derived analytics snapshots
- filters and view preferences
- journal entries
- screenshots/images
- strategy definitions
- NanoGPT API key (only if user chooses to save)
- AI chat history
- export/import snapshots

### Export/import requirements

Export should support a format that is:

- easy to back up
- easy to inspect
- easy to re-import
- suitable for manual sync between devices

### Recommendation

Provide:

- JSON export/import as primary
- optional CSV export for tabular trade/journal summaries

---

## 15. PWA Requirements

### Must-have PWA behavior

- installable on desktop/mobile
- responsive layout
- offline access to cached data and journal notes
- background asset caching
- graceful offline states

### Offline mode should allow

- viewing cached dashboards
- browsing journal entries
- adding/editing notes
- reviewing past AI conversations

### Offline mode should not attempt

- fresh wallet data fetch
- live AI calls

---

## 16. Design System & Motion Direction

This product needs a distinct visual identity.

## 16.1 Design goals

- premium
- modern
- minimal
- expressive
- creator-friendly
- data-rich but uncluttered

## 16.2 Visual direction

- Dark-first theme
- Strong accent color system for gain/loss/risk/neutral states
- Soft panels with depth and layering
- Refined shadows/glows used sparingly
- High-quality chart styling
- Consistent card language
- Elegant typography and numerical display

## 16.3 Motion direction

Use animation for:

- panel expansion/collapse
- chart reveal
- filter transitions
- insight card entry
- detail drawer opening
- hover response
- journaling state feedback

Use minimal but captivating transitions:

- spring-based panel expansions
- soft fades
- subtle scale/blur choreography
- directionally meaningful motion

## 16.4 Best-practice rules for motion

- Motion must never hide data accuracy.
- Motion must not block fast navigation.
- Respect reduced-motion preferences.
- Keep timing consistent and intentional.

---

## 17. Engineering Best Practices

## 17.1 General

- Keep domain logic separate from UI.
- Favor pure functions for analytics and transformation.
- Normalize API data before use.
- Validate external data with runtime schemas.
- Prefer immutable transformations.
- Build reusable visualization components.
- Keep side effects isolated.

## 17.2 Code quality

- TypeScript strict mode
- linting and formatting
- unit tests for analytics and reconstruction logic
- integration tests for key user flows
- E2E smoke tests for wallet lookup, journal save, export/import

## 17.3 Error handling

- network failure states
- partial data states
- reconstruction ambiguity states
- invalid wallet states
- AI request failure states
- import/export validation errors

## 17.4 Performance

- cache aggressively where safe
- memoize expensive derived computations
- avoid unnecessary chart rerenders
- lazy-load heavy routes/views
- compress images/screenshots where possible

---

## 18. Core Product Rules for Data Interpretation

These rules are important for trust.

### Rule 1

If a field comes directly from Hyperliquid data, mark it as **observed**.

### Rule 2

If a metric is a deterministic computation from observed data, mark it as **derived**.

### Rule 3

If a conclusion depends on heuristics, mark it as **inferred**.

### Rule 4

If there is insufficient evidence, return **unknown**.

### Rule 5

Never present AI-generated conclusions as source truth.

---

## 19. Metrics and Analytics Prioritization

## 19.1 Tier 1 metrics (must-have early)

- overall PnL
- realized performance summary
- win rate
- average win / average loss
- expectancy
- profit factor
- drawdown
- average hold time
- profit/loss calendar
- trade count
- long vs short split

## 19.2 Tier 2 metrics

- Sharpe-like ratios
- risk of ruin
- Kelly criterion
- stop-loss usage rate
- time/day performance
- asset-specific performance
- strategy-specific performance
- streak analysis

## 19.3 Tier 3 metrics

- inferred R:R setup quality
- scale-in / scale-out behavior
- post-loss behavior degradation
- journal coverage correlation
- psychology-tag performance correlation

---

## 20. Suggested Phased Roadmap

# Phase 1 — Foundation & Single-Wallet Analytics

### Goal

Deliver immediate value from one wallet.

### Deliverables

- app shell and PWA foundation
- wallet lookup
- saved wallets locally
- Hyperliquid data ingestion
- normalization layer
- first-pass trade reconstruction
- split home view
- analytics overview
- historic performance graph
- P/L calendar
- core metrics
- trade history list
- responsive design baseline

---

# Phase 2 — Deep Analytics & Pattern Detection

### Goal

Make the product differentiated and insightful.

### Deliverables

- advanced filters
- detailed trade views
- drawdown analytics
- long/short breakdown
- hold-time analysis
- stop-loss usage rate where inferable
- pattern detection cards
- stronger chart interactions
- improved uncertainty labeling

---

# Phase 3 — Journaling System

### Goal

Turn passive analysis into active self-improvement.

### Deliverables

- trade journals
- session/day journals
- strategy/setup journals
- tags and mood markers
- screenshots/images
- note linking
- journal summary panel
- export/import

---

# Phase 4 — AI Coaching via NanoGPT

### Goal

Add optional intelligent review and prompting.

### Deliverables

- NanoGPT API key management
- consent and data-sharing controls
- chat interface
- automatic trade review summaries
- journal classification
- AI-generated reflection prompts
- local storage for AI sessions

---

# Phase 5 — Polish, Performance, and Showcase Quality

### Goal

Make HyperJournal feel premium and shareable.

### Deliverables

- design refinement pass
- animation polish
- creator-ready aesthetics
- accessibility improvements
- reduced motion support
- performance optimization
- improved onboarding and empty states

---

## 21. Multiple Wallet Strategy

Although the initial focus is one wallet at a time, the product should be designed to support multiple saved wallets later.

### Recommended approach

### v1

- analyze one wallet at a time
- allow multiple wallets to be saved locally
- easy switching between wallets

### v2+

- comparison mode
- side-by-side summary metrics
- compare equity curves / drawdown / win rate / strategy behavior

### UX note

Do **not** overload the main dashboard with multi-wallet detail. Comparison should be a separate mode.

---

## 22. AI Consent & Security Model

### Key requirements

- User provides their own NanoGPT API key
- API key stays local
- No automatic sending of wallet/journal data
- Every AI action must be consent-based
- User chooses data scope before sending

### Warning copy should clearly state

- AI is optional
- AI outputs are advisory only
- data sent to the model leaves the local-only privacy boundary
- users control what is shared

---

## 23. Suggested Folder / Responsibility Structure

This is not a code implementation, but the architecture should likely separate responsibilities clearly.

### Recommended top-level domains

- `app/` — bootstrapping, routes, providers
- `features/wallets/`
- `features/analytics/`
- `features/trades/`
- `features/journal/`
- `features/ai/`
- `entities/` — stable domain entities
- `lib/api/` — Hyperliquid and NanoGPT clients
- `lib/storage/` — Dexie/local persistence
- `lib/validation/` — Zod schemas
- `lib/charts/`
- `lib/ui/`
- `domain/` — pure analytics/reconstruction logic
- `tests/`

### Important engineering note

The **domain/** layer should contain the most important pure functions:

- trade reconstruction
- metric calculation
- grouping
- filtering
- pattern detection
- export/import transforms

---

## 24. Acceptance Criteria for v1

The first version should be considered successful if a user can:

1. Open the PWA and paste a Hyperliquid wallet address.
2. See a polished split-screen home view.
3. Expand the analytics side and view:
   - overall historic performance graph
   - profit/loss calendar
   - key metrics
   - trade history
4. Save that wallet locally and return to it later.
5. Expand the journal side and:
   - add trade notes
   - add session notes
   - add strategy notes
   - tag and annotate trades
6. Export and re-import local data successfully.
7. Use the app comfortably on desktop and mobile.
8. Feel that the product is premium, responsive, and trustworthy.

---

## 25. Acceptance Criteria for AI Phase

The AI integration should be considered successful if a user can:

1. Paste a NanoGPT API key locally.
2. Explicitly choose what data to share.
3. Ask chat-style questions about performance.
4. Generate automatic review summaries for selected trades or periods.
5. Classify journal themes.
6. Receive suggestions and behavioral observations without the app pretending certainty.
7. Review local history of AI outputs later.

---

## 26. Key Risks

### 26.1 Trade reconstruction complexity

Hyperliquid data may require careful interpretation of fills and position changes.

### 26.2 Inference quality

Stop-loss and exit-style detection may not always be reliably classifiable.

### 26.3 AI trust boundary

Users must understand when they are crossing from local-only analysis into external model calls.

### 26.4 Frontend-only limitations

No automatic sync, no secret protection beyond local storage, no secure shared API key model.

### 26.5 Scope creep

There is a lot of value available here. v1 should stay disciplined.

---

## 27. Recommended v1 Prioritization Summary

If scope needs tightening, prioritize in this order:

### Must-have

- read-only wallet lookup
- split home view
- trading analytics dashboard
- overall performance graph
- P/L calendar
- core performance metrics
- trade reconstruction baseline
- local journal system
- local persistence
- PWA installability
- premium visual design baseline

### Should-have

- advanced filters
- pattern detection
- screenshots/images in journals
- strategy journal model
- saved wallets

### Later

- wallet comparison
- AI integration
- advanced quant overlays
- richer correlation analysis

---

## 28. Final Product Positioning

**HyperJournal** should be positioned as:

> A local-first Hyperliquid trading intelligence and journaling PWA that reconstructs wallet history, reveals performance and behavioral patterns, and helps traders improve through structured reflection and optional AI coaching.

---

## 29. Implementation Notes for the Agentic LLM

When starting implementation, the agent should follow this order:

1. Establish the frontend architecture and stack.
2. Build the split-screen shell and design system.
3. Implement wallet lookup and safe data fetching.
4. Build the normalization layer.
5. Implement trade reconstruction as pure functions.
6. Add analytics computations and charts.
7. Add local persistence.
8. Add journaling.
9. Add export/import.
10. Add AI integration last.

### Critical engineering priority

The correctness and purity of the **trade reconstruction + analytics domain layer** are more important than rapid UI expansion.

### Critical product priority

The UI should feel premium early. Even the first vertical slice should already look intentional and high-quality.

---

## 30. Final Notes

- Build for trust first.
- Build for beauty second.
- Build for insight third.
- Build for AI last.

The dashboard must be useful without AI.
The journal must be useful without analytics.
The AI must amplify both without becoming a crutch.

That combination is what makes HyperJournal compelling.
