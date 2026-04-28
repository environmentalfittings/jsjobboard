/**
 * Wildcard so older Supabase DBs (missing newer columns like description, notes, test_type, …)
 * still return rows. Requesting a non-existent column makes the whole query fail and the UI
 * looks “empty.”
 */
export const VALVE_LIST_SELECT = '*' as const
