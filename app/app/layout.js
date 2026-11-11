'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { IconHome, IconPlus, IconTag } from '@/components/Icons';
import { supabase } from '@/lib/client';
import { TRIAL_MINUTES } from '@/lib/config';
import { AppCtx } from '@/components/AppContext';

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [usedMin, setUsedMin] = useState(0);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
      else { setSession(data.session); setReady(true); }
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace('/login'); else setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const refreshUsage = useCallback(async () => {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const { data } = await supabase().from('meetings').select('duration_sec').gte('created_at', since.toISOString());
    setUsedMin(Math.round((data || []).reduce((s, m) => s + (+m.duration_sec || 0), 0) / 60));
  }, []);
  useEffect(() => { if (ready) refreshUsage(); }, [ready, refreshUsage]);

  if (!ready) return <div className="state-box" style={{ minHeight: '100vh', alignContent: 'center' }}><span className="spinner" /></div>;

  const user = session.user;
  const name = user.user_metadata?.name || user.email;
  const trialDaysLeft = Math.max(0, 14 - Math.floor((Date.now() - new Date(user.created_at).getTime()) / 864e5));
  const nav = [
    { href: '/app', label: 'Meetings', icon: IconHome, on: pathname === '/app' || pathname.startsWith('/app/m/') },
    { href: '/app/new', label: 'New meeting', icon: IconPlus, on: pathname === '/app/new' },
    { href: '/pricing', label: 'Plans', icon: IconTag, on: false }
  ];

  return (
    <AppCtx.Provider value={{ session, user, refreshUsage, usedMin }}>
      <div className="shell">
        <aside className="side">
          <Logo href="/app" />
          {nav.map(n => (
            <Link key={n.href} href={n.href} className={'nav-a' + (n.on ? ' on' : '')} aria-current={n.on ? 'page' : undefined}>
              <n.icon width={18} height={18} /><span>{n.label}</span>
            </Link>
          ))}
          <div className="sp" />
          <div className="usage">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>Free trial</b><span className="muted">{trialDaysLeft} days left</span></div>
            <div className="meter"><i style={{ width: Math.min(100, (usedMin / TRIAL_MINUTES) * 100) + '%' }} /></div>
            <span className="muted mono">{usedMin} of {TRIAL_MINUTES} min this month</span>
          </div>
          <div className="who">
            <span className="avatar">{(name || '?').trim().charAt(0).toUpperCase()}</span>
            <span className="em" title={user.email}>{name}</span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => supabase().auth.signOut()}>Log out</button>
          </div>
        </aside>
        <main className="page">{children}</main>
      </div>
    </AppCtx.Provider>
  );
}
