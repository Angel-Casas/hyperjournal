# Session Log

Append-only record of what each session worked on. Newest entries at the top.

Every session **must** add an entry before closing. The goal is that a future session can read the most recent 2–3 entries and immediately understand the current state of the project.

## Entry format

```
## YYYY-MM-DD — <Short title>

**Session goal:** <one line>

**Done:**
- <bullet>
- <bullet>

**Deferred / not done:**
- <bullet> — <why>

**Decisions made:** <ADR-XXXX, ADR-YYYY> (or "none")

**Gotchas / notes for next session:**
- <anything non-obvious the next session should know>

**Invariants assumed:**
- <any assumption this session made that isn't written down elsewhere>
```

---
