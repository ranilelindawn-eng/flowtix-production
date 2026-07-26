# CallFlow Phase 6 — AI Setup

## Added
- AI call summaries and follow-ups
- Email generation
- Task suggestions
- Coaching
- Objection detection with suggested responses
- Call scoring (0–100)
- Sentiment and sentiment score
- Action items and keywords
- Next-best action
- Organization-scoped storage and RLS

## Install
1. Merge this folder into the existing CallFlow project and allow replacements.
2. Run the migration: `supabase/migrations/20260724_phase6_ai.sql`.
3. Add the environment variables below.
4. Run `npm install`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

## Environment
```env
OPENAI_API_KEY=your_server_only_api_key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```
The key is server-only. Never prefix it with `NEXT_PUBLIC_`.

The provider module uses the OpenAI-compatible Chat Completions API. A compatible provider can be used by changing `OPENAI_BASE_URL` and `OPENAI_MODEL`.

## Use
Open `/dashboard/ai`. Paste a transcript for full analysis, generate an email, or create task suggestions.

## Production notes
- AI responses can be inaccurate and should be reviewed by a human.
- Configure provider billing and usage limits before production.
- Do not send sensitive regulated data to a provider unless your agreement and configuration permit it.
