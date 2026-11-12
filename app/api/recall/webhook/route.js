import { json } from '@/lib/server';
import { verifyWebhook, getBot, latestStatus, mapStatus } from '@/lib/recall';
import { adminFindBot, adminUpdate } from '@/lib/admin';
import { processBotRecording } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Receives bot status changes from the bot service. The payload is never trusted on its own:
// the signature is checked when a secret is configured, and the bot's status is always re-read from the service.
export async function POST(req) {
  const raw = await req.text();
  const secret = process.env.RECALL_WEBHOOK_SECRET;
  if (secret && !verifyWebhook(secret, req.headers, raw)) return json({ error: 'Invalid signature' }, 401);

  let evt;
  try { evt = JSON.parse(raw); } catch { return json({ ok: true }); }
  const botId = evt?.data?.bot?.id || evt?.data?.bot_id;
  if (!botId) return json({ ok: true });

  handle(botId).catch(e => console.error('[recall webhook]', botId, e.message));
  return json({ ok: true }); // respond fast; work continues in the background
}

async function handle(botId) {
  const meeting = await adminFindBot(botId);
  if (!meeting || meeting.status === 'ready') return;
  const bot = await getBot(botId);
  const st = latestStatus(bot);
  if (!st) return;
  if (st.code === 'done') return processBotRecording(meeting, bot);
  const mapped = mapStatus(st.code, st.sub_code);
  if (!mapped || meeting.status === 'processing') return;
  const fields = { status: mapped.status, stage: mapped.stage ?? null };
  if (mapped.error) fields.error = mapped.error;
  await adminUpdate(meeting.id, fields);
}
