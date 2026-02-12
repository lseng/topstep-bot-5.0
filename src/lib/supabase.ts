// Supabase client for server-side operations
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Get the Supabase client (lazy-initialized on first use)
 * Throws at call time instead of module load time
 */
function getSupabase(): SupabaseClient<Database> {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'
    );
  }

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseInstance;
}

export { getSupabase };
export type { Database };
