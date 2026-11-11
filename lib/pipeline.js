import fs from 'node:fs/promises';
import { prepareAudio, SEGMENT_SECONDS } from './audio';
import { uploadFile, transcribe, deleteFile, generate } from './gemini';
import { speakersFromTurns, minutesPrompt, normalizeMinutes, searchText } from './meeting';

const LANG_CODES = { ar: ['ar-EG'], en: ['en-US'], auto: [] };

async function update(sb, id, fields) {
  const { error } = await sb.from('meetings').update(fields).eq('id', id);
  if (error) console.error('[pipeline] update failed', error.message);
}

export async function writeMinutes(sb, meeting) {
  const raw = await generate(minutesPrompt(meeting), { json: true });
  const minutes = normalizeMinutes(raw, meeting.title);
  const next = { ...meeting, minutes, title: meeting.title || minutes.title };
  return { minutes, title: next.title, search_text: searchText(next) };
}

// Runs after an upload finishes: audio → transcript with speakers → minutes. The original file is deleted at the end.
export async function processRecording({ sb, meeting, inputPath, workDir }) {
  const id = meeting.id;
  const uploaded = [];
  try {
    await update(sb, id, { status: 'processing', stage: 'Preparing audio', error: null });
    const { parts, durationSec } = await prepareAudio(inputPath, workDir);
    await fs.rm(inputPath, { force: true });
    if (durationSec) await update(sb, id, { duration_sec: Math.round(durationSec) });

    const turns = [];
    for (let i = 0; i < parts.length; i++) {
      const tag = parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : '';
      await update(sb, id, { stage: `Transcribing and identifying speakers${tag}` });
      const file = await uploadFile(parts[i], 'audio/ogg');
      uploaded.push(file.name);
      const pt = await transcribe(file, { langCodes: LANG_CODES[meeting.lang_hint] || [], offset: i * SEGMENT_SECONDS });
      if (parts.length > 1) pt.forEach(t => { if (t.spk) t.spk = `p${i + 1}_${t.spk}`; });
      turns.push(...pt);
    }
    if (!turns.length) throw new Error('No speech was found in this recording.');

    const withTranscript = { ...meeting, transcript: turns, speakers: speakersFromTurns(turns), duration_sec: durationSec ? Math.round(durationSec) : null };
    await update(sb, id, { transcript: withTranscript.transcript, speakers: withTranscript.speakers, stage: 'Writing the minutes' });

    const { minutes, title, search_text } = await writeMinutes(sb, withTranscript);
    await update(sb, id, { minutes, title, search_text, status: 'ready', stage: null });
  } catch (e) {
    console.error('[pipeline]', id, e);
    await update(sb, id, { status: 'failed', stage: null, error: e.message || 'Processing failed.' });
  } finally {
    await Promise.all(uploaded.map(deleteFile));
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
