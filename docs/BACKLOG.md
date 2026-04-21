# Backlog

Deferred items, known issues, and tech debt. This is the parking lot — things that are real but not for the current session.

When you notice something that would be a distraction to fix now, put it here with a short note on why it matters and roughly when it should be addressed. When you complete an item, delete it (the SESSION_LOG entry for that session preserves the history).

## How to use this file

- Prefer over-recording: if you're unsure whether something belongs here, add it.
- One-liner per item is fine. Longer items get a short paragraph.
- Tag urgency with `[now]`, `[soon]`, `[later]`, or `[maybe]`.
- If an item grows into a real design question, promote it to an ADR in `DECISIONS.md`.

---

## Known risks (from `docs/plan.md` §26)

These are not tasks; they are ongoing risks to keep in mind when working on related areas.

- **Trade reconstruction complexity** — Hyperliquid fills may be ambiguous about entry/exit intent. Always expose uncertainty.
- **Inference quality** — Stop-loss and exit-style classification will often be weak. Default to `unknown` rather than a confident guess.
- **AI trust boundary** — The moment data is sent to NanoGPT, it leaves the local-only privacy boundary. The user must know every time.
- **Frontend-only limitations** — No server-side secret protection, no cross-device sync, no shared API key model.
- **Scope creep** — The plan is intentionally rich. v1 must stay disciplined; nice ideas go here, not into the current branch.

---

## Later-phase reminders (from `docs/plan.md` §20)

Items explicitly deferred by the phasing plan. Listed here only as a reminder that they are intentional deferrals, not oversights.

- `[later]` Wallet comparison mode (Phase 2+).
- `[later]` AI coaching integration via NanoGPT (Phase 4).
- `[later]` Advanced quant overlays / correlation analysis (post-Phase 5).
- `[later]` Creator-ready polish pass (Phase 5).
