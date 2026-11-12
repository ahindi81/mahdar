import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// A Supabase client that acts as the signed-in user, so row-level security applies to every query.
export async function authed(req) {
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { sb, user: data.user, token };
}

export const json = (body, status = 200) => Response.json(body, { status });
export const unauthorized = () => json({ error: 'Please sign in again.' }, 401);
