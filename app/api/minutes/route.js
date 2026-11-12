import { authed, json, unauthorized } from '@/lib/server';
import { writeMinutes } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// (Re)writes the minutes from the stored transcript. Body: {id, outLang?}
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const { id, outLang } = await req.json().catch(() => ({}));
  const { data: meeting, error } = await auth.sb.from('meetings').select('*').eq('id', id).single();
  if (error || !meeting) return json({ error: 'Meeting not found.' }, 404);
  if (!meeting.transcript?.length) return json({ error: 'This meeting has no transcript yet.' }, 400);

  if (outLang && ['same', 'ar', 'en'].includes(outLang)) meeting.out_lang = outLang;
  await auth.sb.from('meetings').update({ status: 'processing', stage: 'Writing the minutes', error: null, out_lang: meeting.out_lang }).eq('id', id);
  try {
    const { minutes, title, search_text } = await writeMinutes(meeting);
    const { data } = await auth.sb.from('meetings')
      .update({ minutes, title, search_text, status: 'ready', stage: null }).eq('id', id).select('*').single();
    return json({ meeting: data });
  } catch (e) {
    await auth.sb.from('meetings').update({ status: meeting.minutes ? 'ready' : 'failed', stage: null, error: e.message }).eq('id', id);
    return json({ error: e.message }, 502);
  }
}
