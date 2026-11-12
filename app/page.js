import Link from 'next/link';
import Logo from '@/components/Logo';
import Pricing from '@/components/Pricing';
import { IconMic, IconDoc, IconList, IconSearch, IconChat, IconUsers, IconMail, IconGlobe, IconBot } from '@/components/Icons';

const FEATURES = [
  { icon: IconGlobe, title: 'Saudi Arabic and English, together', text: 'Transcribes meetings where people switch between Saudi dialect and English mid-sentence, and keeps technical terms as spoken.' },
  { icon: IconUsers, title: 'Know who said what', text: 'Speaker labels on every line. Rename a speaker once and it updates across the whole meeting.' },
  { icon: IconDoc, title: 'Minutes in one click', text: 'Overview, decisions, key points and open questions, in Arabic or English, whatever language the meeting was in.' },
  { icon: IconList, title: 'Action items with owners', text: 'Every task with who owns it and when it is due. Tick them off as your team delivers.' },
  { icon: IconChat, title: 'Ask Mahdar', text: '“What did the consultant say about the dampers?” Ask anything about a meeting and get the answer from the transcript.' },
  { icon: IconSearch, title: 'Search every meeting', text: 'Find any topic, name or number across all your meetings in seconds.' },
  { icon: IconMail, title: 'Minutes emailed to everyone', text: 'When the meeting ends, the minutes go straight to the participants’ inboxes, in Arabic or English.' },
  { icon: IconMic, title: 'Record, upload or import', text: 'Record in the browser, upload MP3, M4A or video, or import a Teams or Zoom transcript.' },
  { icon: IconBot, title: 'Joins Teams, Zoom and Meet', text: 'Paste the meeting link or schedule it ahead. Mahdar Notetaker joins the call, records it and leaves when it ends.' }
];

const FAQ = [
  ['Does it understand Saudi dialect?', 'Mahdar is built for meetings in the Kingdom, where Saudi Arabic and English mix in the same sentence. Accuracy is best with clear audio; you can correct speaker names and rewrite the minutes at any time.'],
  ['Which files can I upload?', 'MP3, M4A, WAV, OGG, WebM and video files such as MP4 recordings from Zoom or Teams, up to about 1 GB. Long meetings are split and processed automatically.'],
  ['What happens to my recordings?', 'Your audio is used only to create the transcript and is deleted once processing finishes. Transcripts and minutes are private to your account.'],
  ['Do I need to tell people I am recording?', 'Yes. Always tell participants before recording a meeting. This is good practice and required by the Personal Data Protection Law.'],
  ['Can Mahdar join my Teams or Zoom calls?', 'Yes. Paste the meeting link, or schedule the bot ahead of time. “Mahdar Notetaker” joins, announces in the chat that it is recording, and leaves when the meeting ends. If your meeting has a lobby, admit it like any guest.'],
  ['How do I pay?', 'Start with the free trial. To upgrade, contact us and we will set up your plan by bank transfer while online payment is being added.']
];

export default function Home() {
  return (
    <div className="mk">
      <header className="mk-dark">
        <div className="wrap">
          <nav className="mk-nav" aria-label="Main">
            <Logo />
            <div className="links">
              <a href="#features">Features</a>
              <a href="#minutes">Minutes</a>
              <a href="#uses">Use cases</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="right">
              <Link href="/login" className="btn btn-ghost">Log in</Link>
              <Link href="/signup" className="btn btn-primary">Start free</Link>
            </div>
          </nav>

          <section className="hero">
            <div>
              <span className="eyebrow">Built for Saudi teams</span>
              <h1>Your AI note-taker for meetings in <em>Arabic and English</em></h1>
              <p className="ar-line" lang="ar" dir="rtl">محاضر اجتماعاتك جاهزة قبل أن تغادر القاعة</p>
              <p className="lede">Mahdar transcribes, summarizes and organizes every meeting: who said what, what was decided, and who owes what by when.</p>
              <div className="ctas">
                <Link href="/signup" className="btn btn-primary btn-lg">Start your free trial</Link>
                <a href="#features" className="btn btn-lg">See how it works</a>
              </div>
              <div className="proof">
                <span>14-day free trial</span>
                <span>No card needed</span>
                <span>Recordings deleted after processing</span>
              </div>
            </div>

            <div className="mock" role="img" aria-label="Example of Mahdar minutes for a construction coordination meeting">
              <div className="mock-bar"><i /><i /><i /><b>Tower B · Level 7 MEP coordination · 21 min</b></div>
              <div className="mock-body">
                <div className="mock-notes">
                  <div><h4>Overview</h4><p>Ductwork on Level 7 is a week late after a short delivery from Jeddah. Ceiling boards stay on hold until the pressure test passes.</p></div>
                  <div className="kw"><span>Ductwork</span><span>Fire dampers</span><span>RFI</span><span>Schedule</span></div>
                  <div className="mock-ai">
                    <h4>Action items</h4>
                    <div><span className="box" /><span>Resubmit 90-min fire dampers with install details</span><span className="who">Omar · Wed</span></div>
                    <div><span className="box" /><span>Confirm 40 m of 600×400 duct delivery</span><span className="who">Omar · Sun</span></div>
                    <div><span className="box" /><span>Send updated look-ahead schedule</span><span className="who">Faisal · Tomorrow</span></div>
                  </div>
                  <div className="mock-tt">
                    <h4>Talk time</h4>
                    <div><span>Faisal</span><i style={{ width: '82%' }} /><span>41%</span></div>
                    <div><span>Omar</span><i style={{ width: '64%' }} /><span>32%</span></div>
                    <div><span>Sara</span><i style={{ width: '54%' }} /><span>27%</span></div>
                  </div>
                </div>
                <div className="mock-tr">
                  <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: '#6a45f5' }}>Transcript</h4>
                  <div className="t"><div className="n">Eng. Faisal <span>0:04</span></div><p dir="rtl" lang="ar">نبدأ. عندنا موضوعين: تأخير الـ ductwork في الدور السابع، والـ RFI حق الـ fire dampers.</p></div>
                  <div className="t"><div className="n">Omar <span>0:22</span></div><p dir="rtl" lang="ar">الشحنة من جدة وصلت ناقصة، ناقصنا حوالي ٤٠ متر.</p></div>
                  <div className="t"><div className="n">Sara <span>0:51</span></div><p>We cannot approve ceiling boards before the duct pressure test is done.</p></div>
                  <div className="t"><div className="n">Omar <span>2:22</span></div><p dir="rtl" lang="ar">إن شاء الله، أرسله الأربعاء.</p></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </header>

      <div className="strip">
        <span><b>Saudi dialect</b> + English in one meeting</span>
        <span><b>Up to 8</b> speakers identified</span>
        <span><b>Minutes</b> in Arabic or English</span>
        <span><b>Meetings up to 2+ hours</b></span>
      </div>

      <section className="mk-section" id="features">
        <div className="wrap">
          <div className="mk-head center">
            <span className="kicker">Features</span>
            <h2>Everything after the meeting, done for you</h2>
            <p>Stop typing notes. Focus on the conversation and let Mahdar produce the record.</p>
          </div>
          <div className="features">
            {FEATURES.map(f => (
              <div className="feature" key={f.title}>
                <span className="ic"><f.icon /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                {f.soon && <span className="chip warn soon">Coming soon</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section alt">
        <div className="wrap">
          <div className="mk-head center">
            <span className="kicker">How it works</span>
            <h2>From recording to minutes in minutes</h2>
          </div>
          <div className="steps">
            <div className="step"><h3>Mahdar joins the meeting</h3><p>Send the Mahdar bot to your Teams, Zoom or Meet call, record in the browser, or upload a recording.</p></div>
            <div className="step"><h3>Mahdar listens</h3><p>Speech becomes a transcript with speaker names and timestamps, in the language people actually spoke.</p></div>
            <div className="step"><h3>Everyone gets the minutes</h3><p>Summary, decisions and action items are emailed to the participants. Export to Word or ask questions any time.</p></div>
          </div>
        </div>
      </section>

      <section className="mk-section" id="minutes">
        <div className="wrap split">
          <div>
            <div className="mk-head" style={{ marginBottom: 0 }}>
              <span className="kicker">Formal minutes</span>
              <h2>A proper محضر اجتماع, not just a summary</h2>
              <p>Saudi companies and government clients expect formal minutes. Mahdar writes them in a clean business register, ready to sign and file.</p>
            </div>
            <ul className="checks">
              <li><div><b>Arabic or English output</b><span>Choose the language of the minutes, whatever language the meeting was in.</span></div></li>
              <li><div><b>Export to Word</b><span>Download the minutes as a Word document with attendees, decisions and actions.</span></div></li>
              <li><div><b>Nothing invented</b><span>Names, quantities, prices and dates are kept exactly as said. Missing owners stay blank.</span></div></li>
            </ul>
          </div>
          <div className="minutes-doc" dir="rtl" lang="ar">
            <h3>محضر اجتماع تنسيق الأعمال الكهروميكانيكية – البرج B</h3>
            <div className="row"><b>التاريخ</b><span>الأحد ٩ نوفمبر ٢٠٢٦</span></div>
            <div className="row"><b>الحضور</b><span>م. فيصل (مدير المشروع)، سارة (الاستشاري)، عمر (مقاول الميكانيكا)</span></div>
            <div className="row"><b>القرارات</b><span>اعتماد مخمدات حريق بتصنيف ٩٠ دقيقة وفق متطلبات الدفاع المدني ورفض الموديل المقدم.</span></div>
            <div className="row"><b>المهام</b><span>تقديم اعتماد جديد للمخمدات مع تفاصيل التركيب – عمر – الأربعاء</span></div>
            <div className="row" style={{ borderBottom: 'none' }}><b>الاجتماع القادم</b><span>نفس الموعد الأسبوع القادم</span></div>
          </div>
        </div>
      </section>

      <section className="mk-section alt" id="uses">
        <div className="wrap">
          <div className="mk-head center">
            <span className="kicker">Use cases</span>
            <h2>Made for how business runs in the Kingdom</h2>
          </div>
          <div className="uses">
            <div className="use"><h3>Construction and projects</h3><p>Site and coordination meetings with consultants and subcontractors, with every commitment on record.</p></div>
            <div className="use"><h3>Sales and business development</h3><p>Client calls summarized with next steps and a follow-up email ready to send.</p></div>
            <div className="use"><h3>Management and boards</h3><p>Formal minutes for internal and board meetings, in Arabic, without a secretary.</p></div>
            <div className="use"><h3>Government suppliers</h3><p>Clear records of meetings with government and semi-government clients.</p></div>
          </div>
        </div>
      </section>

      <section className="mk-section" id="pricing">
        <div className="wrap">
          <div className="mk-head center">
            <span className="kicker">Pricing</span>
            <h2>Simple plans in Saudi riyals</h2>
            <p>Priced by meeting hours, not by seat. Start free; no card needed.</p>
          </div>
          <Pricing />
        </div>
      </section>

      <section className="mk-section alt" id="faq">
        <div className="wrap">
          <div className="mk-head center"><span className="kicker">FAQ</span><h2>Questions</h2></div>
          <div className="faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="wrap">
          <div className="cta-band mk-dark">
            <h2>Your next meeting deserves minutes</h2>
            <p>Try Mahdar free for 14 days on your own meetings.</p>
            <Link href="/signup" className="btn btn-primary btn-lg">Start free</Link>
          </div>
        </div>
      </section>

      <div className="wrap">
        <footer className="footer">
          <Logo />
          <span className="sp" />
          <a href="#pricing">Pricing</a>
          <Link href="/login">Log in</Link>
          <span>© 2026 Mahdar</span>
        </footer>
      </div>
    </div>
  );
}
