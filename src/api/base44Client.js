// LEGACY SHIM - every existing import `from '@/api/base44Client'` still works.
// New code should import from '@/api/supabaseClient' directly.
// This file will be removed in v1.1 after all imports are migrated.
export { supabase, db, auth, functions, integrations, base44 } from './supabaseClient'
