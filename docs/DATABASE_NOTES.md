# Live Ballot — Database Layer (Stage 1)

This package is the **tested database foundation** for Live Ballot. It was run and
functionally tested against real PostgreSQL 16 before delivery. The frontend is the
next stage (not in this zip).

## What's in here

```
live-ballot/
├── db/
│   ├── schema_complete.sql   <- THE schema. Run this ONE file in Supabase.
│   └── _test.sql             <- functional test script (optional, for your reference)
├── edge-functions/
│   └── send-voter-code/
│       └── index.ts          <- Resend email function (EMAIL STAGE — not yet wired/tested)
└── docs/
    ├── README.md             <- this file
    └── FEATURE_4_INTAKE_OPTIONS.md  <- pick the intake design before I build it
```

## How to deploy the schema

1. Open your Supabase project → **SQL Editor** → New query.
2. Paste the **entire** contents of `db/schema_complete.sql` and Run.
3. It is safe to re-run any time — it drops its own objects first (no drift, no
   duplicate-function-overload errors). It does **not** touch Supabase internals.

That's the whole DB install. One file, one shot, exactly as you asked.

### Storage buckets (do this once, in the Supabase dashboard)

Create two **private** buckets under Storage:

- `voter-photos`     — selfies captured at registration
- `candidate-photos` — self-nomination photos

Leave both private. The frontend will upload to them and the committee views via
short-lived **signed URLs**. The DB only ever stores the file *path* + a sha256
*hash* (for the duplicate-selfie flag) — never the image itself.

## How identity + codes work (your two decisions, baked in)

- **Per-election method** (`voter_identity_method`): `admission_number` or `generated_code`.
- **Code timing** (`code_issue_timing`): `at_registration` (vote now, review later) or
  `at_approval` (cleared first, then vote).
- **Code format/length**: `numeric` / `alphanumeric` / `special`, length 4–24. The
  generator skips look-alike characters (no 0/O/1/I) so codes are easy to read aloud.
- **Ballot secrecy** (`admin_can_see_votes`): the code always maps to a real person, so
  the admin always sees *who* registered and *who* voted. Whether the admin can see
  *how* each person voted is this per-election toggle. Off = the `ballots` field in the
  tally is `null`; on = it returns the full voter→choice mapping.

## Anti-abuse (manual, as agreed)

Selfies are stored with a sha256 hash. If two registrations share the same hash, the
admin voter list flags `duplicate_selfie: true`. No external face-match API yet — the
committee eyeballs flagged ones and rejects with a reason. Rejecting **pulls the vote
from the verified count** (reversible, never hard-deleted). Automated face matching is a
later upgrade.

## Function reference (everything the frontend will call)

Public (anon):
- `create_election(...)` → `{election_id, code}`
- `get_election_public(code)` → election + positions + approved candidates + turnout
- `get_turnout(code)` → integer (cheap live polling)
- `register_voter(code, name, email, grade, batch, admission_number, selfie_path, selfie_hash)`
- `self_nominate(code, position_id, name, bio, manifesto, photo_path, registration_id)`
- `submit_intake(code, payload jsonb)` → public request-access form
- `cast_vote(code, identity, votes jsonb)` — identity = admission number OR code
- `get_results(code)` — only after publish

Admin (each verifies the bcrypt password first):
- `admin_login`, `admin_get_voters`, `admin_get_tally`
- `admin_set_voter_code`, `admin_regenerate_code`
- `admin_approve_registration`, `admin_reject_registration`
- `admin_approve_candidate`, `admin_reject_candidate`
- `admin_get_intake`, `admin_convert_intake`, `admin_reject_intake`
- `admin_import_voters` (bulk CSV rows → registrations + codes)
- `admin_set_vote_counted` (manual disqualify/requalify)
- `admin_publish_results`, `admin_unpublish_results`, `admin_reset_votes`
- `admin_purge_photos` (returns paths to delete from Storage, then clears refs)
- `admin_delete_election` (returns photo paths, then cascades)

## Security model

- Every table: RLS enabled + FORCED, **no policies** → anon/authenticated cannot read or
  write any table directly (verified in test G).
- All access via `SECURITY DEFINER` functions. Internal helpers (`_lb_*`) are revoked
  from clients; only the RPCs above are granted.
- Admin password is bcrypt-hashed per election and never returned to the client.
- `owner_id` exists but is unused — ready to wire to Supabase Auth + a "my elections"
  dashboard later without a migration.

## What was tested (against real Postgres 16)

Both identity methods, both code timings, verified-mode approval/rejection, vote pulling,
double-vote prevention, admission-range enforcement, ballot-secrecy toggle, bulk import,
intake conversion, wrong-password rejection, and RLS table isolation. See `db/_test.sql`.

## Roadmap (next stages, after you confirm)

2. Frontend scaffold (React/Vite/Tailwind, "official ballot paper" theme) + create + admin login
3. Voting flow (both methods) + live turnout
4. Verified-mode registration with camera selfie + committee queues
5. Code-list admin screen (copy buttons, search/filter, resend, CSV export)
6. Intake form path — **after** you pick the design in FEATURE_4_INTAKE_OPTIONS.md
7. Email stage — wire the Resend edge function (needs your Resend account + key)
