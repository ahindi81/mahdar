'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from './Logo';
import { supabase } from '@/lib/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config';

export default function AuthForm({ mode }) {
  const router = useRouter();
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => { if (data.session) router.replace('/app'); });
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    const sb = supabase();
    try {
      if (isSignup) {
        if (password.length < 8) throw new Error('Use a password of at least 8 characters.');
        let r = null, j = {};
        try {
          r = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ email, password, name })
          });
          j = await r.json().catch(() => ({}));
        } catch { r = null; }
        if (!r || r.status >= 500) {
          // Sign-up service unreachable: fall back to the standard flow (may send a confirmation email).
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: window.location.origin + '/app' } });
          if (error) throw error;
          if (!data.session) { setInfo('Check your email to confirm your account, then log in.'); setBusy(false); return; }
          router.replace('/app'); return;
        }
        if (!r.ok) throw new Error(j.error || 'Sign-up failed.');
      }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Wrong email or password.' : /confirm/i.test(error.message) ? 'Please confirm your email first; check your inbox.' : error.message);
      router.replace('/app');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <main className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <Logo />
          <div style={{ display: 'grid', gap: 6 }}>
            <h1>{isSignup ? 'Start your free trial' : 'Welcome back'}</h1>
            <p className="muted">{isSignup ? '14 days free. No card needed.' : 'Log in to your meetings.'}</p>
          </div>
          {isSignup && (
            <div className="field"><label htmlFor="name">Full name</label>
              <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></div>
          )}
          <div className="field"><label htmlFor="email">Work email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></div>
          <div className="field"><label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={isSignup ? 8 : undefined} required />
            {isSignup && <span className="hint">At least 8 characters.</span>}</div>
          {error && <div className="notice bad" role="alert">{error}</div>}
          {info && <div className="notice good" role="status">{info}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy} type="submit">
            {busy && <span className="spinner" />}{isSignup ? 'Create account' : 'Log in'}
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>
            {isSignup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New to Mahdar? <Link href="/signup">Start free</Link></>}
          </p>
        </form>
      </main>
      <aside className="auth-side mk-dark">
        <span className="eyebrow">Meeting minutes, done</span>
        <blockquote>“Minutes in Saudi Arabic and English, with every decision and action item, ready before you leave the room.”</blockquote>
        <p lang="ar" dir="rtl" style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#cfc6ff' }}>محاضر اجتماعاتك جاهزة قبل أن تغادر القاعة</p>
      </aside>
    </div>
  );
}
