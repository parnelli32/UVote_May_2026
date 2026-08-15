import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../../src/lib/types.ts';

// Service-role client: bypasses RLS entirely, so every write this makes must be
// scoped deliberately in application code — there is no policy backstop here.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to every
// Supabase Edge Function at runtime; they do not need to be set as secrets.
export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not available in function environment');
  }
  return createClient<Database>(url, serviceRoleKey);
}
