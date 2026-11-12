import crypto from 'node:crypto';
import { APP_URL } from './email';
import { adminConnGet, adminConnSave } from './admin';

// Microsoft 365 / Outlook: lets each host send the minutes from their own mailbox (Microsoft Graph, delegated Mail.Send).
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'offline_access openid profile email User.Read Mail.Send';
export const REDIRECT_URI = `${APP_URL}/api/ms/callback`;

export const msConfigured = () => !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MAIL_TOKEN_KEY);

const keyBytes = () => crypto.createHash('sha256').update(String(process.env.MAIL_TOKEN_KEY || '')).digest();
const b64u = buf => Buffer.from(buf).toString('base64url');

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [b64u(iv), b64u(c.getAuthTag()), b64u(enc)].join('.');
}
export function decrypt(s) {
  const [iv, tag, enc] = String(s).split('.').map(x => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// Signed, short-lived "state" so the sign-in callback knows which Mahdar user started it.
export function signState(userId) {
  const body = b64u(JSON.stringify({ u: userId, exp: Date.now() + 15 * 60 * 1000, n: crypto.randomBytes(8).toString('hex') }));
  const sig = b64u(crypto.createHmac('sha256', keyBytes()).update(body).digest());
  return `${body}.${sig}`;
}
export function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = b64u(crypto.createHmac('sha256', keyBytes()).update(body).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p.u : null;
  } catch { return null; }
}

export function authorizeUrl(userId, loginHint) {
  const q = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES,
    state: signState(userId),
    prompt: 'select_account'
  });
  if (loginHint) q.set('login_hint', loginHint);
  return `${AUTH}/authorize?${q}`;
}

async function tokenRequest(params) {
  const r = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, scope: SCOPES, redirect_uri: REDIRECT_URI, ...params })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error_description?.split('\r\n')[0] || j.error || `Microsoft sign-in failed (${r.status})`);
    e.code = j.error;
    throw e;
  }
  return j;
}
export const exchangeCode = code => tokenRequest({ grant_type: 'authorization_code', code });

export async function getMe(accessToken) {
  const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Could not read your Microsoft profile (${r.status}).`);
  const j = await r.json();
  return { email: (j.mail || j.userPrincipalName || '').toLowerCase(), name: j.displayName || '' };
}

export async function saveConnection(userId, tokens, me) {
  await adminConnSave(userId, { provider: 'microsoft', email: me.email, name: me.name, token_enc: encrypt(JSON.stringify({ refresh_token: tokens.refresh_token })) });
}

// Sends from the host's own mailbox. Returns false when the host has not connected Outlook.
export async function sendFromHostMailbox(userId, { to, subject, html }) {
  if (!msConfigured()) return false;
  const conn = await adminConnGet(userId);
  if (!conn || conn.provider !== 'microsoft') return false;
  let refresh;
  try { refresh = JSON.parse(decrypt(conn.token_enc)).refresh_token; } catch { throw new Error('Your Outlook connection needs to be renewed. Reconnect it in Settings.'); }
  let tokens;
  try { tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh }); }
  catch (e) { throw new Error(`Outlook sign-in expired or was revoked. Reconnect Outlook in Settings. (${e.message})`); }
  if (tokens.refresh_token && tokens.refresh_token !== refresh) {
    await adminConnSave(userId, { provider: 'microsoft', email: conn.email, name: conn.name, token_enc: encrypt(JSON.stringify({ refresh_token: tokens.refresh_token })) }).catch(() => {});
  }
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: to.map(address => ({ emailAddress: { address } })) },
      saveToSentItems: true
    })
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`Outlook could not send the email: ${j?.error?.message || r.status}`);
  }
  return conn.email;
}
