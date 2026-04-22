/**
 * Singleton user-settings row. Keyed by the literal string 'singleton' so
 * there is exactly one row. Domain and feature layers import this type
 * from @entities — the Dexie schema in @lib/storage/db references the
 * same shape so persistence and usage stay in lockstep.
 */
export type UserSettings = {
  readonly key: 'singleton';
  readonly lastSelectedAddress: string | null;
};
