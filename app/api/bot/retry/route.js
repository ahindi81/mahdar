import { authed, json, unauthorized } from '@/lib/server';
import { getBot, recordingUrl } from '@/lib/recall';
import { processBotRecording, isRunning } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Re-processes a bot meeting from the recording the bot service still holds (kept about 7 days).
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const { id } = await req.json().catch(() => ({}));
  const { data: m } = await auth.sb.from('meetings').select('*').eq('id', id).single();
  if (!m?.bot_id) return json({ error: 'This meeting has no bot recording.' }, 400);
  if (isRunning(m.id)) return json({ ok: true });
  try {
    const bot = await getBot(m.bot_id);
    if (!recordingUrl(bot)) return json({ error: 'The bot service no longer has this recording (recordings are kept for about 7 days).' }, 410);
    await auth.sb.from('meetings').update({ status: 'processing', stage: 'Downloading the recording', error: null }).eq('id', id);
    processBotRecording({ ...m, status: 'processing' }, bot); // runs in the background
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
