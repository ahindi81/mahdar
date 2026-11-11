// Shared by browser and server: formatting, transcript parsing and minutes helpers.

export function fmtClock(sec) {
  if (sec == null || Number.isNaN(+sec)) return '';
  sec = Math.max(0, Math.round(+sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
export function fmtDuration(sec) {
  if (!sec) return '';
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
export const hasArabic = s => /[؀-ۿ]/.test(s || '');

export function speakerName(meeting, spk) {
  return (meeting.speakers && meeting.speakers[spk]) || spk || '';
}

export function speakersFromTurns(turns) {
  const map = {};
  let n = 0;
  for (const t of turns) {
    if (!t.spk || t.spk in map) continue;
    n++;
    const part = t.spk.match(/^p(\d+)_/);
    map[t.spk] = /^(p\d+_)?spk_\d+$/i.test(t.spk)
      ? `Speaker ${t.spk.match(/spk_(\d+)/i)[1]}${part ? ` (part ${part[1]})` : ''}`
      : t.spk;
  }
  return map;
}

export function transcriptText(meeting, maxChars = 120000) {
  let s = (meeting.transcript || [])
    .map(t => (t.t != null ? `[${fmtClock(t.t)}] ` : '') + (t.spk ? speakerName(meeting, t.spk) + ': ' : '') + t.text)
    .join('\n');
  if (s.length > maxChars) s = s.slice(0, maxChars) + '\n[transcript cut for length]';
  return s;
}

// Talk time per speaker, measured as share of words spoken.
export function talkTime(meeting) {
  const counts = {};
  let total = 0;
  for (const t of meeting.transcript || []) {
    if (!t.spk) continue;
    const n = (t.text || '').split(/\s+/).filter(Boolean).length;
    counts[t.spk] = (counts[t.spk] || 0) + n;
    total += n;
  }
  return Object.entries(counts)
    .map(([spk, n]) => ({ spk, name: speakerName(meeting, spk), share: total ? n / total : 0 }))
    .sort((a, b) => b.share - a.share);
}

// Teams / Zoom .vtt, .srt, or plain "Name: text" lines.
export function parseTranscriptText(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  const turns = [];
  const tsRe = /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*/;
  if (/^WEBVTT/.test(text) || /-->/.test(text)) {
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split('\n').filter(l => l.trim() && !/^WEBVTT/.test(l) && !/^NOTE/.test(l) && !/^\d+$/.test(l.trim()));
      const tl = lines.find(l => tsRe.test(l));
      if (!tl) continue;
      const m = tl.match(/^((\d{1,2}):)?(\d{1,2}):(\d{2})[.,]/);
      const t = m ? (+(m[2] || 0)) * 3600 + +m[3] * 60 + +m[4] : null;
      let body = lines.filter(l => l !== tl).join(' ');
      let spk = '';
      const v = body.match(/<v\s+([^>]+)>/);
      if (v) spk = v[1].trim();
      body = body.replace(/<[^>]+>/g, '').trim();
      const sp = !spk && body.match(/^([^:]{2,40}):\s+(.*)$/);
      if (sp) { spk = sp[1].trim(); body = sp[2]; }
      if (!body) continue;
      const last = turns[turns.length - 1];
      if (last && spk && last.spk === spk) last.text += ' ' + body;
      else turns.push({ spk, t, text: body });
    }
  } else {
    for (const line of text.split(/\n+/)) {
      const l = line.trim();
      if (!l) continue;
      const m = l.match(/^(?:\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*)?(?:([^:\[\]]{2,40}):\s+)?(.*)$/);
      let t = null;
      if (m && m[1]) { const p = m[1].split(':').map(Number); t = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
      turns.push({ spk: ((m && m[2]) || '').trim(), t, text: ((m && m[3]) || l).trim() });
    }
  }
  return turns;
}

export function outLangInstruction(outLang) {
  if (outLang === 'ar') return 'Arabic (Modern Standard Arabic, the formal business register used for Saudi meeting minutes)';
  if (outLang === 'en') return 'English';
  return 'the main language of the meeting (Arabic if most of the speech is Arabic, otherwise English)';
}

export function minutesPrompt(meeting) {
  return [
    'You write formal meeting minutes (محضر اجتماع) for companies in Saudi Arabia. Meetings often mix Saudi Arabic dialect with English technical terms.',
    `Write the minutes in ${outLangInstruction(meeting.out_lang)}. Keep names, company and project names, numbers, sizes, money and dates exactly as said. Never invent anything that is not in the transcript. If an owner or due date was not stated, use an empty string.`,
    'Reply with ONLY one JSON object of this shape:',
    '{"title": string (short meeting title), "overview": string (3-5 sentences), "keywords": string[] (up to 6 topics), "key_points": string[], "decisions": string[], "action_items": [{"task": string, "owner": string, "due": string}], "open_questions": string[], "follow_up_email": {"subject": string, "body": string}}',
    `Meeting title given by the user: ${meeting.title || '(none)'}`,
    'Transcript:\n' + transcriptText(meeting)
  ].join('\n\n');
}

export function normalizeMinutes(j, fallbackTitle) {
  const arr = x => (Array.isArray(x) ? x.map(v => String(v)).filter(Boolean) : []);
  return {
    title: String(j?.title || fallbackTitle || 'Meeting'),
    overview: String(j?.overview || j?.summary || ''),
    keywords: arr(j?.keywords).slice(0, 8),
    key_points: arr(j?.key_points),
    decisions: arr(j?.decisions),
    action_items: (Array.isArray(j?.action_items) ? j.action_items : [])
      .map(a => ({ task: String(a?.task || ''), owner: String(a?.owner || ''), due: String(a?.due || ''), done: !!a?.done }))
      .filter(a => a.task),
    open_questions: arr(j?.open_questions),
    follow_up_email: { subject: String(j?.follow_up_email?.subject || ''), body: String(j?.follow_up_email?.body || '') }
  };
}

export function searchText(meeting) {
  const m = meeting.minutes || {};
  return [meeting.title, m.title, m.overview, ...(m.keywords || []), ...(m.decisions || []), ...(m.action_items || []).map(a => a.task),
    ...Object.values(meeting.speakers || {}), ...(meeting.transcript || []).map(t => t.text)]
    .filter(Boolean).join(' \n').slice(0, 200000);
}
