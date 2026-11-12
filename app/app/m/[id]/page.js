'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase, api, fmtDate, fmtHijri, copyText, downloadFile, toast } from '@/lib/client';
import { fmtClock, fmtDuration, hasArabic, speakerName, talkTime, transcriptText } from '@/lib/meeting';
import { IconSearch, IconBot, IconMail } from '@/components/Icons';
import { useApp } from '@/components/AppContext';

const COLORS = ['#6a45f5', '#0e9f8e', '#d9480f', '#2b6cd8', '#b8329d', '#7a8b0c', '#c2410c', '#475569'];
const STEPS = ['Uploading', 'Preparing audio', 'Transcribing and identifying speakers', 'Writing the minutes'];
const BOT_STEPS = ['Downloading the recording', 'Preparing audio', 'Transcribing and identifying speakers', 'Writing the minutes', 'Emailing the minutes'];
const LIVE = ['scheduled', 'joining', 'waiting', 'recording'];
const BUSY = [...LIVE, 'uploading', 'processing'];

export default function MeetingPage() {
  const { id } = useParams();
  const router = useRouter();
  const { refreshUsage } = useApp();
  const [m, setM] = useState(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState('summary');
  const [rewriting, setRewriting] = useState(false);
  const [err, setErr] = useState('');
  const retick = useRef(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('meetings').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setMissing(true); return null; }
    setM(data); return data;
  }, [id]);

  useEffect(() => {
    let timer, alive = true, n = 0;
    const tick = async () => {
      let d = await load();
      if (!alive) return;
      // For bot meetings, ask the bot service directly every few polls (covers missed webhooks).
      if (d?.bot_id && (LIVE.includes(d.status) || d.status === 'processing') && n++ % 3 === 0) {
        try { await api('/api/bot/sync', { id: d.id }); d = await load(); } catch {}
        if (!alive) return;
      }
      if (d && (BUSY.includes(d.status) || d.stage)) timer = setTimeout(tick, d.status === 'scheduled' ? 20000 : 4000);
      else if (d) refreshUsage?.();
    };
    retick.current = () => { clearTimeout(timer); tick(); };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [load, refreshUsage]);

  async function save(fields) {
    setM(prev => ({ ...prev, ...fields }));
    const { error } = await supabase().from('meetings').update(fields).eq('id', id);
    if (error) toast('Could not save the change.');
  }

  async function rewrite(outLang) {
    setErr(''); setRewriting(true);
    try { const { meeting } = await api('/api/minutes', { id, outLang }); setM(meeting); toast('Minutes rewritten'); }
    catch (e) { setErr(e.message); }
    setRewriting(false);
  }

  async function retryBot() {
    setErr('');
    try { await api('/api/bot/retry', { id }); const d = await load(); if (d) setM(d); retick.current?.(); }
    catch (e) { setErr(e.message); }
  }

  async function remove() {
    if (!window.confirm('Delete this meeting, its transcript and minutes? This cannot be undone.')) return;
    await supabase().from('meetings').delete().eq('id', id);
    refreshUsage?.();
    router.replace('/app');
  }

  if (missing) return <div className="card state-box"><h2>Meeting not found</h2><p className="muted">It may have been deleted.</p><Link className="btn" href="/app">Back to meetings</Link></div>;
  if (!m) return <div className="state-box"><span className="spinner" /></div>;

  const n = m.minutes;
  const speakers = Object.keys(m.speakers || {});

  return (
    <>
      <div className="mhead">
        <div className="mhead-top">
          <TitleEdit value={m.title || n?.title || 'Untitled meeting'} onSave={t => save({ title: t })} />
          {m.status === 'ready' && <ExportMenu m={m} />}
          <button className="btn btn-ghost btn-danger btn-sm" type="button" onClick={remove}>Delete</button>
        </div>
        <div className="meta">
          <span>{fmtDate(m.created_at, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <span lang="ar" dir="rtl">{fmtHijri(m.created_at)}</span>
          {m.duration_sec ? <span className="mono">{fmtDuration(m.duration_sec)}</span> : null}
          {speakers.length ? <span>{speakers.length} speakers</span> : null}
          <span>{{ upload: 'Uploaded recording', record: 'Recorded in browser', transcript: 'Imported transcript', bot: `Recorded by bot${m.platform ? ' · ' + ({ teams: 'Microsoft Teams', zoom: 'Zoom', meet: 'Google Meet', webex: 'Webex' }[m.platform] || '') : ''}` }[m.source]}</span>
        </div>
      </div>

      {err && <div className="notice bad" role="alert" style={{ marginBottom: 14 }}>{err}</div>}

      {LIVE.includes(m.status) && <BotLive m={m} onStopped={deleted => deleted ? router.replace('/app') : load()} />}
      {(m.status === 'processing' || m.status === 'uploading') && !rewriting && <Processing m={m} />}
      {m.status === 'ready' && m.minutes && <EmailBar m={m} onSent={load} />}
      {m.status === 'failed' && (
        <div className="card state-box">
          <span className="chip bad">Processing failed</span>
          <p>{m.error || 'Something went wrong.'}</p>
          <div className="toolbar" style={{ justifyContent: 'center' }}>
            {m.bot_id ? <><button className="btn btn-primary" type="button" onClick={retryBot}>Try again</button><Link className="btn" href="/app/new">Send the bot to another meeting</Link></>
              : m.transcript?.length ? <button className="btn btn-primary" type="button" onClick={() => rewrite()}>Try writing the minutes again</button>
              : <Link className="btn btn-primary" href="/app/new">Upload again</Link>}
          </div>
        </div>
      )}

      {(m.transcript?.length > 0) && (m.status === 'ready' || rewriting || (m.status === 'failed' && !m.bot_id)) && (
        <div className="mgrid">
          <section className="card pane">
            <div className="tabs" role="tablist">
              {[['summary', 'Summary'], ['actions', `Action items${n?.action_items?.length ? ` (${n.action_items.filter(a => !a.done).length})` : ''}`], ['ask', 'Ask Mahdar']].map(([k, l]) => (
                <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            {rewriting ? <div className="state-box"><span className="spinner" /><b>Writing the minutes…</b><span className="hint">Usually 20–60 seconds.</span></div>
              : tab === 'summary' ? <Summary m={m} onRewrite={rewrite} />
              : tab === 'actions' ? <Actions m={m} onChange={items => save({ minutes: { ...n, action_items: items } })} />
              : <Ask m={m} onQa={qa => setM(prev => ({ ...prev, qa }))} />}
          </section>
          <section className="card pane">
            <Transcript m={m} onRename={(spk, name) => save({ speakers: { ...m.speakers, [spk]: name } })} />
          </section>
        </div>
      )}
    </>
  );
}

function TitleEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) return <h1 dir="auto" onClick={() => setEditing(true)} title="Click to rename" style={{ cursor: 'text' }}>{value}</h1>;
  const done = () => { setEditing(false); if (v.trim() && v.trim() !== value) onSave(v.trim()); };
  return <input type="text" dir="auto" autoFocus value={v} onChange={e => setV(e.target.value)} onBlur={done}
    onKeyDown={e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setV(value); setEditing(false); } }}
    style={{ flex: '1 1 300px', fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 600 }} aria-label="Meeting title" />;
}

function BotLive({ m, onStopped }) {
  const [busy, setBusy] = useState(false);
  const scheduled = m.status === 'scheduled';
  async function stop() {
    const q = scheduled ? 'Cancel the scheduled bot for this meeting?' : 'Stop recording now? The bot leaves the meeting and the minutes are prepared from what was recorded so far.';
    if (!window.confirm(q)) return;
    setBusy(true);
    try { const r = await api('/api/bot/stop', { id: m.id }); onStopped(r.deleted); }
    catch (e) { toast(e.message); }
    setBusy(false);
  }
  const label = { scheduled: 'Scheduled', joining: 'Joining', waiting: 'In the lobby', recording: 'Recording' }[m.status];
  return (
    <div className="card state-box" aria-live="polite">
      <span className={'chip ' + (m.status === 'recording' ? 'bad' : m.status === 'waiting' ? 'warn' : 'violet')}>
        {m.status === 'recording' ? <span className="dot pulse" /> : <IconBot width={14} height={14} />}{label}
      </span>
      <h2 style={{ fontSize: 20 }}>
        {scheduled ? `Mahdar will join at ${fmtDate(m.join_at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : (m.stage || 'Joining the meeting')}
      </h2>
      {m.status === 'waiting' && <p className="muted">In Teams, open the participants list and click <b>Admit</b> next to “Mahdar Notetaker”.</p>}
      {m.status === 'recording' && <p className="muted">The minutes will be ready a few minutes after the meeting ends{m.auto_email && m.recipients?.length ? `, then emailed to ${m.recipients.length} ${m.recipients.length === 1 ? 'person' : 'people'}` : ''}.</p>}
      {m.meeting_url && <a className="hint" href={m.meeting_url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>Open the meeting link</a>}
      <button className="btn btn-sm" type="button" disabled={busy} onClick={stop}>{scheduled ? 'Cancel bot' : 'Stop recording'}</button>
    </div>
  );
}

function EmailBar({ m, onSent }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState((m.recipients || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => setTo((m.recipients || []).join(', ')), [m.recipients]);
  async function send() {
    setErr(''); setBusy(true);
    try { const r = await api('/api/email', { id: m.id, recipients: to.split(/[\s,;]+/).filter(Boolean) }); toast(`Minutes emailed to ${r.count} ${r.count === 1 ? 'person' : 'people'}`); setOpen(false); onSent(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const status = m.stage === 'Emailing the minutes' ? <span className="toolbar"><span className="spinner" />Emailing the minutes…</span>
    : m.email_status === 'sent' ? <span>Emailed to <b>{(m.recipients || []).join(', ')}</b>{m.emailed_at ? ` · ${fmtDate(m.emailed_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
    : m.email_status === 'failed' ? <span style={{ color: 'var(--bad)' }}>Email not sent: {m.email_error}</span>
    : <span className="muted">The minutes have not been emailed yet.</span>;
  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'grid', gap: 10 }}>
      <div className="toolbar">
        <IconMail width={18} height={18} style={{ color: 'var(--violet-text)' }} />
        <div style={{ flex: '1 1 260px', minWidth: 0, overflowWrap: 'anywhere', fontSize: 14 }}>{status}</div>
        <button className="btn btn-sm" type="button" onClick={() => setOpen(o => !o)}>{m.email_status === 'sent' ? 'Send again' : 'Email minutes'}</button>
      </div>
      {open && <div className="toolbar">
        <input type="text" dir="ltr" value={to} onChange={e => setTo(e.target.value)} placeholder="name@company.com, …" aria-label="Recipients" style={{ flex: '1 1 300px', minWidth: 0 }} />
        <button className="btn btn-primary btn-sm" type="button" disabled={busy || !to.trim()} onClick={send}>{busy && <span className="spinner" />}Send</button>
      </div>}
      {err && <div className="notice bad">{err}</div>}
    </div>
  );
}

function Processing({ m }) {
  const steps = m.source === 'bot' ? BOT_STEPS : STEPS;
  const found = steps.findIndex(s => (m.stage || '').startsWith(s));
  const current = m.status === 'uploading' ? 0 : Math.max(m.source === 'bot' ? 0 : 1, found);
  return (
    <div className="card state-box" aria-live="polite">
      <span className="spinner" style={{ width: 26, height: 26, color: 'var(--violet)' }} />
      <h2 style={{ fontSize: 20 }}>{m.stage || (m.status === 'uploading' ? 'Waiting for the upload' : 'Processing')}…</h2>
      <div style={{ display: 'grid', gap: 8, textAlign: 'start' }}>
        {steps.filter(s => s !== 'Emailing the minutes' || (m.auto_email && m.recipients?.length)).map((s, i) => (
          <div key={s} className="toolbar" style={{ color: i < current ? 'var(--good)' : i === current ? 'var(--fg)' : 'var(--muted)' }}>
            <span style={{ width: 18 }}>{i < current ? '✓' : i === current ? '•' : '○'}</span><span>{s}</span>
          </div>
        ))}
      </div>
      <p className="hint">A one-hour meeting usually takes 2–5 minutes. You can leave this page; the meeting keeps processing.</p>
    </div>
  );
}

function Summary({ m, onRewrite }) {
  const n = m.minutes;
  const [lang, setLang] = useState(m.out_lang || 'same');
  if (!n) return (
    <div className="state-box"><p>The transcript is ready but the minutes are not written yet.</p>
      <button className="btn btn-primary" type="button" onClick={() => onRewrite(lang)}>Write the minutes</button></div>
  );
  const dir = hasArabic(n.overview) ? 'rtl' : 'ltr';
  return (
    <div>
      <div dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
        <div className="sec"><h3>Overview</h3><p>{n.overview}</p></div>
        {n.keywords?.length > 0 && <div className="sec"><h3>Topics</h3><div className="kw">{n.keywords.map(k => <span key={k} className="chip violet">{k}</span>)}</div></div>}
        {n.decisions?.length > 0 && <div className="sec"><h3>Decisions <span className="chip">{n.decisions.length}</span></h3>{n.decisions.map((d, i) => <div key={i} className="decision">{d}</div>)}</div>}
        {n.key_points?.length > 0 && <div className="sec"><h3>Key points</h3><ul>{n.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul></div>}
        {n.open_questions?.length > 0 && <div className="sec"><h3>Open questions</h3><ul>{n.open_questions.map((k, i) => <li key={i}>{k}</li>)}</ul></div>}
        {n.follow_up_email?.body && <div className="sec"><h3>Follow-up email</h3>
          <div className="email"><b>{n.follow_up_email.subject}</b>{n.follow_up_email.body}</div>
          <div><button className="btn btn-sm" type="button" onClick={() => copyText(`${n.follow_up_email.subject}\n\n${n.follow_up_email.body}`, 'Email')}>Copy email</button></div></div>}
      </div>
      <div className="toolbar" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <label className="hint" htmlFor="rewriteLang">Minutes language</label>
        <select id="rewriteLang" value={lang} onChange={e => setLang(e.target.value)} style={{ width: 'auto' }}>
          <option value="same">Same as meeting</option><option value="ar">Arabic</option><option value="en">English</option>
        </select>
        <button className="btn btn-sm" type="button" onClick={() => onRewrite(lang)}>Rewrite minutes</button>
      </div>
    </div>
  );
}

function Actions({ m, onChange }) {
  const items = m.minutes?.action_items || [];
  if (!items.length) return <div className="state-box"><p className="muted">No action items were agreed in this meeting.</p></div>;
  const toggle = i => onChange(items.map((a, j) => (j === i ? { ...a, done: !a.done } : a)));
  return (
    <div>
      {items.map((a, i) => (
        <label key={i} className={'task' + (a.done ? ' done' : '')}>
          <input type="checkbox" checked={!!a.done} onChange={() => toggle(i)} />
          <div dir="auto">
            <div className="tt">{a.task}</div>
            <div className="tm">{a.owner && <span className="chip violet">{a.owner}</span>}{a.due && <span className="chip warn">{a.due}</span>}</div>
          </div>
        </label>
      ))}
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-sm" type="button" onClick={() => copyText(items.map(a => `${a.done ? '[x]' : '[ ]'} ${a.task}${a.owner ? ` (${a.owner})` : ''}${a.due ? ` – ${a.due}` : ''}`).join('\n'), 'Action items')}>Copy action items</button>
      </div>
    </div>
  );
}

function Ask({ m, onQa }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [err, setErr] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [m.qa, pending]);
  async function ask(question) {
    if (!question.trim() || busy) return;
    setErr(''); setBusy(true); setPending(question); setQ('');
    try { const { qa } = await api('/api/ask', { id: m.id, question }); onQa(qa); }
    catch (e) { setErr(e.message); setQ(question); }
    setPending(null); setBusy(false);
  }
  const qa = m.qa || [];
  return (
    <div>
      <div className="chat">
        {!qa.length && !pending && <>
          <p className="muted">Ask anything about this meeting, in Arabic or English. Answers come only from the transcript.</p>
          <div className="suggest">
            {['Who agreed to do what, and by when?', 'What risks or delays were raised?', 'لخص الاجتماع في ثلاث نقاط', 'Draft a WhatsApp update for the team'].map(s =>
              <button key={s} type="button" className="btn btn-sm" dir="auto" onClick={() => ask(s)}>{s}</button>)}
          </div>
        </>}
        {qa.map((x, i) => <div key={i} style={{ display: 'contents' }}><div className="q" dir="auto">{x.q}</div><div className="a" dir="auto">{x.a}</div></div>)}
        {pending && <><div className="q" dir="auto">{pending}</div><div className="a"><span className="spinner" /></div></>}
        <div ref={end} />
      </div>
      {err && <div className="notice bad" style={{ marginTop: 12 }}>{err}</div>}
      <form className="askrow" onSubmit={e => { e.preventDefault(); ask(q); }}>
        <input type="text" dir="auto" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask Mahdar… اسأل عن الاجتماع" aria-label="Ask a question about this meeting" disabled={busy} />
        <button className="btn btn-primary" type="submit" disabled={busy || !q.trim()}>Ask</button>
      </form>
    </div>
  );
}

function Transcript({ m, onRename }) {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const tt = useMemo(() => talkTime(m), [m]);
  const colorOf = useMemo(() => {
    const keys = Object.keys(m.speakers || {});
    return spk => COLORS[Math.max(0, keys.indexOf(spk)) % COLORS.length];
  }, [m.speakers]);
  const f = filter.trim().toLowerCase();
  const turns = (m.transcript || []).filter(t => !f || t.text.toLowerCase().includes(f) || speakerName(m, t.spk).toLowerCase().includes(f));
  const hl = text => {
    if (!f) return text;
    const i = text.toLowerCase().indexOf(f);
    return i < 0 ? text : <>{text.slice(0, i)}<mark>{text.slice(i, i + f.length)}</mark>{text.slice(i + f.length)}</>;
  };
  return (
    <div style={{ paddingTop: 16 }}>
      {tt.length > 1 && (
        <div className="sec">
          <h3>Talk time</h3>
          <div className="tt-list">
            {tt.map(s => (
              <div key={s.spk} className="tt-row">
                <span className="nm" dir="auto">{s.name}</span>
                <div className="meter"><i style={{ width: `${Math.round(s.share * 100)}%`, background: colorOf(s.spk) }} /></div>
                <span className="mono muted">{Math.round(s.share * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="sec" style={{ marginBottom: 12 }}>
        <div className="toolbar">
          <h3 style={{ marginInlineEnd: 'auto' }}>Transcript</h3>
          <button className="btn btn-sm btn-ghost" type="button" onClick={() => copyText(transcriptText(m, 1e9), 'Transcript')}>Copy</button>
        </div>
        <label className="search" style={{ flex: 'none' }}>
          <IconSearch width={16} height={16} />
          <input type="search" placeholder="Search the transcript" value={filter} onChange={e => setFilter(e.target.value)} dir="auto" aria-label="Search the transcript" />
        </label>
        {Object.keys(m.speakers || {}).length > 0 && <span className="hint">Click a speaker’s name to rename them everywhere.</span>}
      </div>
      <div className="transcript">
        {turns.map((t, i) => (
          <div key={i} className="turn">
            <span className="av" style={{ background: t.spk ? colorOf(t.spk) : 'var(--muted)' }}>{(speakerName(m, t.spk) || '·').trim().charAt(0).toUpperCase()}</span>
            <div style={{ minWidth: 0 }}>
              <div className="hd">
                {t.spk && editing === t.spk
                  ? <input type="text" autoFocus defaultValue={speakerName(m, t.spk)} style={{ width: 200, padding: '3px 8px' }} aria-label="Speaker name"
                      onBlur={e => { const v = e.target.value.trim(); if (v) onRename(t.spk, v); setEditing(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(null); }} />
                  : t.spk ? <button type="button" className="spk" style={{ color: colorOf(t.spk) }} onClick={() => setEditing(t.spk)} dir="auto">{speakerName(m, t.spk)}</button> : null}
                {t.t != null && <span className="ts mono">{fmtClock(t.t)}</span>}
              </div>
              <div className="tx" dir="auto">{hl(t.text)}</div>
            </div>
          </div>
        ))}
        {!turns.length && <p className="muted">No lines match “{filter}”.</p>}
      </div>
    </div>
  );
}

function ExportMenu({ m }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const name = (m.title || 'meeting').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
  const items = [
    ['Word document (.doc)', () => downloadFile(`${name} - minutes.doc`, wordHtml(m), 'application/msword')],
    ['Markdown (.md)', () => downloadFile(`${name} - minutes.md`, markdown(m), 'text/markdown')],
    ['Transcript (.txt)', () => downloadFile(`${name} - transcript.txt`, transcriptText(m, 1e9), 'text/plain')],
    ['Copy minutes', () => copyText(markdown(m), 'Minutes')]
  ];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-sm" type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}>Export ▾</button>
      {open && (
        <div className="card" role="menu" style={{ position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', zIndex: 20, minWidth: 220, padding: 6, boxShadow: 'var(--shadow)', display: 'grid' }}>
          {items.map(([l, fn]) => <button key={l} role="menuitem" type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => { fn(); setOpen(false); }}>{l}</button>)}
        </div>
      )}
    </div>
  );
}

function markdown(m) {
  const n = m.minutes || {};
  const L = [`# ${m.title || n.title || 'Meeting'}`, '', `${fmtDate(m.created_at)} · ${fmtHijri(m.created_at)}${m.duration_sec ? ' · ' + fmtDuration(m.duration_sec) : ''}`, ''];
  const sp = Object.values(m.speakers || {}); if (sp.length) L.push(`Attendees: ${sp.join(', ')}`, '');
  if (n.overview) L.push('## Overview', '', n.overview, '');
  if (n.decisions?.length) L.push('## Decisions', '', ...n.decisions.map(x => `- ${x}`), '');
  if (n.action_items?.length) { L.push('## Action items', '', '| Task | Owner | Due |', '| --- | --- | --- |'); n.action_items.forEach(a => L.push(`| ${[a.task, a.owner, a.due].map(x => (x || '—').replace(/\|/g, '/')).join(' | ')} |`)); L.push(''); }
  if (n.key_points?.length) L.push('## Key points', '', ...n.key_points.map(x => `- ${x}`), '');
  if (n.open_questions?.length) L.push('## Open questions', '', ...n.open_questions.map(x => `- ${x}`), '');
  if (n.follow_up_email?.body) L.push('## Follow-up email', '', `**Subject:** ${n.follow_up_email.subject}`, '', n.follow_up_email.body, '');
  return L.join('\n');
}

function wordHtml(m) {
  const n = m.minutes || {};
  const rtl = hasArabic(n.overview);
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const L = rtl
    ? { date: 'التاريخ', att: 'الحضور', ov: 'ملخص الاجتماع', dec: 'القرارات', act: 'المهام', task: 'المهمة', owner: 'المسؤول', due: 'الموعد', kp: 'النقاط الرئيسية', oq: 'نقاط مفتوحة', title: 'محضر اجتماع' }
    : { date: 'Date', att: 'Attendees', ov: 'Overview', dec: 'Decisions', act: 'Action items', task: 'Task', owner: 'Owner', due: 'Due', kp: 'Key points', oq: 'Open questions', title: 'Meeting minutes' };
  const list = arr => arr?.length ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;direction:${rtl ? 'rtl' : 'ltr'}}h1{font-size:18pt;color:#3b1fa8}h2{font-size:13pt;color:#3b1fa8;border-bottom:1px solid #ccc;padding-bottom:3pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:5pt;text-align:${rtl ? 'right' : 'left'};vertical-align:top}th{background:#efeaff}</style></head>
<body dir="${rtl ? 'rtl' : 'ltr'}"><p style="color:#666">${L.title}</p><h1>${esc(m.title || n.title)}</h1>
<table><tr><th style="width:25%">${L.date}</th><td>${esc(fmtDate(m.created_at))} – ${esc(fmtHijri(m.created_at))}</td></tr>
<tr><th>${L.att}</th><td>${esc(Object.values(m.speakers || {}).join('، ') || '—')}</td></tr></table>
<h2>${L.ov}</h2><p>${esc(n.overview)}</p>
${n.decisions?.length ? `<h2>${L.dec}</h2>${list(n.decisions)}` : ''}
${n.action_items?.length ? `<h2>${L.act}</h2><table><tr><th>#</th><th>${L.task}</th><th>${L.owner}</th><th>${L.due}</th></tr>${n.action_items.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.task)}</td><td>${esc(a.owner || '—')}</td><td>${esc(a.due || '—')}</td></tr>`).join('')}</table>` : ''}
${n.key_points?.length ? `<h2>${L.kp}</h2>${list(n.key_points)}` : ''}
${n.open_questions?.length ? `<h2>${L.oq}</h2>${list(n.open_questions)}` : ''}
</body></html>`;
}
