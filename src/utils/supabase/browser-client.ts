import { createClient } from '@supabase/supabase-js';

import { env } from '@/env';

/**
 * Supabase browser client.
 *
 * Put your project values in `.env.local`:
 * - NEXT_PUBLIC_SUPABASE_URL=
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY=
 */
export function getSupabaseBrowserClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

