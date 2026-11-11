'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, accessToken, uploadWithProgress, api } from '@/lib/client';
import { parseTranscriptText, speakersFromTurns, fmtClock } from '@/lib/meeting';
import { IconMic, IconUpload, IconDoc } from '@/components/Icons';
import { useApp } from '@/components/AppContext';

const ACCEPT = 'audio/*,video/*,.m4a,.mp3,.wav,.ogg,.oga,.opus,.flac,.aac,.webm,.mp4,.mov,.mkv,.amr,.3gp';

export default function NewMeeting() {
  const router = useRouter();
  const { refreshUsage } = useApp();
  const [tab, setTab] = useState('record');
  const [title, setTitle] = useState('');
  const [langHint, setLangHint] = useState('auto');
  const [outLang, setOutLang] = useState('same');
  const [busy, setBusy] = useState(null); // {label, pct}
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setLangHint(localStorage.getItem('mahdar.langHint') || 'auto');
      setOutLang(localStorage.getItem('mahdar.outLang') || 'same');
    } catch {}
  }, []);
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  async function createMeeting(fields) {
    const { data, error } = await supabase().from('meetings')
      .insert({ title: title.trim(), lang_hint: langHint, out_lang: outLang, ...fields })
      .select('id').single();
    if (error) throw new Error('Could not create the meeting: ' + error.message);
    return data.id;
  }

  async function sendFile(file, source) {
    setError('');
    if (!file || file.size < 1000) { setError('That file is empty.'); return; }
    if (file.size > 1024 ** 3) { setError('This file is larger than 1 GB. Export the audio only (MP3 or M4A) and try again.'); return; }
    try {
      setBusy({ label: 'Creating meeting', pct: 0 });
      const id = await createMeeting({ source, status: 'uploading', file_name: file.name || null, title: title.trim() || (source === 'upload' ? (file.name || '').replace(/\.[^.]+$/, '') : '') });
      const token = await accessToken();
      await uploadWithProgress(id, file, token, p => setBusy({ label: source === 'record' ? 'Saving recording' : 'Uploading', pct: p * 100 }));
      refreshUsage?.();
      router.push(`/app/m/${id}`);
    } catch (e) {
      setBusy(null); setError(e.message);
    }
  }

  async function sendTranscript(raw) {
    setError('');
    const turns = parseTranscriptText(raw);
    if (!turns.length) { setError('Paste or import a transcript first.'); return; }
    try {
      setBusy({ label: 'Saving transcript', pct: null });
      const last = [...turns].reverse().find(t => t.t != null);
      const id = await createMeeting({ source: 'transcript', status: 'processing', stage: 'Writing the minutes', transcript: turns, speakers: speakersFromTurns(turns), duration_sec: last ? Math.round(last.t) : null });
      api('/api/minutes', { id }).catch(() => {}); // the meeting page shows progress and any error
      router.push(`/app/m/${id}`);
    } catch (e) {
      setBusy(null); setError(e.message);
    }
  }

  return (
    <div className="new-grid">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>New meeting</h1></div>
      <div className="row2">
        <div className="field"><label htmlFor="title">Meeting title (optional)</label>
          <input id="title" type="text" dir="auto" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly progress meeting – Villa project" /></div>
        <div className="field"><label htmlFor="langHint">Spoken language</label>
          <select id="langHint" value={langHint} onChange={e => { setLangHint(e.target.value); remember('mahdar.langHint', e.target.value); }}>
            <option value="auto">Detect (mixed Arabic/English)</option><option value="ar">Mostly Arabic</option><option value="en">Mostly English</option>
          </select></div>
        <div className="field"><label htmlFor="outLang">Minutes language</label>
          <select id="outLang" value={outLang} onChange={e => { setOutLang(e.target.value); remember('mahdar.outLang', e.target.value); }}>
            <option value="same">Same as the meeting</option><option value="ar">Arabic</option><option value="en">English</option>
          </select></div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="tabs" role="tablist" style={{ padding: '0 12px' }}>
          {[['record', 'Record now', IconMic], ['upload', 'Upload recording', IconUpload], ['paste', 'Paste or import transcript', IconDoc]].map(([k, l, Ic]) => (
            <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} disabled={!!busy} onClick={() => setTab(k)}><Ic width={17} height={17} />{l}</button>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          {error && <div className="notice bad" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
          {busy ? <Busy {...busy} />
            : tab === 'record' ? <Recorder onDone={blob => sendFile(blob, 'record')} onError={setError} />
            : tab === 'upload' ? <Upload onFile={f => sendFile(f, 'upload')} />
            : <Paste onSubmit={sendTranscript} />}
        </div>
      </div>
      <p className="hint">Tell participants before you record. Audio is deleted once the transcript is ready.</p>
    </div>
  );
}

function Busy({ label, pct }) {
  return (
    <div className="progress" aria-live="polite" style={{ padding: '24px 0' }}>
      <div className="toolbar"><span className="spinner" /><b>{label}</b>{pct != null && <span className="muted mono">{Math.round(pct)}%</span>}</div>
      {pct != null && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
      <span className="hint">Keep this page open until the upload finishes. Processing then continues on our servers.</span>
    </div>
  );
}

function Upload({ onFile }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <input ref={input} id="file" type="file" accept={ACCEPT} hidden onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div className={'drop' + (over ? ' over' : '')} role="button" tabIndex={0}
        onClick={() => input.current.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current.click(); } }}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
        <span className="ic"><IconUpload width={26} height={26} /></span>
        <b>Drop a meeting recording here, or click to choose</b>
        <span className="hint">MP3, M4A, WAV, OGG, WebM, or video (MP4, MOV) · up to 1 GB · long meetings are fine</span>
      </div>
    </>
  );
}

function Recorder({ onDone, onError }) {
  const [state, setState] = useState('idle'); // idle | recording | paused
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState(() => Array(32).fill(4));
  const rec = useRef(null), chunks = useRef([]), stream = useRef(null), raf = useRef(0), ticker = useRef(0), lock = useRef(null), startAt = useRef(0), acc = useRef(0), ctx = useRef(null);

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state === 'idle') return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  function cleanup() {
    cancelAnimationFrame(raf.current); clearInterval(ticker.current);
    stream.current?.getTracks().forEach(t => t.stop());
    try { ctx.current?.close(); } catch {}
    try { lock.current?.release(); } catch {}
  }

  async function start() {
    onError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { onError('This browser cannot record audio. Use Chrome, Edge or Safari, or upload a recording.'); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch { onError('Microphone access was blocked. Allow the microphone for this site in your browser settings and try again.'); return; }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    rec.current = new MediaRecorder(stream.current, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    chunks.current = [];
    rec.current.ondataavailable = e => e.data.size && chunks.current.push(e.data);
    rec.current.start(1000);
    acc.current = 0; startAt.current = Date.now(); setElapsed(0); setState('recording');
    ticker.current = setInterval(() => setElapsed(acc.current + (rec.current?.state === 'recording' ? (Date.now() - startAt.current) / 1000 : 0)), 500);
    try { lock.current = await navigator.wakeLock?.request('screen'); } catch {}
    try {
      ctx.current = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.current.createAnalyser(); an.fftSize = 64;
      ctx.current.createMediaStreamSource(stream.current).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const draw = () => { an.getByteFrequencyData(buf); setLevels(Array.from(buf.slice(0, 32), v => 4 + (v / 255) * 36)); raf.current = requestAnimationFrame(draw); };
      draw();
    } catch {}
  }
  function pause() { rec.current.pause(); acc.current += (Date.now() - startAt.current) / 1000; setState('paused'); }
  function resume() { rec.current.resume(); startAt.current = Date.now(); setState('recording'); }
  function stop() {
    const r = rec.current;
    r.onstop = () => {
      const mime = r.mimeType || 'audio/webm';
      const ext = mime.includes('mp4') ? 'm4a' : 'webm';
      const file = new File(chunks.current, `recording-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`, { type: mime });
      cleanup(); setState('idle');
      onDone(file);
    };
    r.stop();
  }

  return (
    <div className="rec-panel">
      <div className="rec-clock" aria-live="off">{fmtClock(elapsed)}</div>
      <div className="wave" aria-hidden="true">{levels.map((h, i) => <i key={i} style={{ height: state === 'recording' ? h : 4, opacity: state === 'recording' ? 1 : .35 }} />)}</div>
      {state === 'idle' && <>
        <button className="btn btn-primary btn-lg" type="button" onClick={start}><IconMic width={20} height={20} />Start recording</button>
        <span className="hint">Place your laptop or phone in the middle of the table. Keep this tab open while recording.</span>
      </>}
      {state !== 'idle' && <div className="toolbar" style={{ justifyContent: 'center' }}>
        {state === 'recording'
          ? <button className="btn" type="button" onClick={pause}>Pause</button>
          : <button className="btn" type="button" onClick={resume}>Resume</button>}
        <button className="btn btn-rec btn-lg" type="button" onClick={stop}><span className={'dot' + (state === 'recording' ? ' pulse' : '')} />Stop and create minutes</button>
      </div>}
      {state === 'paused' && <span className="chip warn">Paused</span>}
    </div>
  );
}

function Paste({ onSubmit }) {
  const [text, setText] = useState('');
  const file = useRef(null);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <textarea id="transcript" dir="auto" value={text} onChange={e => setText(e.target.value)} aria-label="Transcript"
        placeholder={'Paste a transcript. Lines like “Faisal: …” or “[03:15] Sara: …” keep speaker names and times.\nTeams and Zoom .vtt downloads work as is.'} />
      <input ref={file} type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" hidden onChange={async e => { const f = e.target.files[0]; if (f) setText(await f.text()); }} />
      <div className="toolbar">
        <button className="btn" type="button" onClick={() => file.current.click()}>Import .vtt, .srt or .txt</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" type="button" disabled={!text.trim()} onClick={() => onSubmit(text)}>Create minutes</button>
      </div>
    </div>
  );
}
