# Live Ballot — Frontend (Stage 2)

React + Vite + Tailwind app for the Live Ballot platform. Talks only to the
SECURITY DEFINER RPCs in `schema_complete.sql` — no direct table access.

Verified before delivery: `npm run build` passes clean, and a server-render
smoke test mounts all 9 routes without errors (`npm run smoke`).

## Run it locally

```bash
npm install
cp .env.example .env        # then fill in your Supabase URL + anon key
npm run dev                 # http://localhost:5173
```

`.env` values come from Supabase dashboard → Project Settings → API:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`  (the public anon key — safe in the browser because
  every table has RLS with no policies; all access is through the RPCs)

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the built app
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it in Vercel. Framework preset: **Vite**.
3. Add the two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in
   Vercel → Project → Settings → Environment Variables.
4. Add a rewrite so client-side routes work on refresh. Create `vercel.json`:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
   ```
   (Included in this folder.)

## Before it works end-to-end

- Run `db/schema_complete.sql` in your Supabase SQL editor (Stage 1 zip). If you
  already ran the earlier version, **re-run it** — this stage added one function
  (`admin_get_candidates`) used by the Nominations tab. Re-running drops and
  recreates everything, so only do it while you have no real data yet.
- Create the two **private** Storage buckets: `voter-photos`, `candidate-photos`.

## Routes

- `/` — enter a code or create an election
- `/create` — full setup (identity method, code config, verified mode, ballot
  secrecy, time windows, positions + candidates)
- `/e/:code` — vote (inked-X ballot, both identity methods)
- `/e/:code/results` — published results
- `/e/:code/register` — verified-mode registration with selfie
- `/e/:code/nominate` — self-nomination
- `/e/:code/request` — public "request access" intake form
- `/e/:code/admin` — committee panel: live tally (provisional vs verified +
  optional ballot view), voters & codes (copy / search / CSV import+export /
  regenerate / override), registrations review, nominations review, requests,
  and controls (publish / reset / purge / delete)

## Design

"Official ballot paper" — Archivo (display) + Public Sans (body) + IBM Plex Mono
(codes/data), ink/violet/red/green palette, double-rule borders, and a hand-inked
X as the selection mark and signature element. Fonts load from Google Fonts in
`index.html`.

## What I could not verify on my side

- A live visual screenshot of the running app (no browser screenshot tool in the
  build environment). Build + render-mount are verified; the visual styling should
  be checked once in your browser.
- Real Supabase calls and Storage uploads — these need your project + buckets.
- The Resend auto-email — needs your Resend account (Stage 1 zip has the function
  + setup steps). The "auto-email codes" toggle is wired in the UI but the actual
  send is the email stage.
