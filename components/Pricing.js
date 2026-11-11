import Link from 'next/link';
import { PLANS } from '@/lib/config';

export default function Pricing() {
  return (
    <div className="pricing">
      {PLANS.map(p => (
        <div key={p.id} className={'plan' + (p.featured ? ' featured' : '')}>
          {p.featured && <span className="chip violet badge">Most popular</span>}
          <h3>{p.name}</h3>
          <div className="price">
            {p.price ? <>SAR {p.price} <small>/ month</small></> : <>Free <small>for {p.period}</small></>}
          </div>
          <p className="muted">{p.blurb}</p>
          <ul>
            <li>{p.hours} meeting hours{p.price ? ' / month' : ''}</li>
            <li>{p.users}</li>
            <li>Arabic and English minutes</li>
            <li>Speaker-labelled transcripts</li>
            <li>Ask Mahdar about any meeting</li>
            {p.id === 'team' && <li>Shared team workspace (coming soon)</li>}
          </ul>
          <Link href="/signup" className={'btn ' + (p.featured ? 'btn-primary' : '')}>{p.cta}</Link>
        </div>
      ))}
    </div>
  );
}
