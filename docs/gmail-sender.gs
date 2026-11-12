// Mahdar email sender. Paste this into a new project at script.google.com, then Deploy > New deployment > Web app.
// Execute as: Me. Who has access: Anyone. Copy the Web app URL into Mahdar's GMAIL_SCRIPT_URL.
const SECRET = 'PASTE_THE_SECRET_HERE';

function doPost(e) {
  const out = obj => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: 'Wrong secret' });
    const to = (d.to || []).filter(String).slice(0, 50);
    if (!to.length) return out({ ok: false, error: 'No recipients' });
    if (MailApp.getRemainingDailyQuota() < to.length) return out({ ok: false, error: 'Daily Gmail sending limit reached' });
    const msg = { to: to.join(','), subject: String(d.subject || 'Meeting minutes'), htmlBody: String(d.html || ''), body: String(d.text || ''), name: String(d.name || 'Mahdar') };
    if (d.replyTo) msg.replyTo = String(d.replyTo);
    MailApp.sendEmail(msg);
    return out({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

// Run once from the editor (select "authorize" and click Run) to grant Gmail permission.
function authorize() {
  Logger.log('Emails left today: ' + MailApp.getRemainingDailyQuota());
}
