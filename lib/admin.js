import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// Server-to-server database access (used when no user is signed in, e.g. bot webhooks).
async function call(op, payload) {
  const secret = process.env.MAHDAR_ADMIN_SECRET;
  if (!secret) throw new Error('Server is missing MAHDAR_ADMIN_SECRET.');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/mahdar-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'x-mahdar-secret': secret },
    body: JSON.stringify({ op, ...payload })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Database call failed: ${j.error || r.status}`);
  return j;
}

export const adminGet = async id => (await call('get', { id })).meeting;
export const adminFindBot = async botId => (await call('find_bot', { bot_id: botId })).meeting;
export const adminUpdate = async (id, fields) => (await call('update', { id, fields })).meeting;
export const adminUserEmail = async userId => call('user_email', { user_id: userId });
