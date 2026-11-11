import Link from 'next/link';
import Logo from '@/components/Logo';
import Pricing from '@/components/Pricing';

export const metadata = { title: 'Pricing | Mahdar' };

export default function PricingPage() {
  return (
    <div className="mk">
      <div className="wrap">
        <nav className="mk-nav" style={{ color: 'var(--fg)' }}>
          <Logo />
          <div className="right">
            <Link href="/login" className="btn btn-ghost" style={{ color: 'var(--muted)' }}>Log in</Link>
            <Link href="/signup" className="btn btn-primary">Start free</Link>
          </div>
        </nav>
        <section className="mk-section" style={{ paddingTop: 40 }}>
          <div className="mk-head center">
            <span className="kicker">Pricing</span>
            <h2>Simple plans in Saudi riyals</h2>
            <p>Priced by meeting hours, not by seat. Start free; no card needed. To upgrade, contact us after your trial.</p>
          </div>
          <Pricing />
        </section>
      </div>
    </div>
  );
}
