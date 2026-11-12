'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { api, fmtDate, toast } from '@/lib/client';
import { IconOutlook } from '@/components/Icons';
import { useApp } from '@/components/AppContext';

export default function SettingsPage() {
  return <Suspense fallback={<div className="state-box"><span className="spinner" /></div>}><Settings /></Suspense>;
}

function Settings() {
  const { user } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() { try { setSt(await api('/api/ms/status')); } catch (e) { setMsg({ kind: 'bad', text: e.message }); } }
  useEffect(() => {
    load();
    const ms = params.get('ms');
    if (ms === 'connected') setMsg({ kind: 'good', text: 'Outlook connected. Minutes will now be sent from your mailbox.' });
    if (ms === 'error') setMsg({ kind: 'bad', text: params.get('msg') || 'Could not connect Outlook.' });
    if (ms) router.replace('/app/settings');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setBusy(true); setMsg(null);
    try { const { url } = await api('/api/ms/connect'); window.location.href = url; }
    catch (e) { setMsg({ kind: 'bad', text: e.message }); setBusy(false); }
  }
  async function disconnect() {
    if (!window.confirm('Disconnect Outlook? Minutes will no longer be sent from your mailbox.')) return;
    setBusy(true);
    try { await api('/api/ms/disconnect'); toast('Outlook disconnected'); await load(); } catch (e) { setMsg({ kind: 'bad', text: e.message }); }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 760, display: 'grid', gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0 }}><h1>Settings</h1></div>
      {msg && <div className={'notice ' + msg.kind} role="status">{msg.text}</div>}

      <section className="card" style={{ padding: 22, display: 'grid', gap: 14 }}>
        <div className="toolbar" style={{ alignItems: 'flex-start' }}>
          <IconOutlook width={34} height={34} />
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 4 }}>
            <h2 style={{ fontSize: 18 }}>Send minutes from your work email</h2>
            <p className="muted">Connect your Microsoft 365 / Outlook account. Mahdar then sends the minutes from your own mailbox, so participants see them come from you, and a copy is kept in your Sent Items.</p>
          </div>
        </div>
        {st === null ? <span className="spinner" />
          : st.connected ? (
            <div className="toolbar" style={{ background: 'var(--good-soft)', borderRadius: 10, padding: '12px 14px' }}>
              <span className="chip good">Connected</span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}><b>{st.email}</b>{st.since ? <span className="muted"> · since {fmtDate(st.since)}</span> : null}</span>
              <button className="btn btn-sm" type="button" disabled={busy} onClick={disconnect}>Disconnect</button>
            </div>
          ) : !st.configured ? (
            <div className="notice warn">Outlook connection is not set up on the server yet.</div>
          ) : (
            <div className="toolbar">
              <button className="btn btn-primary" type="button" disabled={busy} onClick={connect}>{busy && <span className="spinner" />}<IconOutlook width={18} height={18} />Connect Outlook</button>
              <span className="hint">You’ll sign in with Microsoft and allow Mahdar to send email as you. Mahdar can’t read your inbox.</span>
            </div>
          )}
        <p className="hint">If your company restricts apps, Microsoft will ask for an IT admin to approve Mahdar first.</p>
      </section>

      <section className="card" style={{ padding: 22, display: 'grid', gap: 6 }}>
        <h2 style={{ fontSize: 18 }}>Account</h2>
        <p className="muted">{user?.user_metadata?.name ? `${user.user_metadata.name} · ` : ''}{user?.email}</p>
      </section>
    </div>
  );
}
