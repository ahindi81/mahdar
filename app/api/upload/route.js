import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { authed, json, unauthorized } from '@/lib/server';
import { processRecording, userSaver } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

// Body: the raw audio/video file. Query: ?id=<meeting id>. Returns as soon as the file is stored; processing continues in the background.
export async function POST(req) {
  const auth = await authed(req);
  if (!auth) return unauthorized();
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Missing meeting id.' }, 400);

  const { data: meeting, error } = await auth.sb.from('meetings').select('*').eq('id', id).single();
  if (error || !meeting) return json({ error: 'Meeting not found.' }, 404);
  if (!req.body) return json({ error: 'No file was received.' }, 400);

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mahdar-'));
  const inputPath = path.join(workDir, 'input');
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) return cb(new Error('too_large'));
      cb(null, chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(req.body), limiter, fs.createWriteStream(inputPath));
  } catch (e) {
    await fsp.rm(workDir, { recursive: true, force: true });
    const msg = e.message === 'too_large' ? 'This file is larger than 1 GB. Export the audio only (MP3 or M4A) and try again.' : 'The upload was interrupted. Please try again.';
    await auth.sb.from('meetings').update({ status: 'failed', error: msg }).eq('id', id);
    return json({ error: msg }, e.message === 'too_large' ? 413 : 400);
  }
  if (bytes < 1000) {
    await fsp.rm(workDir, { recursive: true, force: true });
    await auth.sb.from('meetings').update({ status: 'failed', error: 'The recording is empty.' }).eq('id', id);
    return json({ error: 'The recording is empty.' }, 400);
  }

  // Not awaited: the browser polls the meeting row for progress.
  processRecording({ meeting, inputPath, workDir, save: userSaver(auth.sb, id) });
  return json({ ok: true, bytes });
}
