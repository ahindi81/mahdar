import fs from 'node:fs/promises';

const BASE = 'https://generativelanguage.googleapis.com';
const TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe';

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('The AI service is not configured yet (GEMINI_API_KEY is missing on the server).');
  return k;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Calls the Gemini API, waiting and retrying when the service is busy (503) or rate-limited (429).
async function gfetch(url, opts = {}, { tries = 5, timeoutMs = 120000 } = {}) {
  let last;
  for (let attempt = 0; attempt < tries; attempt++) {
    let r;
    try {
      r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs), headers: { 'x-goog-api-key': key(), ...(opts.headers || {}) } });
    } catch (e) {
      last = Object.assign(new Error(e.name === 'TimeoutError' ? 'The AI service took too long to answer.' : 'Could not reach the AI service.'), { status: 0 });
      console.warn(`[gemini] ${last.message} (${url.split('/models/')[1]?.split(':')[0] || 'files'}); attempt ${attempt + 1}/${tries}`);
      if (attempt < tries - 1) await sleep(2000 * (attempt + 1));
      continue;
    }
    if (r.ok) return r;
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j?.error?.message) msg = j.error.message; } catch {}
    last = Object.assign(new Error(msg), { status: r.status });
    if (!RETRYABLE.has(r.status)) break;
    const wait = Math.min(30000, (r.status === 429 ? 6000 : 3000) * 2 ** attempt) + Math.random() * 1000;
    console.warn(`[gemini] ${r.status} on ${url.split('/models/')[1]?.split(':')[0] || url.split('/v1beta/')[1]}; retry ${attempt + 1}/${tries - 1} in ${Math.round(wait / 1000)}s`);
    if (attempt < tries - 1) await sleep(wait);
  }
  if (last?.status === 429) last.message = 'The AI service limit was reached. Please try again in a few minutes.';
  else if (last?.status >= 500) last.message = 'Google\'s AI service is busy right now. Please try again in a few minutes.';
  throw last;
}

let textModel = null;
let textModels = null;
async function textModelList() {
  if (textModels) return textModels;
  const primary = await pickTextModel();
  const extra = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
  textModels = [primary, 'gemini-2.5-flash', ...(cachedNames || []).filter(n => n !== primary).slice(0, 1), ...extra].filter((v, i, a) => v && a.indexOf(v) === i);
  return textModels;
}
let cachedNames = null;
export async function pickTextModel() {
  if (process.env.GEMINI_TEXT_MODEL) return process.env.GEMINI_TEXT_MODEL;
  if (textModel) return textModel;
  try {
    const j = await (await gfetch(`${BASE}/v1beta/models?pageSize=200`)).json();
    const names = (j.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(n => /^gemini-[\d.]+-flash/.test(n) && !/(lite|tts|image|live|transcribe|audio|embed|exp|8b|thinking)/.test(n));
    const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    names.sort((a, b) => (/preview/.test(a) - /preview/.test(b)) || ver(b) - ver(a) || a.length - b.length);
    cachedNames = names;
    textModel = names[0] || 'gemini-2.5-flash';
  } catch {
    textModel = 'gemini-2.5-flash';
  }
  return textModel;
}

export async function uploadFile(filePath, mimeType) {
  const data = await fs.readFile(filePath);
  const start = await gfetch(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(data.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: 'mahdar-' + Date.now() } })
  });
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('The AI service did not accept the upload.');
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: data
  });
  if (!up.ok) throw new Error(`Audio upload failed (${up.status}).`);
  let file = (await up.json()).file;
  for (let i = 0; i < 90 && file.state === 'PROCESSING'; i++) {
    await new Promise(r => setTimeout(r, 2000));
    file = await (await gfetch(`${BASE}/v1beta/${file.name}`)).json();
  }
  if (file.state === 'FAILED') throw new Error('The AI service could not read this audio.');
  return { uri: file.uri, name: file.name, mimeType };
}

export async function deleteFile(name) {
  try { await gfetch(`${BASE}/v1beta/${name}`, { method: 'DELETE' }); } catch {}
}

const secs = v => { if (v == null) return null; const n = parseFloat(String(v)); return Number.isFinite(n) ? n : null; };

const normSpk = l => { const m = String(l || '').match(/(\d+)/); return m ? `spk_${+m[1] + (/:0*\d/.test(l) || /_0$/.test(l) ? 1 : 0)}` : ''; };

export function parseTranscription(j, offset) {
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const turns = [];
  for (const p of parts) {
    const at = p.audioTranscription;
    if (!at) continue;
    const words = Array.isArray(at.words) ? at.words : [];
    const text = (words.length ? words.map(w => w.word || '').join(' ') : (at.text || p.text || '')).replace(/\s+([,.!?،؟:;])/g, '$1').trim();
    if (!text) continue;
    const t0 = words.length ? secs(words[0].startOffset) : secs(at.startOffset);
    const spk = normSpk(at.speakerLabel);
    const last = turns[turns.length - 1];
    if (last && last.spk === spk) last.text += ' ' + text;
    else turns.push({ spk, t: t0 == null ? (turns.length ? null : offset) : t0 + offset, text });
  }
  return turns;
}

function parseTextTranscript(text, offset) {
  const turns = [];
  for (const line of String(text || '').split(/\n+/)) {
    const l = line.trim();
    if (!l) continue;
    const m = l.match(/^\[?\s*(spk_\d+|speaker[ _]?\d+)\s*\]?\s*[:：-]\s*(.*)$/i);
    const spk = m ? m[1].toLowerCase().replace(/speaker[ _]?/, 'spk_') : '';
    const body = m ? m[2] : l;
    const last = turns[turns.length - 1];
    if (last && spk && last.spk === spk) last.text += ' ' + body;
    else turns.push({ spk, t: turns.length ? null : offset, text: body });
  }
  return turns;
}

// Speech-to-text with speaker labels. Falls back to a general model if the transcription model is unavailable.
export async function transcribe(file, { langCodes = [], offset = 0 } = {}) {
  try {
    const r = await gfetch(`${BASE}/v1beta/models/${TRANSCRIBE_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType } }] }],
        generationConfig: { audioTranscriptionConfig: { diarization: true, wordTimestamp: true, languageCodes: langCodes } }
      })
    }, { tries: 4, timeoutMs: 600000 });
    const j = await r.json();
    let turns = parseTranscription(j, offset);
    if (!turns.length) {
      const text = (j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
      turns = parseTextTranscript(text, offset);
      const shape = JSON.stringify(j).slice(0, 600);
      console.warn(`[transcribe] no word-level parts; text turns=${turns.length}; response starts: ${shape}`);
    }
    if (turns.length) return turns;
  } catch (e) {
    console.warn(`[transcribe] ${TRANSCRIBE_MODEL} failed (${e.status}): ${e.message}`);
  }
  return transcribeWithTextModel(file, offset);
}

async function transcribeWithTextModel(file, offset) {
  const prompt = 'Transcribe this meeting recording word for word in the language actually spoken (Arabic stays in Arabic script, English in English; keep code-switching as spoken). ' +
    'Identify different speakers as spk_1, spk_2, ... Reply with ONLY a JSON array of objects {"spk": string, "start": number (seconds from the start), "text": string}, one object per speaker turn.';
  const arr = await generate(null, { json: true, parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType } }, { text: prompt }] });
  return (Array.isArray(arr) ? arr : [])
    .filter(x => x && x.text)
    .map(x => ({ spk: String(x.spk || ''), t: secs(x.start) == null ? null : secs(x.start) + offset, text: String(x.text).trim() }));
}

export async function generate(prompt, { json = false, parts = null } = {}) {
  const body = { contents: [{ role: 'user', parts: parts || [{ text: prompt }] }] };
  if (json) body.generationConfig = { responseMimeType: 'application/json' };
  let lastErr;
  for (const model of await textModelList()) {
    try {
      const r = await gfetch(`${BASE}/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      }, { tries: 3, timeoutMs: 90000 });
      const text = (await r.json())?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (!text) throw Object.assign(new Error('The AI service returned an empty answer. Please try again.'), { status: 0 });
      if (!json) return text;
      try { return JSON.parse(text); } catch {
        const m = text.match(/[\[{][\s\S]*[\]}]/);
        if (m) return JSON.parse(m[0]);
        throw new Error('The minutes came back in an unexpected format. Please try again.');
      }
    } catch (e) {
      lastErr = e;
      if (!(e.status >= 500 || e.status === 429 || e.status === 404 || e.status === 0)) throw e; // busy, missing or unreachable models move on to the next
      console.warn(`[gemini] model ${model} unavailable (${e.status}); trying next`);
    }
  }
  throw lastErr;
}
