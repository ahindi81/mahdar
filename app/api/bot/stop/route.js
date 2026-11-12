import { authed, json, unauthorized } from '@/lib/server';
import { leaveCall, deleteScheduledBot } from '@/lib/recall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stops the bot: cancels a scheduled bot, or makes a bot in the call leave (the recording so far is then processed).
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const { id } = await req.json().catch(() => ({}));
  const { data: m } = await auth.sb.from('meetings').select('*').eq('id', id).single();
  if (!m?.bot_id) return json({ error: 'This meeting has no bot.' }, 400);
  try {
    if (m.status === 'scheduled') {
      await deleteScheduledBot(m.bot_id);
      await auth.sb.from('meetings').delete().eq('id', id);
      return json({ deleted: true });
    }
    await leaveCall(m.bot_id);
    await auth.sb.from('meetings').update({ stage: 'Leaving the meeting' }).eq('id', id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
