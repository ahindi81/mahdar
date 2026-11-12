'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, fmtDate } from '@/lib/client';
import { fmtDuration } from '@/lib/meeting';
import { IconSearch, IconMic, IconPlus } from '@/components/Icons';

const STATUS = {
  scheduled: ['Bot scheduled', 'violet'],
  joining: ['Bot joining', 'violet'],
  waiting: ['Bot in lobby', 'warn'],
  recording: ['Recording', 'bad'],
  uploading: ['Uploading', 'warn'],
  processing: ['Processing', 'violet'],
  failed: ['Failed', 'bad'],
  ready: null
};

export default function Meetings() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  useEffect(() => {
    let alive = true, timer;
    async function load() {
      let req = supabase().from('meetings')
        .select('id,title,status,stage,created_at,duration_sec,speakers,minutes->overview,minutes->action_items,source')
        .order('created_at', { ascending: false }).limit(200);
      if (query) {
        const safe = query.replace(/[%_,()]/g, ' ');
        req = req.or(`title.ilike.%${safe}%,search_text.ilike.%${safe}%`);
      }
      const { data, error } = await req;
      if (!alive) return;
      if (error) { setError('Could not load your meetings. Refresh the page to try again.'); return; }
      setRows(data || []);
      if ((data || []).some(m => !['ready', 'failed'].includes(m.status))) timer = setTimeout(load, 8000);
    }
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  const stats = useMemo(() => {
    const r = rows || [];
    const mins = Math.round(r.reduce((s, m) => s + (+m.duration_sec || 0), 0) / 60);
    const tasks = r.reduce((s, m) => s + ((m.action_items || []).filter(a => !a.done).length), 0);
    return { count: r.length, mins, tasks };
  }, [rows]);

  return (
    <>
      <div className="page-head">
        <h1>Meetings</h1>
        <Link href="/app/new" className="btn btn-primary"><IconPlus width={18} height={18} />New meeting</Link>
      </div>

      {rows && rows.length > 0 && !query && (
        <div className="stats">
          <div className="card stat"><b className="mono">{stats.count}</b><span>Meetings</span></div>
          <div className="card stat"><b className="mono">{stats.mins}</b><span>Minutes of meetings captured</span></div>
          <div className="card stat"><b className="mono">{stats.tasks}</b><span>Open action items</span></div>
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <IconSearch width={18} height={18} />
          <input type="search" placeholder="Search meetings, people, topics… ابحث في اجتماعاتك" value={q} onChange={e => setQ(e.target.value)} aria-label="Search meetings" dir="auto" />
        </label>
      </div>

      {error && <div className="notice bad" style={{ marginTop: 16 }}>{error}</div>}

      <div className="card mrows">
        {rows === null && <div className="state-box"><span className="spinner" /></div>}
        {rows && rows.length === 0 && (query
          ? <div className="empty"><h2>No meetings match “{query}”</h2><p>Try a different word, a person’s name or a project.</p></div>
          : <div className="empty">
              <span className="logo-mark" style={{ width: 48, height: 48, fontSize: 22 }}>م</span>
              <h2>Record your first meeting</h2>
              <p>Record in the browser, upload a recording, or paste a Teams or Zoom transcript. Mahdar writes the minutes.</p>
              <Link href="/app/new" className="btn btn-primary"><IconMic width={18} height={18} />Start a meeting</Link>
            </div>)}
        {rows && rows.map(m => {
          const st = STATUS[m.status];
          const d = new Date(m.created_at);
          const open = (m.action_items || []).filter(a => !a.done).length;
          const spk = Object.keys(m.speakers || {}).length;
          return (
            <Link key={m.id} href={`/app/m/${m.id}`} className="mrow">
              <div className="date"><b className="mono">{d.getDate()}</b><span>{fmtDate(m.created_at, { month: 'short' })}</span></div>
              <div style={{ minWidth: 0 }}>
                <div className="t" dir="auto">{m.title || 'Untitled meeting'}</div>
                <div className="s">
                  {m.duration_sec ? <span className="mono">{fmtDuration(m.duration_sec)}</span> : null}
                  {spk ? <span>{spk} speakers</span> : null}
                  {open ? <span>{open} open action items</span> : null}
                  {m.status === 'processing' && m.stage ? <span>{m.stage}…</span> : null}
                  {m.overview && m.status === 'ready' ? <span className="snip" dir="auto">{m.overview}</span> : null}
                </div>
              </div>
              <div>{st && <span className={'chip ' + st[1]}>{m.status === 'processing' && <span className="spinner" style={{ width: 10, height: 10 }} />}{st[0]}</span>}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
