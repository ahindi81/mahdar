import { authed, json, unauthorized } from '@/lib/server';
import { deliverMinutes, userSaver } from '@/lib/pipeline';
import { cleanRecipients } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Emails the minutes now. Body: {id, recipients}
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const { id, recipients } = await req.json().catch(() => ({}));
  const to = cleanRecipients(recipients);
  if (!to.length) return json({ error: 'Add at least one email address.' }, 400);
  const { data: m } = await auth.sb.from('meetings').select('*').eq('id', id).single();
  if (!m) return json({ error: 'Meeting not found.' }, 404);
  if (!m.minutes) return json({ error: 'The minutes are not ready yet.' }, 400);
  await auth.sb.from('meetings').update({ recipients: to }).eq('id', id);
  const r = await deliverMinutes({ ...m, recipients: to }, userSaver(auth.sb, id), { recipients: to, force: true });
  if (r.status !== 'sent') return json({ error: r.error || 'The email was not sent.' }, 502);
  return json({ ok: true, count: r.count });
}
