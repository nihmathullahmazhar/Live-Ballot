# Live Ballot — full system

A multi-tenant online election platform. One database hosts every election;
each election is a "room" with a 6-char code. Voters prove identity by admission
number or a personal one-time code; an optional verified mode adds selfie
registration + committee review. All data access goes through SECURITY DEFINER
Postgres functions — the browser never touches tables directly.

```
live-ballot/
├── database/
│   ├── schema_complete.sql   <- run this ONE file in Supabase (tested on PG16)
│   └── _test.sql             <- the functional test script I ran (reference)
├── frontend/                 <- React + Vite + Tailwind app (build + smoke verified)
├── edge-functions/
│   └── send-voter-code/      <- Resend email fn (EMAIL STAGE — needs your account)
└── docs/
    ├── DATABASE_NOTES.md         <- DB deep-dive + full function reference
    └── FEATURE_4_INTAKE_OPTIONS.md <- intake design options (I built A + C)
```

## From zero to running (15 minutes)

1. **Database.** Supabase → SQL Editor → paste all of
   `database/schema_complete.sql` → Run. Safe to re-run (drops + recreates its own
   objects; no drift). NOTE: re-running wipes existing data, so only re-run while
   you're still setting up.
2. **Storage.** Supabase → Storage → create two **private** buckets:
   `voter-photos` and `candidate-photos`.
3. **Frontend.**
   ```bash
   cd frontend
   npm install
   cp .env.example .env     # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
   npm run dev
   ```
4. **Deploy** the frontend to Vercel (Vite preset, add the two env vars,
   `vercel.json` for SPA routing is included).
5. **(Later) Email.** When you want auto-emailed codes, set up Resend and deploy
   `edge-functions/send-voter-code` — steps are in that file's header.

## What's verified vs what needs you

Verified on my side:
- `schema_complete.sql` runs clean on real PostgreSQL 16, is idempotent (no
  duplicate-overload/"function not found" drift), and passes a functional test of
  every flow (both identity methods, both code timings, verified-mode approve/
  reject + vote pulling, ballot-secrecy toggle, bulk import, intake conversion,
  wrong-password rejection, RLS table isolation).
- `frontend` passes `npm run build` clean and a server-render smoke test mounting
  all 9 routes (`npm run smoke`).

Needs you (external dependencies / can't test here):
- Real Supabase project + the two Storage buckets.
- A visual once-over of the UI in a browser (no screenshot tool in my build env).
- Resend account for the auto-email feature.

## Feature 4 decision

You didn't specify, so I built my recommendation: **A + C** — an in-app public
"Request access" form (`/e/:code/request` → admin "Requests" tab) AND CSV import
of voters (admin "Voters & codes" tab). No fragile Google Forms integration. If
you want native Google Forms (Option B) later, say so. See
`docs/FEATURE_4_INTAKE_OPTIONS.md`.

## Still on the roadmap (say the word)

- Email stage: wire `send-voter-code` to the `auto_email_codes` toggle + a
  "resend code" button.
- Automated duplicate-selfie detection (currently manual via the ⚑ flag).
- Supabase Auth + a "my elections" dashboard (schema already has `owner_id`).
- Rate-limiting / captcha on the public register + request forms.
