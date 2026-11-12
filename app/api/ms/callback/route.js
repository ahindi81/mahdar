import { APP_URL } from '@/lib/email';
import { verifyState, exchangeCode, getMe, saveConnection } from '@/lib/microsoft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const back = (params) => Response.redirect(`${APP_URL}/app/settings?${new URLSearchParams(params)}`, 302);

// Microsoft redirects here after the user signs in and approves sending mail.
export async function GET(req) {
  const u = new URL(req.url);
  const err = u.searchParams.get('error');
  if (err) {
    const d = u.searchParams.get('error_description') || err;
    const needsAdmin = /AADSTS65001|AADSTS90094|admin/i.test(d);
    return back({ ms: 'error', msg: needsAdmin ? 'Your company requires an IT admin to approve Mahdar before you can connect. Ask your Microsoft 365 admin to approve it.' : (err === 'access_denied' ? 'Connection cancelled.' : d.split('\r\n')[0].slice(0, 200)) });
  }
  const userId = verifyState(u.searchParams.get('state'));
  if (!userId) return back({ ms: 'error', msg: 'The sign-in link expired. Please try again.' });
  try {
    const tokens = await exchangeCode(u.searchParams.get('code'));
    if (!tokens.refresh_token) throw new Error('Microsoft did not allow offline access.');
    const me = await getMe(tokens.access_token);
    await saveConnection(userId, tokens, me);
    return back({ ms: 'connected' });
  } catch (e) {
    console.error('[ms callback]', e.message);
    return back({ ms: 'error', msg: e.message.slice(0, 200) });
  }
}
