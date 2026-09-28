import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const options = { auth: { autoRefreshToken: false, persistSession: false } };

export const supabaseConfigured = Boolean(url && serviceRoleKey);
export const supabase = supabaseConfigured
  ? createClient(url, serviceRoleKey, options)
  : null;

export function createAuthClient() {
  return createClient(url, serviceRoleKey, options);
}

export async function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return supabase;
}