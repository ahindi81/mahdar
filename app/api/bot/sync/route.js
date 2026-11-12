import { authed, json, unauthorized } from '@/lib/server';
import { getBot, latestStatus, mapStatus } from '@/lib/recall';
import { processBotRecording, isRunning } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE = ['scheduled', 'joining', 'waiting', 'recording'];

// Asks the bot service for the latest status. A backup for missed webhooks; also starts processing once the call is over.
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const { id } = await req.json().catch(() => ({}));
  const { data: m } = await auth.sb.from('meetings').select('*').eq('id', id).single();
  if (!m?.bot_id) return json({ error: 'This meeting has no bot.' }, 400);
  const stuckProcessing = m.status === 'processing' && !isRunning(m.id) && Date.now() - new Date(m.updated_at).getTime() > 3 * 60 * 1000;
  if (!LIVE.includes(m.status) && !stuckProcessing) return json({ status: m.status });

  try {
    const bot = await getBot(m.bot_id);
    const st = latestStatus(bot);
    const mapped = st && mapStatus(st.code, st.sub_code);
    if (st?.code === 'done' || (stuckProcessing && st?.code === 'done')) {
      processBotRecording({ ...m }, bot); // runs in the background
      return json({ status: 'processing' });
    }
    if (mapped && (mapped.status !== m.status || mapped.stage !== m.stage)) {
      const fields = { status: mapped.status, stage: mapped.stage ?? null };
      if (mapped.error) fields.error = mapped.error;
      await auth.sb.from('meetings').update(fields).eq('id', id);
      return json({ status: mapped.status });
    }
    return json({ status: m.status });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
