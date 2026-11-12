import { authed, json, unauthorized } from '@/lib/server';
import { adminConnDelete } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  await adminConnDelete(auth.user.id);
  return json({ ok: true });
}
