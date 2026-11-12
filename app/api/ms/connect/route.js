import { authed, json, unauthorized } from '@/lib/server';
import { msConfigured, authorizeUrl } from '@/lib/microsoft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns the Microsoft sign-in URL for connecting the user's Outlook mailbox.
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  if (!msConfigured()) return json({ error: 'Outlook connection is not set up on the server yet.' }, 503);
  return json({ url: authorizeUrl(auth.user.id, auth.user.email) });
}
