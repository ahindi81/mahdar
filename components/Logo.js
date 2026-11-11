import Link from 'next/link';

export default function Logo({ href = '/' }) {
  return (
    <Link href={href} className="logo" aria-label="Mahdar home">
      <span className="logo-mark" aria-hidden="true">م</span>
      <span>Mahdar</span>
      <span className="logo-ar" lang="ar">محضر</span>
    </Link>
  );
}
