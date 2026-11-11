import { adminClient, json } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Creates a ready-to-use account when the server has the Supabase service key;
// otherwise tells the browser to use the standard sign-up (which may send a confirmation email).
export async function POST(req) {
  const { email, password, name } = await req.json().catch(() => ({}));
  const admin = adminClient();
  if (!admin) return json({ fallback: true });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (!password || String(password).length < 8) return json({ error: 'Use a password of at least 8 characters.' }, 400);
  const { error } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password: String(password),
    email_confirm: true,
    user_metadata: { name: String(name || '').slice(0, 80) }
  });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return json({ error: exists ? 'An account with this email already exists. Log in instead.' : error.message }, exists ? 409 : 400);
  }
  return json({ ok: true });
}
