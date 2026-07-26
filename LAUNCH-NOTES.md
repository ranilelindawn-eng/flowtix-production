# CallFlow Launch Notes

## Included public routes

- `/`
- `/features`
- `/solutions`
- `/pricing`
- `/ai-features`
- `/integrations`
- `/security`
- `/help`
- `/docs`
- `/contact`
- `/about`
- `/blog`
- `/privacy`
- `/terms`
- `/acceptable-use`
- `/recording-consent`
- `/status`
- Authentication and protected dashboard routes

## Before deployment

1. Copy your existing `.env.local` into this project.
2. Set `NEXT_PUBLIC_SITE_URL` to the final production URL.
3. Run `npm install`.
4. Run `npm run lint`, `npm run type-check`, and `npm run build`.
5. Confirm Supabase Site URL and redirect URLs match the production domain.
6. Deploy to Netlify. The contact form is configured for Netlify Forms.
7. Enable Netlify form notifications if email alerts are required.
8. Connect a telephony provider before representing live calling as active.
9. Connect transcription or AI providers before representing automated processing as active.

The `.env.local`, `.next`, `node_modules`, and local build artifacts are intentionally excluded from the ZIP.
