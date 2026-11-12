import { hasArabic, fmtDuration } from './meeting';

export const APP_URL = process.env.APP_URL || 'https://mahdar.onrender.com';
export const emailConfigured = () => !!(process.env.GMAIL_SCRIPT_URL || process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);

export function cleanRecipients(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : String(list || '').split(/[\s,;]+/)) {
    const e = String(raw || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !out.includes(e)) out.push(e);
  }
  return out.slice(0, 50);
}

// Sends through an HTTP email API (Render's free plan blocks SMTP ports).
export async function sendMail({ to, subject, html, text, replyTo }) {
  const fromEmail = process.env.EMAIL_FROM;
  const fromName = process.env.EMAIL_FROM_NAME || 'Mahdar';
  if (process.env.GMAIL_SCRIPT_URL) {
    // Free option: a Google Apps Script web app that sends through the owner's Gmail.
    const r = await fetch(process.env.GMAIL_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: process.env.GMAIL_SCRIPT_SECRET || '', to, subject, html, text, name: fromName, replyTo: replyTo || '' }),
      redirect: 'follow'
    });
    const body = await r.text();
    let j = null;
    try { j = JSON.parse(body); } catch {}
    if (!r.ok || !j?.ok) throw new Error(`Gmail sending failed: ${j?.error || body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || r.status}`);
    return;
  }
  if (!fromEmail) throw new Error('Email is not configured yet (EMAIL_FROM is missing on the server).');
  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: to.map(email => ({ email })),
        subject, htmlContent: html, textContent: text,
        ...(replyTo ? { replyTo: { email: replyTo } } : {})
      })
    });
    if (!r.ok) throw new Error(`Email service error: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) })
    });
    if (!r.ok) throw new Error(`Email service error: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  throw new Error('Email is not configured yet (no BREVO_API_KEY or RESEND_API_KEY on the server).');
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function minutesEmail(meeting, senderName) {
  const n = meeting.minutes || {};
  const ar = hasArabic(n.overview);
  const L = ar
    ? { mins: 'محضر الاجتماع', date: 'التاريخ', dur: 'المدة', att: 'المشاركون', ov: 'الملخص', dec: 'القرارات', act: 'المهام', owner: 'المسؤول', due: 'الموعد', kp: 'النقاط الرئيسية', oq: 'نقاط مفتوحة', by: 'أُعدّ بواسطة Mahdar', sent: 'أرسله' }
    : { mins: 'Meeting minutes', date: 'Date', dur: 'Duration', att: 'Participants', ov: 'Summary', dec: 'Decisions', act: 'Action items', owner: 'Owner', due: 'Due', kp: 'Key points', oq: 'Open questions', by: 'Prepared by Mahdar', sent: 'Sent by' };
  const dir = ar ? 'rtl' : 'ltr', align = ar ? 'right' : 'left';
  const title = meeting.title || n.title || L.mins;
  const date = new Intl.DateTimeFormat(ar ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(new Date(meeting.created_at));
  const people = Object.values(meeting.speakers || {}).filter(p => !/^Speaker \d/.test(p));
  const h2 = t => `<h2 style="font-size:15px;color:#4b2fd0;margin:24px 0 8px;font-family:Arial,sans-serif">${t}</h2>`;
  const list = arr => `<ul style="margin:0;padding-${ar ? 'right' : 'left'}:20px">${arr.map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join('')}</ul>`;

  const html = `<!doctype html><html dir="${dir}"><body style="margin:0;background:#f4f3fa;padding:24px 12px;font-family:Arial,'Segoe UI',sans-serif;color:#16132b">
<div dir="${dir}" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;text-align:${align};line-height:1.6;font-size:14px">
<div style="font-size:12px;color:#6a45f5;font-weight:bold;letter-spacing:1px">${L.mins.toUpperCase()}</div>
<h1 style="font-size:22px;margin:6px 0 14px">${esc(title)}</h1>
<table role="presentation" style="font-size:13px;color:#555;border-collapse:collapse">
<tr><td style="padding:2px 0;padding-${ar ? 'left' : 'right'}:12px"><b>${L.date}</b></td><td>${esc(date)}</td></tr>
${meeting.duration_sec ? `<tr><td style="padding:2px 0;padding-${ar ? 'left' : 'right'}:12px"><b>${L.dur}</b></td><td>${esc(fmtDuration(meeting.duration_sec))}</td></tr>` : ''}
${people.length ? `<tr><td style="padding:2px 0;padding-${ar ? 'left' : 'right'}:12px"><b>${L.att}</b></td><td>${esc(people.join(ar ? '، ' : ', '))}</td></tr>` : ''}
</table>
${h2(L.ov)}<p style="margin:0">${esc(n.overview)}</p>
${n.decisions?.length ? h2(L.dec) + list(n.decisions) : ''}
${n.action_items?.length ? h2(L.act) + `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px">${n.action_items.map(a => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${esc(a.task)}<div style="color:#6a45f5;font-size:12px;margin-top:2px">${a.owner ? `${L.owner}: ${esc(a.owner)}` : ''}${a.owner && a.due ? ' · ' : ''}${a.due ? `${L.due}: ${esc(a.due)}` : ''}</div></td></tr>`).join('')}</table>` : ''}
${n.key_points?.length ? h2(L.kp) + list(n.key_points) : ''}
${n.open_questions?.length ? h2(L.oq) + list(n.open_questions) : ''}
<p style="margin:28px 0 0;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:14px">${L.by}${senderName ? ` · ${L.sent} ${esc(senderName)}` : ''} · <a href="${APP_URL}" style="color:#6a45f5">${APP_URL.replace(/^https?:\/\//, '')}</a></p>
</div></body></html>`;

  const t = [title, date, '', `${L.ov}:`, n.overview || ''];
  if (n.decisions?.length) t.push('', `${L.dec}:`, ...n.decisions.map(x => `- ${x}`));
  if (n.action_items?.length) t.push('', `${L.act}:`, ...n.action_items.map(a => `- ${a.task}${a.owner ? ` (${a.owner})` : ''}${a.due ? ` – ${a.due}` : ''}`));
  if (n.open_questions?.length) t.push('', `${L.oq}:`, ...n.open_questions.map(x => `- ${x}`));
  t.push('', L.by);

  return { subject: `${ar ? 'محضر اجتماع' : 'Minutes'}: ${title}`, html, text: t.join('\n') };
}
