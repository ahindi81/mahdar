import fs from 'node:fs/promises';

const BASE = 'https://generativelanguage.googleapis.com';
const TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe';

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('The AI service is not configured yet (GEMINI_API_KEY is missing on the server).');
  return k;
}

async function gfetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'x-goog-api-key': key(), ...(opts.headers || {}) } });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try { const j = await r.json(); if (j?.error?.message) msg = j.error.message; } catch {}
    const e = new Error(msg); e.status = r.status;
    if (r.status === 429) e.message = 'The AI service is busy (free-tier limit reached). Please try again in a minute.';
    throw e;
  }
  return r;
}

let textModel = null;
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

export function parseTranscription(j, offset) {
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const turns = [];
  for (const p of parts) {
    const at = p.audioTranscription;
    if (!at || !Array.isArray(at.words) || !at.words.length) continue;
    const text = at.words.map(w => w.word || '').join(' ').replace(/\s+([,.!?،؟:;])/g, '$1').trim();
    const t0 = secs(at.words[0].startOffset);
    const spk = at.speakerLabel || '';
    const last = turns[turns.length - 1];
    if (last && last.spk === spk) last.text += ' ' + text;
    else turns.push({ spk, t: t0 == null ? null : t0 + offset, text });
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
        generationConfig: { audioTranscriptionConfig: { diarization: true, languageCodes: langCodes } }
      })
    });
    const turns = parseTranscription(await r.json(), offset);
    if (turns.length) return turns;
  } catch (e) {
    if (e.status === 429) throw e;
    console.warn('[transcribe] falling back:', e.message);
  }
  return transcribeWithTextModel(file, offset);
}

async function transcribeWithTextModel(file, offset) {
  const model = await pickTextModel();
  const prompt = 'Transcribe this meeting recording word for word in the language actually spoken (Arabic stays in Arabic script, English in English; keep code-switching as spoken). ' +
    'Identify different speakers as spk_1, spk_2, ... Reply with ONLY a JSON array of objects {"spk": string, "start": number (seconds from the start), "text": string}, one object per speaker turn.';
  const r = await gfetch(`${BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const text = (await r.json())?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let arr;
  try { arr = JSON.parse(text); } catch { const m = text.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : []; }
  return (Array.isArray(arr) ? arr : [])
    .filter(x => x && x.text)
    .map(x => ({ spk: String(x.spk || ''), t: secs(x.start) == null ? null : secs(x.start) + offset, text: String(x.text).trim() }));
}

export async function generate(prompt, { json = false } = {}) {
  const model = await pickTextModel();
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  if (json) body.generationConfig = { responseMimeType: 'application/json' };
  const r = await gfetch(`${BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const text = (await r.json())?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!text) throw new Error('The AI service returned an empty answer. Please try again.');
  if (!json) return text;
  try { return JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('The minutes came back in an unexpected format. Please try again.');
  }
}
