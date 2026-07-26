# CallFlow Phase 2 — Cloud Dialer Setup

This package adds a Twilio-based WebRTC browser softphone and the CallFlow database/API foundation for outbound calls, inbound calls, live call monitoring, ring groups, queues, recordings, secure playback/download, transcription, summaries, sentiment, action items and keywords.

## 1. Install packages

```powershell
npm install
```

The project now requires:

- `twilio`
- `@twilio/voice-sdk`

## 2. Run the Supabase migration

Open the Supabase SQL Editor and run:

```text
supabase/migrations/20260724_phase2_cloud_dialer.sql
```

The migration is additive and includes tenant-aware RLS policies.

## 3. Add environment variables

Copy the Phase 2 entries from `.env.example` into `.env.local` and enter real credentials.

Never expose `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or `OPENAI_API_KEY` in browser code or GitHub.

## 4. Configure Twilio

Create a Twilio API Key and a TwiML App. Set the TwiML App Voice URL to:

```text
https://YOUR-DOMAIN/api/telephony/voice/outbound
```

Set your Twilio phone number's incoming Voice webhook to:

```text
https://YOUR-DOMAIN/api/telephony/voice/inbound
```

Use HTTP POST for both.

For local webhook testing, expose localhost with the Twilio CLI or another HTTPS tunnel and set `NEXT_PUBLIC_SITE_URL` to that public HTTPS URL.

## 5. Register the Twilio number in CallFlow

After the migration, insert the purchased Twilio number into `public.phone_numbers`. Associate it with either a `ring_group_id` or a `queue_id`. Add agents to `ring_group_members` or `queue_members` using their Supabase Auth user IDs.

## 6. AI transcription and analysis

Add `OPENAI_API_KEY` to enable:

- `/api/telephony/ai/transcribe`
- `/api/telephony/ai/process`

Transcription must run before AI analysis. The recording page includes both actions.

## 7. Validation commands

```powershell
npx tsc --noEmit
npm run lint
npm run build
npm run dev
```

## Operational notes

- Browser microphone permission and HTTPS are required outside localhost.
- Twilio calling, phone numbers, recording, and transcription incur provider usage charges.
- The default Hold button performs a local softphone hold by muting the browser leg. Network-level music-on-hold and warm transfer should use Twilio Conference mode in a later operational enhancement.
- Cold transfer is implemented through Twilio call redirection.
- Inbound ring groups can ring up to ten Twilio Client identities in one `<Dial>` operation.
