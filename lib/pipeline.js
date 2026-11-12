import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareAudio, SEGMENT_SECONDS } from './audio';
import { uploadFile, transcribe, deleteFile, generate } from './gemini';
import { speakersFromTurns, minutesPrompt, normalizeMinutes, searchText } from './meeting';
import { sendMail, minutesEmail, emailConfigured, cleanRecipients } from './email';
import { adminUpdate, adminUserEmail } from './admin';
import { getBot, recordingUrl, downloadTo } from './recall';
import { sendFromHostMailbox } from './microsoft';

const LANG_CODES = { ar: ['ar-EG'], en: ['en-US'], auto: [] };
const running = new Set(); // meeting ids being processed by this server

export const userSaver = (sb, id) => async fields => {
  const { error } = await sb.from('meetings').update(fields).eq('id', id);
  if (error) console.error('[pipeline] update failed', id, error.message);
};
export const adminSaver = id => async fields => {
  try { await adminUpdate(id, fields); } catch (e) { console.error('[pipeline] admin update failed', id, e.message); }
};

export async function writeMinutes(meeting) {
  const raw = await generate(minutesPrompt(meeting), { json: true });
  const minutes = normalizeMinutes(raw, meeting.title);
  const next = { ...meeting, minutes, title: meeting.title || minutes.title };
  return { minutes, title: next.title, search_text: searchText(next) };
}

// Emails the minutes to the meeting's recipients: from the host's own Outlook when connected, otherwise through the
// configured email service. Returns {status, error?}.
export async function deliverMinutes(meeting, save, { recipients, force = false } = {}) {
  const to = cleanRecipients(recipients ?? meeting.recipients);
  if (!force && !meeting.auto_email) return { status: 'skipped' };
  if (!to.length) { await save({ email_status: 'skipped', email_error: 'No recipients.' }); return { status: 'skipped' }; }
  let owner = { email: null, name: '' };
  try { owner = await adminUserEmail(meeting.user_id); } catch {}
  try {
    const mail = minutesEmail(meeting, owner.name || owner.email);
    const from = await sendFromHostMailbox(meeting.user_id, { to, subject: mail.subject, html: mail.html });
    if (!from) {
      if (!emailConfigured()) throw new Error('Connect your work email (Outlook) in Settings so Mahdar can send the minutes from your mailbox.');
      await sendMail({ to, ...mail, replyTo: owner.email || undefined });
    }
    await save({ email_status: 'sent', email_error: null, emailed_at: new Date().toISOString() });
    return { status: 'sent', count: to.length, from: from || null };
  } catch (e) {
    console.error('[email]', meeting.id, e.message);
    await save({ email_status: 'failed', email_error: e.message });
    return { status: 'failed', error: e.message };
  }
}

// Audio/video file → transcript with speakers → minutes → optional email. Deletes the audio at the end.
export async function processRecording({ meeting, inputPath, workDir, save }) {
  const id = meeting.id;
  if (running.has(id)) return;
  running.add(id);
  const uploaded = [];
  try {
    await save({ status: 'processing', stage: 'Preparing audio', error: null });
    const { parts, durationSec } = await prepareAudio(inputPath, workDir);
    await fs.rm(inputPath, { force: true });
    if (durationSec) await save({ duration_sec: Math.round(durationSec) });

    const turns = [];
    for (let i = 0; i < parts.length; i++) {
      const tag = parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : '';
      await save({ stage: `Transcribing and identifying speakers${tag}` });
      const file = await uploadFile(parts[i], 'audio/ogg');
      uploaded.push(file.name);
      const pt = await transcribe(file, { langCodes: LANG_CODES[meeting.lang_hint] || [], offset: i * SEGMENT_SECONDS });
      if (parts.length > 1) pt.forEach(t => { if (t.spk) t.spk = `p${i + 1}_${t.spk}`; });
      turns.push(...pt);
    }
    if (!turns.length) throw new Error('No speech was found in this recording.');

    const full = { ...meeting, transcript: turns, speakers: speakersFromTurns(turns), duration_sec: durationSec ? Math.round(durationSec) : meeting.duration_sec };
    await save({ transcript: full.transcript, speakers: full.speakers, stage: 'Writing the minutes' });

    const { minutes, title, search_text } = await writeMinutes(full);
    const done = { ...full, minutes, title, search_text };
    await save({ minutes, title, search_text, status: 'ready', stage: meeting.auto_email && meeting.recipients?.length ? 'Emailing the minutes' : null });
    if (meeting.auto_email && meeting.recipients?.length) {
      await deliverMinutes(done, save);
      await save({ stage: null });
    }
  } catch (e) {
    console.error('[pipeline]', id, e);
    await save({ status: 'failed', stage: null, error: e.message || 'Processing failed.' });
  } finally {
    running.delete(id);
    await Promise.all(uploaded.map(deleteFile));
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

// Called when the bot service reports the call is over: downloads the recording and processes it.
export async function processBotRecording(meeting, bot) {
  if (running.has(meeting.id) || ['ready'].includes(meeting.status)) return;
  const save = adminSaver(meeting.id);
  const url = recordingUrl(bot || (await getBot(meeting.bot_id)));
  if (!url) {
    await save({ status: 'failed', stage: null, error: 'The meeting ended but no recording was produced. Was the bot admitted to the call?' });
    return;
  }
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mahdar-bot-'));
  const inputPath = path.join(workDir, 'input');
  try {
    await save({ status: 'processing', stage: 'Downloading the recording', error: null });
    await downloadTo(url, inputPath);
  } catch (e) {
    await fs.rm(workDir, { recursive: true, force: true });
    await save({ status: 'failed', stage: null, error: e.message });
    return;
  }
  await processRecording({ meeting, inputPath, workDir, save });
}

export const isRunning = id => running.has(id);
