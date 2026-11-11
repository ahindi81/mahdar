import { authed, json, unauthorized } from '@/lib/server';
import { generate } from '@/lib/gemini';
import { transcriptText } from '@/lib/meeting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Answers a question about one meeting from its transcript and minutes. Body: {id, question}
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const { id, question } = await req.json().catch(() => ({}));
  const q = String(question || '').trim().slice(0, 1000);
  if (!q) return json({ error: 'Type a question first.' }, 400);
  const { data: meeting, error } = await auth.sb.from('meetings').select('*').eq('id', id).single();
  if (error || !meeting) return json({ error: 'Meeting not found.' }, 404);

  const history = (meeting.qa || []).slice(-6).map(x => `Q: ${x.q}\nA: ${x.a}`).join('\n\n');
  const prompt = 'You are Mahdar, an assistant that answers questions about one meeting. Use only the transcript and minutes below. If the answer is not there, say so plainly. ' +
    'Reply in the language of the question. Be concise. Plain text only, no Markdown headings; short lists are fine.\n\n' +
    (meeting.minutes ? 'Minutes (JSON):\n' + JSON.stringify(meeting.minutes) + '\n\n' : '') +
    'Transcript:\n' + transcriptText(meeting, 100000) +
    (history ? '\n\nEarlier questions in this conversation:\n' + history : '') +
    '\n\nQuestion: ' + q;
  try {
    const a = (await generate(prompt)).trim();
    const qa = [...(meeting.qa || []), { q, a, at: new Date().toISOString() }].slice(-50);
    await auth.sb.from('meetings').update({ qa }).eq('id', id);
    return json({ answer: a, qa });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
