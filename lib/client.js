'use client';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

let client;
export function supabase() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mahdar-auth' } });
  return client;
}

export async function accessToken() {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token || null;
}

// Calls one of our API routes as the signed-in user.
export async function api(path, body) {
  const token = await accessToken();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status}).`);
  return j;
}

// Uploads a file with progress. Resolves when the server has stored it.
export function uploadWithProgress(meetingId, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?id=${encodeURIComponent(meetingId)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let j = {};
      try { j = JSON.parse(xhr.responseText); } catch {}
      xhr.status >= 200 && xhr.status < 300 ? resolve(j) : reject(new Error(j.error || `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.send(file);
  });
}

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  try { return new Intl.DateTimeFormat('en-GB', opts).format(new Date(iso)); } catch { return ''; }
}
export function fmtHijri(iso) {
  try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); } catch { return ''; }
}

export function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2800);
}

export async function copyText(s, label = 'Text') {
  try { await navigator.clipboard.writeText(s); toast(`${label} copied`); }
  catch { toast('Copy failed. Select the text and copy it manually.'); }
}

export function downloadFile(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
