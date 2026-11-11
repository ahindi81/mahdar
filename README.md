# Mahdar (محضر)

AI meeting notes for Saudi teams: record or upload a meeting, get a speaker-labelled transcript, minutes (overview, decisions, action items, follow-up email) in Arabic or English, and ask questions about it.

- Next.js 14 (App Router) on Render
- Supabase: auth + `meetings` table with row-level security
- Google Gemini: `gemini-3.5-transcribe` for speech-to-text with speaker labels, a Gemini Flash model for minutes and Q&A
- ffmpeg (via `ffmpeg-static`) converts any audio/video to mono Opus and splits it into 25-minute parts

## Environment
See `.env.example`. `GEMINI_API_KEY` is required on the server.

## Run locally
```
npm install
GEMINI_API_KEY=... npm run dev
```
