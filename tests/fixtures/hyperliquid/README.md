# Hyperliquid fixtures

Anonymized snapshots of the Hyperliquid `/info` endpoint's JSON responses.
These are the inputs every unit test in `src/lib/validation` and
`src/lib/api` reads from. Unit tests never hit the live API.

## Files

- `user-fills.json` — response to `{"type":"userFills","user":"<wallet>"}`, truncated to the first 100 fills.
- `clearinghouse-state.json` — response to `{"type":"clearinghouseState","user":"<wallet>"}`.

## Anonymization

All occurrences of the authorized test wallet address are replaced with
`0x0000000000000000000000000000000000000001` (40 hex zeroes + trailing 1).
The raw responses never land in the repo.

## Refreshing

To refresh fixtures against a new account state, rerun the Task 2 curl
commands from `docs/plans/2026-04-21-phase1-session2a-data-layer.md`,
anonymize, and commit. The authorized test wallet is recorded in the
controller's memory system — do not hardcode it in source.

## What about the prices / sizes / timestamps?

Those are public on-chain data, not PII, and we need them intact for
realistic tests. Only the wallet address is anonymized.

## Caveats when refreshing

- The anonymization pattern in the plan's Task 2 uses per-character case
  classes (`[fF]`, `[aA]`, …) that match HL's current mixed-case /
  EIP-55-style casing. If a future HL API response ever returns the
  address as ALL-UPPERCASE (e.g., `0xF318AFB8...`), the sed pattern will
  miss it. Always verify with `grep -rci '<real-address>' tests/fixtures/`
  — a zero count is the hard invariant. If a refresh introduces new
  casing variants, update the sed pattern before committing.
- Run the final grep with the `-i` flag (case-insensitive) so the check
  catches any casing regardless of which the substitution handled.
