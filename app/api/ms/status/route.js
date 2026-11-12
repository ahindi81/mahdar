import { authed, json, unauthorized } from '@/lib/server';
import { msConfigured } from '@/lib/microsoft';
import { adminConnGet } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  let conn = null;
  try { conn = await adminConnGet(auth.user.id); } catch {}
  return json({ configured: msConfigured(), connected: !!conn, email: conn?.email || null, name: conn?.name || null, since: conn?.created_at || null });
}
