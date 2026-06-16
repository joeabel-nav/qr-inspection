// ── Connectivity detection ────────────────────────────────────
// Two-layer check: navigator.onLine + a lightweight Supabase ping.

import { supabase } from './supabase.js'

/**
 * Returns true if we have a working connection to Supabase.
 * Falls back to navigator.onLine if the fetch throws.
 */
export async function isOnline() {
  if (!navigator.onLine) return false
  try {
    // Lightweight ping — fetch a single row from a small table
    const { error } = await supabase
      .from('qr_inspectors')
      .select('id')
      .limit(1)
      .maybeSingle()
    // A network error throws; a Supabase logic error is still "online"
    return error?.message !== 'Failed to fetch'
  } catch {
    return false
  }
}
