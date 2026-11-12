import { authed, json, unauthorized } from '@/lib/server';
import { createBot, detectPlatform } from '@/lib/recall';
import { cleanRecipients } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sends the Mahdar bot to a meeting now or at a scheduled time.
// Body: {meetingUrl, title?, joinAt?, recipients?, autoEmail?, outLang?, langHint?}
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const meetingUrl = String(b.meetingUrl || '').trim();
  const platform = detectPlatform(meetingUrl);
  if (!platform) return json({ error: 'Paste a Microsoft Teams, Zoom or Google Meet meeting link.' }, 400);

  let joinAt = null;
  if (b.joinAt) {
    const t = new Date(b.joinAt);
    if (Number.isNaN(t.getTime())) return json({ error: 'The start time is not valid.' }, 400);
    if (t.getTime() < Date.now() - 5 * 60 * 1000) return json({ error: 'The start time is in the past.' }, 400);
    joinAt = t.toISOString();
  }
  const scheduled = joinAt && new Date(joinAt).getTime() - Date.now() > 10 * 60 * 1000;

  const { data: meeting, error } = await auth.sb.from('meetings').insert({
    title: String(b.title || '').trim().slice(0, 200),
    source: 'bot',
    status: scheduled ? 'scheduled' : 'joining',
    stage: scheduled ? null : 'Joining the meeting',
    meeting_url: meetingUrl,
    platform,
    join_at: joinAt,
    recipients: cleanRecipients(b.recipients),
    auto_email: b.autoEmail !== false,
    out_lang: ['same', 'ar', 'en'].includes(b.outLang) ? b.outLang : 'same',
    lang_hint: ['auto', 'ar', 'en'].includes(b.langHint) ? b.langHint : 'auto'
  }).select('*').single();
  if (error) return json({ error: 'Could not create the meeting: ' + error.message }, 400);

  try {
    const bot = await createBot({ meetingUrl, joinAt, metadata: { meeting_id: meeting.id, user_id: auth.user.id } });
    await auth.sb.from('meetings').update({ bot_id: bot.id }).eq('id', meeting.id);
    return json({ id: meeting.id });
  } catch (e) {
    await auth.sb.from('meetings').delete().eq('id', meeting.id);
    const msg = e.status === 507 ? 'No bot is free right now. Try again in a minute, or schedule the bot at least 10 minutes ahead.' : e.message;
    return json({ error: msg }, e.status && e.status < 500 ? 400 : 502);
  }
}
