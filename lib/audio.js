import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

export const SEGMENT_SECONDS = 25 * 60; // Gemini allows 30 min per request with speaker labels

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); if (err.length > 200000) err = err.slice(-100000); });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve(err) : reject(new Error('ffmpeg failed: ' + err.slice(-400)))));
  });
}

function parseDuration(stderr) {
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const m = times.length ? times[times.length - 1] : stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : null;
}

// Converts any audio or video file to small mono Opus parts of up to 25 minutes.
export async function prepareAudio(inputPath, workDir) {
  const pattern = path.join(workDir, 'part%03d.ogg');
  let stderr;
  try {
    stderr = await run(['-hide_banner', '-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '24k',
      '-f', 'segment', '-segment_time', String(SEGMENT_SECONDS), '-reset_timestamps', '1', pattern]);
  } catch (e) {
    if (/Invalid data|could not find codec|does not contain any stream|Output file .* does not contain/i.test(e.message)) {
      throw new Error('This file has no readable audio. Try exporting it as MP3 or M4A.');
    }
    throw e;
  }
  const parts = (await fs.readdir(workDir)).filter(f => /^part\d+\.ogg$/.test(f)).sort().map(f => path.join(workDir, f));
  if (!parts.length) throw new Error('No audio was found in this file.');
  return { parts, durationSec: parseDuration(stderr) };
}
