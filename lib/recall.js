import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const region = () => process.env.RECALL_REGION || 'us-west-2';
const base = () => `https://${region()}.recall.ai/api/v1`;

export const BOT_NAME = 'Mahdar Notetaker';
export const botConfigured = () => !!process.env.RECALL_API_KEY;

async function rfetch(path, opts = {}) {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error('The meeting bot is not configured yet (RECALL_API_KEY is missing on the server).');
  const r = await fetch(base() + path, {
    ...opts,
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) }
  });
  const text = await r.text();
  let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = { detail: text.slice(0, 300) }; }
  if (!r.ok) {
    const e = new Error(typeof j === 'object' ? (j.detail || j.message || JSON.stringify(j).slice(0, 300)) : String(j));
    e.status = r.status; e.body = j;
    throw e;
  }
  return j;
}

export function detectPlatform(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (h.endsWith('teams.microsoft.com') || h.endsWith('teams.live.com') || h === 'teams.cloud.microsoft' || h.endsWith('.teams.cloud.microsoft')) return 'teams';
  if (h.endsWith('zoom.us') || h.endsWith('zoomgov.com')) return 'zoom';
  if (h === 'meet.google.com') return 'meet';
  if (h.endsWith('webex.com')) return 'webex';
  return null;
}

export async function createBot({ meetingUrl, joinAt, metadata }) {
  const body = {
    meeting_url: meetingUrl,
    bot_name: BOT_NAME,
    metadata,
    automatic_leave: { waiting_room_timeout: 1200, noone_joined_timeout: 1200, everyone_left_timeout: 2 }
  };
  // Scheduled bots must be at least 10 minutes ahead; otherwise join now.
  if (joinAt && new Date(joinAt).getTime() - Date.now() > 10 * 60 * 1000) body.join_at = new Date(joinAt).toISOString();
  const withChat = { ...body, chat: { on_bot_join: { send_to: 'everyone', message: 'Mahdar Notetaker is recording this meeting to prepare the minutes. | يقوم Mahdar بتسجيل هذا الاجتماع لإعداد المحضر.' } } };
  try {
    return await rfetch('/bot/', { method: 'POST', body: JSON.stringify(withChat) });
  } catch (e) {
    if (e.status === 400) return rfetch('/bot/', { method: 'POST', body: JSON.stringify(body) }); // in case chat options are not accepted
    throw e;
  }
}

export const getBot = id => rfetch(`/bot/${encodeURIComponent(id)}/`);
export const leaveCall = id => rfetch(`/bot/${encodeURIComponent(id)}/leave_call/`, { method: 'POST' });
export const deleteScheduledBot = id => rfetch(`/bot/${encodeURIComponent(id)}/`, { method: 'DELETE' });

export function latestStatus(bot) {
  const list = bot?.status_changes || [];
  return list.length ? list[list.length - 1] : null;
}

export function recordingUrl(bot) {
  for (const rec of bot?.recordings || []) {
    const ms = rec.media_shortcuts || {};
    const url = ms.audio_mixed?.data?.download_url || ms.video_mixed?.data?.download_url;
    if (url) return url;
  }
  return null;
}

export async function downloadTo(url, path) {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Could not download the meeting recording (${r.status}).`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(path));
}

// Maps a Recall status code to Mahdar's meeting status and a message for the user.
export function mapStatus(code, subCode) {
  switch (code) {
    case 'joining_call': return { status: 'joining', stage: 'Joining the meeting' };
    case 'in_waiting_room': return { status: 'waiting', stage: 'Waiting in the lobby. Admit “Mahdar Notetaker” to start recording.' };
    case 'in_call_not_recording': return { status: 'waiting', stage: 'In the meeting, waiting for permission to record' };
    case 'recording_permission_allowed':
    case 'in_call_recording': return { status: 'recording', stage: 'Recording' };
    case 'recording_permission_denied': return { status: 'waiting', stage: 'The host did not allow recording' };
    case 'call_ended': return { status: 'processing', stage: 'Meeting ended. Preparing the recording' };
    case 'done': return { status: 'processing', stage: 'Meeting ended. Preparing the recording' };
    case 'fatal': return { status: 'failed', stage: null, error: fatalMessage(subCode) };
    default: return null;
  }
}

function fatalMessage(sub) {
  const s = String(sub || '');
  if (/waiting_room|admit|lobby/i.test(s)) return 'The bot was not admitted from the lobby in time.';
  if (/meeting_not_found|invalid|not_found/i.test(s)) return 'The meeting link could not be opened. Check the link and try again.';
  if (/ended|not_started|no_one/i.test(s)) return 'Nobody joined the meeting, so the bot left.';
  if (/denied|removed|kicked/i.test(s)) return 'The bot was removed from the meeting or not allowed to record.';
  return `The bot could not record this meeting${s ? ` (${s})` : ''}.`;
}

// Webhook signature check (workspace secret starting with whsec_).
export function verifyWebhook(secret, headers, rawBody) {
  const get = n => headers.get(n);
  const id = get('webhook-id') || get('svix-id');
  const ts = get('webhook-timestamp') || get('svix-timestamp');
  const sigHeader = get('webhook-signature') || get('svix-signature');
  if (!secret?.startsWith('whsec_') || !id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const key = Buffer.from(secret.slice(6), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest();
  return sigHeader.split(' ').some(entry => {
    const [v, sig] = entry.split(',');
    if (v !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}
