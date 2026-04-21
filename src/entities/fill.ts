// The canonical RawFill type is inferred from the Zod schema defined in
// src/lib/validation/hyperliquid.ts. This module re-exports it so consumers
// outside lib/ can import from @entities without depending on validation.
//
// Defined here (not in validation) because entities is a lower-level layer
// per CLAUDE.md §4; the Zod schema is the authoring source, the entity is the
// stable name external layers refer to.
//
// Session 2a Task 3 populates this re-export once the schema exists.
export type RawFill = never;
