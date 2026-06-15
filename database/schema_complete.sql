-- ============================================================================
-- LIVE BALLOT — COMPLETE DATABASE SCHEMA (single file, run in one shot)
-- Multi-tenant online election platform.
-- ----------------------------------------------------------------------------
-- Design rules:
--   * One database hosts ALL elections. Tenant isolation is by election_id.
--   * Every table has RLS ENABLED with NO policies => the anon/authenticated
--     PostgREST roles can NEVER touch tables directly.
--   * ALL access goes through SECURITY DEFINER functions (owned by the role
--     that runs this file, i.e. postgres on Supabase).
--   * Admin auth = bcrypt password PER ELECTION, verified server-side on every
--     admin call. No password is ever returned to the client.
--   * owner_id is present but nullable — ready for a future Supabase Auth
--     "my elections" dashboard. Nothing depends on it yet.
--
-- Safe to re-run: drops its own objects first. Does NOT drop the public schema
-- (that would break Supabase internals).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS
--    Supabase keeps pgcrypto in the "extensions" schema. We create that schema
--    if missing (no-op on Supabase) so the same file runs locally too.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- gen_random_uuid() is built into Postgres 13+ (pg_catalog), always available.

-- ---------------------------------------------------------------------------
-- 1. CLEAN TEARDOWN (drop OUR objects only, in dependency order)
--    Explicit drops avoid the "duplicate function overload / function not
--    found" drift that splitting base+migration caused before.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS votes              CASCADE;
DROP TABLE IF EXISTS candidates         CASCADE;
DROP TABLE IF EXISTS registrations      CASCADE;
DROP TABLE IF EXISTS form_fields        CASCADE;
DROP TABLE IF EXISTS intake_responses   CASCADE;
DROP TABLE IF EXISTS positions          CASCADE;
DROP TABLE IF EXISTS audit_log          CASCADE;
DROP TABLE IF EXISTS elections          CASCADE;

-- Drop functions by name across any signature (handles arg-list changes).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'DROP FUNCTION IF EXISTS public.' || quote_ident(p.proname)
           || '(' || pg_get_function_identity_arguments(p.oid) || ') CASCADE;' AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'lb_now','_lb_gen_code','_lb_verify_admin','_lb_audit','_lb_election_phase',
        'create_election','get_election_public','get_turnout',
        'register_voter','self_nominate','submit_intake','cast_vote','get_results',
        'admin_login','admin_get_settings','admin_get_voters','admin_set_voter_code',
        'admin_regenerate_code','admin_approve_registration','admin_reject_registration',
        'admin_approve_candidate','admin_reject_candidate','admin_get_tally',
        'admin_get_candidates',
        'get_my_elections','get_my_election','get_form_fields','admin_set_form_fields','submit_form_response',
        'admin_get_responses','admin_update_response','admin_delete_response',
        'admin_generate_codes','admin_finalize_election','admin_unfinalize_election',
        'admin_set_results_mode','admin_set_paused','admin_set_registration_open','admin_set_self_nomination','admin_set_password','admin_set_vote_message','admin_get_activity',
        'admin_get_ballot','admin_add_position','admin_update_position','admin_delete_position',
        'admin_add_candidate','admin_delete_candidate',
        'admin_get_intake','admin_convert_intake','admin_reject_intake',
        'admin_publish_results','admin_unpublish_results','admin_reset_votes',
        'admin_set_vote_counted','admin_purge_photos','admin_delete_election',
        'admin_bulk_issue_codes','admin_import_voters'
      )
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------

-- 2.1 elections — one row per election "room"
CREATE TABLE elections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL UNIQUE,                 -- 6-char public slug
  title                 text NOT NULL,
  description           text,
  admin_password_hash   text,                                 -- bcrypt; NULL = no sharing password (owner-only)

  -- voter identity method (Feature 1)
  voter_identity_method text NOT NULL DEFAULT 'admission_number'
                          CHECK (voter_identity_method IN ('admission_number','generated_code')),

  -- admission-number method config
  admission_min         integer DEFAULT 10000,
  admission_max         integer DEFAULT 99999,

  -- generated-code method config (Feature 2)
  code_format           text NOT NULL DEFAULT 'alphanumeric'
                          CHECK (code_format IN ('numeric','alphanumeric','special')),
  code_length           integer NOT NULL DEFAULT 8 CHECK (code_length BETWEEN 4 AND 24),
  code_issue_timing     text NOT NULL DEFAULT 'at_approval'
                          CHECK (code_issue_timing IN ('at_registration','at_approval')),

  -- verified mode (committee review of registrations + self-nominations)
  verified_mode         boolean NOT NULL DEFAULT false,

  -- ballot secrecy toggle (your point 2): admin always sees WHO registered/voted,
  -- but only sees HOW they voted when this is true.
  admin_can_see_votes   boolean NOT NULL DEFAULT false,

  -- email (Feature 3): email required at registration; optional auto-email of codes
  auto_email_codes      boolean NOT NULL DEFAULT false,

  -- candidate self-nomination (STEP 3.5) — independent of verified_mode
  enable_self_nomination boolean NOT NULL DEFAULT false,

  -- results visibility model (3 modes): hidden until released, live during, admin only
  results_mode          text NOT NULL DEFAULT 'hidden'
                          CHECK (results_mode IN ('hidden','live','admin_only')),

  -- finalization gate: voting cannot open until the admin finalizes
  is_finalized          boolean NOT NULL DEFAULT false,
  finalized_at          timestamptz,

  -- live operational switches the admin flips during the run
  is_paused             boolean NOT NULL DEFAULT false,   -- temporarily halt voting
  registration_open     boolean NOT NULL DEFAULT true,    -- accept new form submissions?
  vote_message          text,                             -- custom message shown after a voter casts their vote

  -- time windows
  nominations_open_at   timestamptz,
  nominations_close_at  timestamptz,
  voting_open_at        timestamptz,
  voting_close_at       timestamptz,

  results_published     boolean NOT NULL DEFAULT false,
  owner_id              uuid,                                 -- future Supabase Auth
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_admission_range CHECK (admission_max >= admission_min)
);

-- 2.2 positions — seats being contested
CREATE TABLE positions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id  uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  title        text NOT NULL,
  max_winners  integer NOT NULL DEFAULT 1 CHECK (max_winners >= 1),
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2.3 registrations — one row per voter (created at registration OR on-the-fly
--     at vote time for plain admission-number elections)
CREATE TABLE registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id       uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name              text,
  email             text,
  grade             text,
  batch             text,
  admission_number  text,
  raw_data          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- custom form answers
  voter_code        text,                       -- the unique one-time code
  code_issued       boolean NOT NULL DEFAULT false,
  selfie_path       text,                        -- path in private bucket, not a URL
  selfie_hash       text,                        -- sha256 of file, for dup detection
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  rejection_reason  text,
  has_voted         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- uniqueness per election (partial — nulls allowed before a code/number is set)
CREATE UNIQUE INDEX uq_reg_code  ON registrations(election_id, voter_code)
  WHERE voter_code IS NOT NULL;
CREATE UNIQUE INDEX uq_reg_adm   ON registrations(election_id, admission_number)
  WHERE admission_number IS NOT NULL;
CREATE INDEX idx_reg_election    ON registrations(election_id);
CREATE INDEX idx_reg_status      ON registrations(election_id, status);
CREATE INDEX idx_reg_selfie_hash ON registrations(election_id, selfie_hash)
  WHERE selfie_hash IS NOT NULL;

-- 2.4 candidates — admin-added or self-nominated
CREATE TABLE candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id      uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  position_id      uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name             text NOT NULL,
  photo_path       text,
  bio              text,
  manifesto        text,
  source           text NOT NULL DEFAULT 'admin_added'
                     CHECK (source IN ('admin_added','self_nominated')),
  status           text NOT NULL DEFAULT 'approved'
                     CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  registration_id  uuid REFERENCES registrations(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cand_election ON candidates(election_id);
CREATE INDEX idx_cand_position ON candidates(position_id);
CREATE INDEX idx_cand_status   ON candidates(election_id, status);

-- 2.5 votes — one row per (voter, position). Links to registration for audit
--     + reversible disqualification. Never hard-deleted on reject.
CREATE TABLE votes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id     uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  position_id     uuid NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  is_counted      boolean NOT NULL DEFAULT true,   -- per-vote disqualify toggle
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_one_vote_per_position UNIQUE (election_id, position_id, registration_id)
);
CREATE INDEX idx_votes_election  ON votes(election_id);
CREATE INDEX idx_votes_candidate ON votes(candidate_id);

-- 2.6 intake_responses — public "request access" form submissions (Feature 4,
--     in-app option). Stays separate; admin converts an approved one into a
--     registration (+ issues a code).
CREATE TABLE intake_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id       uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name              text,
  email             text,
  grade             text,
  batch             text,
  admission_number  text,
  raw_data          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- dynamic form answers keyed by field_key
  wants_candidacy   boolean NOT NULL DEFAULT false,
  candidacy         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {position_ids:[], statement, experience, photo_path}
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','converted','rejected')),
  registration_id   uuid REFERENCES registrations(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intake_election ON intake_responses(election_id, status);

-- 2.6b form_fields — the admin-built custom registration form (dynamic, like a
--      Google Form). section 'voter' = always shown; 'candidate' = shown only
--      when the person opts into self-nomination.
CREATE TABLE form_fields (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id  uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  section      text NOT NULL DEFAULT 'voter' CHECK (section IN ('voter','candidate')),
  field_key    text NOT NULL,                     -- stable key used in answers jsonb
  label        text NOT NULL,
  field_type   text NOT NULL CHECK (field_type IN
                 ('text','textarea','email','phone','number','nic',
                  'dropdown','radio','checkbox','document')),
  required     boolean NOT NULL DEFAULT false,
  options      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- choices for dropdown/radio/checkbox
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_field_key UNIQUE (election_id, section, field_key)
);
CREATE INDEX idx_form_fields_election ON form_fields(election_id, section, sort_order);

-- 2.7 audit_log — append-only trail of every meaningful action
CREATE TABLE audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id  uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  action       text NOT NULL,
  actor        text NOT NULL DEFAULT 'system',   -- 'admin' | 'voter' | 'system'
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_election ON audit_log(election_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY — enable on every table, define NO policies.
--    Result: PostgREST roles (anon/authenticated) cannot read/write tables.
--    SECURITY DEFINER functions (owned by postgres) bypass RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE elections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;

ALTER TABLE elections        FORCE ROW LEVEL SECURITY;
ALTER TABLE positions        FORCE ROW LEVEL SECURITY;
ALTER TABLE registrations    FORCE ROW LEVEL SECURITY;
ALTER TABLE candidates       FORCE ROW LEVEL SECURITY;
ALTER TABLE votes            FORCE ROW LEVEL SECURITY;
ALTER TABLE intake_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE form_fields      FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log        FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. INTERNAL HELPER FUNCTIONS (prefixed _lb_, not granted to clients)
-- ============================================================================

CREATE OR REPLACE FUNCTION lb_now() RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT now() $$;

-- 4.0 current authenticated user id from the Supabase JWT (NULL if logged out).
--     Reads request claims directly so it also loads cleanly on plain Postgres.
CREATE OR REPLACE FUNCTION _lb_current_uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claim.sub', true),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), ''
  )::uuid
$$;

-- 4.1 generate a code in the election's chosen format
CREATE OR REPLACE FUNCTION _lb_gen_code(p_format text, p_length integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  digits   constant text := '0123456789';
  alpha    constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- no 0/O/1/I
  special  constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ!@#$%*';
  pool     text;
  out_str  text := '';
  i        integer;
BEGIN
  pool := CASE p_format
            WHEN 'numeric'      THEN digits
            WHEN 'special'      THEN special
            ELSE alpha
          END;
  FOR i IN 1..p_length LOOP
    out_str := out_str || substr(pool, 1 + floor(random() * length(pool))::int, 1);
  END LOOP;
  RETURN out_str;
END $$;

-- 4.2 verify an admin password against an election (bcrypt). Returns the
--     election row id if valid, else NULL. Used by every admin function.
CREATE OR REPLACE FUNCTION _lb_verify_admin(p_code text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id    uuid;
  v_owner uuid;
  v_hash  text;
  v_uid   uuid;
BEGIN
  SELECT id, owner_id, admin_password_hash INTO v_id, v_owner, v_hash
  FROM elections WHERE code = upper(p_code);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  -- 1) the logged-in owner gets full access via their account (no election password)
  v_uid := _lb_current_uid();
  IF v_uid IS NOT NULL AND v_owner IS NOT NULL AND v_uid = v_owner THEN
    RETURN v_id;
  END IF;
  -- 2) otherwise an (optional) sharing password is required
  IF v_hash IS NOT NULL AND p_password IS NOT NULL
     AND v_hash = crypt(p_password, v_hash) THEN
    RETURN v_id;
  END IF;
  RETURN NULL;
END $$;

-- 4.3 append to the audit log
CREATE OR REPLACE FUNCTION _lb_audit(p_election uuid, p_action text, p_actor text, p_meta jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO audit_log(election_id, action, actor, metadata)
  VALUES (p_election, p_action, COALESCE(p_actor,'system'), COALESCE(p_meta,'{}'::jsonb));
$$;

-- 4.4 derive the current phase of an election from its time windows
CREATE OR REPLACE FUNCTION _lb_election_phase(e elections)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN e.voting_close_at  IS NOT NULL AND now() > e.voting_close_at        THEN 'closed'
    WHEN e.is_paused AND e.is_finalized                                      THEN 'paused'
    WHEN NOT e.is_finalized
         AND ((e.voting_open_at IS NULL) OR now() >= COALESCE(e.nominations_close_at, e.voting_open_at))
         AND (e.nominations_open_at IS NOT NULL OR e.voting_open_at IS NOT NULL
              OR e.verified_mode OR e.enable_self_nomination)                THEN 'finalizing'
    WHEN e.voting_open_at   IS NOT NULL AND now() >= e.voting_open_at
         AND e.is_finalized                                                  THEN 'voting'
    WHEN e.nominations_close_at IS NOT NULL AND now() > e.nominations_close_at
         AND (e.voting_open_at IS NULL OR now() < e.voting_open_at)          THEN 'pre_voting'
    WHEN e.nominations_open_at  IS NOT NULL AND now() >= e.nominations_open_at THEN 'nominations'
    WHEN e.nominations_open_at  IS NULL AND e.voting_open_at IS NULL
         AND e.is_finalized                                                  THEN 'open'
    WHEN e.nominations_open_at  IS NULL AND e.voting_open_at IS NULL         THEN 'finalizing'
    ELSE 'scheduled'
  END;
$$;

-- ============================================================================
-- 5. PUBLIC FUNCTIONS (callable by anon)
-- ============================================================================

-- 5.1 create an election. Returns code + id. Admin password hashed here.
CREATE OR REPLACE FUNCTION create_election(
  p_title                 text,
  p_admin_password        text,
  p_description           text    DEFAULT NULL,
  p_voter_identity_method text    DEFAULT 'admission_number',
  p_admission_min         integer DEFAULT 10000,
  p_admission_max         integer DEFAULT 99999,
  p_code_format           text    DEFAULT 'alphanumeric',
  p_code_length           integer DEFAULT 8,
  p_code_issue_timing     text    DEFAULT 'at_approval',
  p_verified_mode         boolean DEFAULT false,
  p_admin_can_see_votes   boolean DEFAULT false,
  p_auto_email_codes      boolean DEFAULT false,
  p_enable_self_nomination boolean DEFAULT false,
  p_results_mode          text    DEFAULT 'hidden',
  p_nominations_open_at   timestamptz DEFAULT NULL,
  p_nominations_close_at  timestamptz DEFAULT NULL,
  p_voting_open_at        timestamptz DEFAULT NULL,
  p_voting_close_at       timestamptz DEFAULT NULL,
  p_positions             jsonb   DEFAULT '[]'::jsonb,  -- [{title, max_winners, candidates:[{name,bio}]}]
  p_form_fields           jsonb   DEFAULT '[]'::jsonb   -- [{section,field_key,label,field_type,required,options,sort_order}]
)
RETURNS TABLE(election_id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text;
  v_id   uuid;
  v_pos  jsonb;
  v_cand jsonb;
  v_pos_id uuid;
  v_tries int := 0;
BEGIN
  -- password is optional now (owner accesses via their account). If one IS
  -- given, it must be at least 4 chars — it becomes the sharing key.
  IF COALESCE(btrim(p_admin_password),'') <> '' AND length(btrim(p_admin_password)) < 4 THEN
    RAISE EXCEPTION 'If you set a password it must be at least 4 characters';
  END IF;

  -- unique 6-char code (uppercase, unambiguous alphabet)
  LOOP
    v_code := _lb_gen_code('alphanumeric', 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM elections WHERE elections.code = v_code);
    v_tries := v_tries + 1;
    IF v_tries > 50 THEN RAISE EXCEPTION 'Could not allocate election code'; END IF;
  END LOOP;

  INSERT INTO elections(
    code, title, description, admin_password_hash,
    voter_identity_method, admission_min, admission_max,
    code_format, code_length, code_issue_timing,
    verified_mode, admin_can_see_votes, auto_email_codes,
    enable_self_nomination, results_mode,
    nominations_open_at, nominations_close_at, voting_open_at, voting_close_at,
    owner_id
  ) VALUES (
    v_code, p_title, p_description,
    CASE WHEN COALESCE(btrim(p_admin_password),'') = '' THEN NULL
         ELSE crypt(p_admin_password, gen_salt('bf')) END,
    p_voter_identity_method, p_admission_min, p_admission_max,
    p_code_format, p_code_length, p_code_issue_timing,
    p_verified_mode, p_admin_can_see_votes, p_auto_email_codes,
    p_enable_self_nomination, COALESCE(p_results_mode,'hidden'),
    p_nominations_open_at, p_nominations_close_at, p_voting_open_at, p_voting_close_at,
    _lb_current_uid()
  ) RETURNING id INTO v_id;

  -- optional custom form fields
  INSERT INTO form_fields(election_id, section, field_key, label, field_type, required, options, sort_order)
  SELECT v_id,
         COALESCE(f->>'section','voter'),
         f->>'field_key',
         f->>'label',
         f->>'field_type',
         COALESCE((f->>'required')::boolean,false),
         COALESCE(f->'options','[]'::jsonb),
         COALESCE((f->>'sort_order')::int,0)
  FROM jsonb_array_elements(COALESCE(p_form_fields,'[]'::jsonb)) f
  WHERE f->>'field_key' IS NOT NULL AND f->>'label' IS NOT NULL;

  -- optional positions + candidates payload
  FOR v_pos IN SELECT * FROM jsonb_array_elements(coalesce(p_positions,'[]'::jsonb)) LOOP
    INSERT INTO positions(election_id, title, max_winners, sort_order)
    VALUES (v_id, v_pos->>'title', coalesce((v_pos->>'max_winners')::int,1),
            coalesce((v_pos->>'sort_order')::int,0))
    RETURNING id INTO v_pos_id;

    FOR v_cand IN SELECT * FROM jsonb_array_elements(coalesce(v_pos->'candidates','[]'::jsonb)) LOOP
      INSERT INTO candidates(election_id, position_id, name, bio, source, status)
      VALUES (v_id, v_pos_id, v_cand->>'name', v_cand->>'bio', 'admin_added', 'approved');
    END LOOP;
  END LOOP;

  PERFORM _lb_audit(v_id, 'election_created', 'admin',
                    jsonb_build_object('method', p_voter_identity_method));
  RETURN QUERY SELECT v_id, v_code;
END $$;

-- 5.2 public view of an election (no secrets). Includes positions, APPROVED
--     candidates, derived phase, and public turnout.
CREATE OR REPLACE FUNCTION get_election_public(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e elections; result jsonb;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RETURN NULL; END IF;

  result := jsonb_build_object(
    'code', e.code,
    'title', e.title,
    'description', e.description,
    'voter_identity_method', e.voter_identity_method,
    'verified_mode', e.verified_mode,
    'enable_self_nomination', e.enable_self_nomination,
    'results_mode', e.results_mode,
    'is_finalized', e.is_finalized,
    'is_paused', e.is_paused,
    'registration_open', e.registration_open,
    'vote_message', e.vote_message,
    'phase', _lb_election_phase(e),
    'results_published', e.results_published,
    'nominations_open_at', e.nominations_open_at,
    'nominations_close_at', e.nominations_close_at,
    'voting_open_at', e.voting_open_at,
    'voting_close_at', e.voting_close_at,
    'turnout', (SELECT count(DISTINCT registration_id) FROM votes WHERE election_id = e.id),
    'positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'title', p.title, 'max_winners', p.max_winners,
               'candidates', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'id', c.id, 'name', c.name, 'bio', c.bio,
                           'manifesto', c.manifesto, 'photo_path', c.photo_path)
                         ORDER BY c.name)
                  FROM candidates c
                  WHERE c.position_id = p.id AND c.status = 'approved'
               ), '[]'::jsonb))
             ORDER BY p.sort_order, p.title)
      FROM positions p WHERE p.election_id = e.id
    ), '[]'::jsonb)
  );
  RETURN result;
END $$;

-- 5.3 public turnout only (cheap, for live polling)
CREATE OR REPLACE FUNCTION get_turnout(p_code text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT v.registration_id)::int
  FROM votes v JOIN elections e ON e.id = v.election_id
  WHERE e.code = upper(p_code);
$$;

-- 5.4 register a voter. Email required. Selfie optional (path+hash from client
--     after uploading to the private bucket). If generated_code + at_registration
--     timing, a code is issued immediately and RETURNED (so the voter can vote
--     now). Otherwise no code yet (issued on approval).
CREATE OR REPLACE FUNCTION register_voter(
  p_code             text,
  p_name             text,
  p_email            text,
  p_grade            text DEFAULT NULL,
  p_batch            text DEFAULT NULL,
  p_admission_number text DEFAULT NULL,
  p_selfie_path      text DEFAULT NULL,
  p_selfie_hash      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  e elections; v_reg_id uuid; v_code text; v_issue boolean := false;
  v_dup boolean := false; v_tries int := 0;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;
  IF coalesce(trim(p_email),'') = '' THEN RAISE EXCEPTION 'Email is required'; END IF;

  -- duplicate-selfie flag (manual review aid; does not block)
  IF p_selfie_hash IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM registrations
                  WHERE election_id = e.id AND selfie_hash = p_selfie_hash) INTO v_dup;
  END IF;

  -- decide whether to issue a code right now
  IF e.voter_identity_method = 'generated_code'
     AND e.code_issue_timing = 'at_registration' THEN
    v_issue := true;
    LOOP
      v_code := _lb_gen_code(e.code_format, e.code_length);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations
                            WHERE election_id = e.id AND voter_code = v_code);
      v_tries := v_tries + 1;
      IF v_tries > 50 THEN RAISE EXCEPTION 'Could not allocate voter code'; END IF;
    END LOOP;
  END IF;

  INSERT INTO registrations(
    election_id, name, email, grade, batch, admission_number,
    voter_code, code_issued, selfie_path, selfie_hash,
    status
  ) VALUES (
    e.id, p_name, p_email, p_grade, p_batch, p_admission_number,
    v_code, v_issue, p_selfie_path, p_selfie_hash,
    CASE WHEN e.verified_mode THEN 'pending' ELSE 'approved' END
  ) RETURNING id INTO v_reg_id;

  PERFORM _lb_audit(e.id, 'voter_registered', 'voter',
            jsonb_build_object('registration_id', v_reg_id, 'duplicate_selfie', v_dup));

  RETURN jsonb_build_object(
    'registration_id', v_reg_id,
    'code_issued', v_issue,
    'voter_code', v_code,              -- null unless issued now
    'duplicate_selfie_flag', v_dup,
    'status', CASE WHEN e.verified_mode THEN 'pending' ELSE 'approved' END
  );
END $$;

-- 5.5 self-nominate as a candidate during the nomination window.
CREATE OR REPLACE FUNCTION self_nominate(
  p_code            text,
  p_position_id     uuid,
  p_name            text,
  p_bio             text DEFAULT NULL,
  p_manifesto       text DEFAULT NULL,
  p_photo_path      text DEFAULT NULL,
  p_registration_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e elections; v_cand_id uuid; v_phase text;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM positions WHERE id = p_position_id AND election_id = e.id) THEN
    RAISE EXCEPTION 'Position not in this election';
  END IF;

  v_phase := _lb_election_phase(e);
  IF e.verified_mode AND v_phase NOT IN ('nominations','open') THEN
    RAISE EXCEPTION 'Nominations are not open (phase: %)', v_phase;
  END IF;

  INSERT INTO candidates(election_id, position_id, name, bio, manifesto, photo_path,
                         source, status, registration_id)
  VALUES (e.id, p_position_id, p_name, p_bio, p_manifesto, p_photo_path,
          'self_nominated', 'pending', p_registration_id)
  RETURNING id INTO v_cand_id;

  PERFORM _lb_audit(e.id, 'self_nomination', 'voter',
            jsonb_build_object('candidate_id', v_cand_id, 'position_id', p_position_id));
  RETURN jsonb_build_object('candidate_id', v_cand_id, 'status', 'pending');
END $$;

-- 5.6 public intake form submission (Feature 4 in-app path)
CREATE OR REPLACE FUNCTION submit_intake(p_code text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e elections; v_id uuid;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;

  INSERT INTO intake_responses(election_id, name, email, grade, batch, admission_number, raw_data)
  VALUES (e.id,
          p_payload->>'name', p_payload->>'email', p_payload->>'grade',
          p_payload->>'batch', p_payload->>'admission_number',
          coalesce(p_payload->'raw_data', p_payload))
  RETURNING id INTO v_id;

  PERFORM _lb_audit(e.id, 'intake_submitted', 'voter', jsonb_build_object('intake_id', v_id));
  RETURN jsonb_build_object('intake_id', v_id, 'status', 'pending');
END $$;

-- 5.7 cast a vote. p_identity = admission number OR voter code (depending on
--     the election's method). p_votes = [{position_id, candidate_id}, ...].
--     Burns the code (has_voted=true). One vote per position enforced by UNIQUE.
CREATE OR REPLACE FUNCTION cast_vote(p_code text, p_identity text, p_votes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e elections; v_reg registrations%ROWTYPE; v_phase text;
  v_item jsonb; v_pos uuid; v_cand uuid; v_count int := 0; v_adm int;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;

  v_phase := _lb_election_phase(e);
  IF v_phase = 'closed' THEN RAISE EXCEPTION 'Voting is closed'; END IF;
  IF e.is_paused THEN RAISE EXCEPTION 'Voting is paused by the organisers'; END IF;
  IF NOT e.is_finalized THEN
    RAISE EXCEPTION 'Voting has not opened yet — the election is still being finalized';
  END IF;
  IF e.voting_open_at IS NOT NULL AND now() < e.voting_open_at THEN
    RAISE EXCEPTION 'Voting has not opened yet';
  END IF;

  -- resolve the voter's registration based on method
  IF e.voter_identity_method = 'generated_code' THEN
    SELECT * INTO v_reg FROM registrations
      WHERE election_id = e.id AND voter_code = p_identity;
    IF v_reg.id IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;
    IF NOT v_reg.code_issued THEN RAISE EXCEPTION 'This code has not been issued yet'; END IF;
    IF e.verified_mode AND v_reg.status = 'rejected' THEN
      RAISE EXCEPTION 'This registration was rejected';
    END IF;
  ELSE
    -- admission-number method
    BEGIN v_adm := p_identity::int; EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Admission number must be numeric'; END;
    IF v_adm < e.admission_min OR v_adm > e.admission_max THEN
      RAISE EXCEPTION 'Admission number out of allowed range';
    END IF;
    SELECT * INTO v_reg FROM registrations
      WHERE election_id = e.id AND admission_number = p_identity;
    IF v_reg.id IS NULL THEN
      IF e.verified_mode THEN
        RAISE EXCEPTION 'You must register before voting';
      END IF;
      -- plain mode: create lightweight registration on the fly (auto-approved)
      INSERT INTO registrations(election_id, admission_number, status)
      VALUES (e.id, p_identity, 'approved') RETURNING * INTO v_reg;
    ELSIF e.verified_mode AND v_reg.status = 'rejected' THEN
      RAISE EXCEPTION 'This registration was rejected';
    END IF;
  END IF;

  IF v_reg.has_voted THEN RAISE EXCEPTION 'This voter has already voted'; END IF;

  -- record one vote per position (UNIQUE guards against dupes / double submit)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_votes) LOOP
    v_pos  := (v_item->>'position_id')::uuid;
    v_cand := (v_item->>'candidate_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM candidates
                   WHERE id = v_cand AND position_id = v_pos
                     AND election_id = e.id AND status = 'approved') THEN
      RAISE EXCEPTION 'Invalid candidate for position';
    END IF;
    INSERT INTO votes(election_id, position_id, candidate_id, registration_id)
    VALUES (e.id, v_pos, v_cand, v_reg.id);
    v_count := v_count + 1;
  END LOOP;

  UPDATE registrations SET has_voted = true WHERE id = v_reg.id;
  PERFORM _lb_audit(e.id, 'vote_cast', 'voter',
            jsonb_build_object('registration_id', v_reg.id, 'positions', v_count));
  RETURN jsonb_build_object('ok', true, 'positions_voted', v_count);
END $$;

-- 5.8 public results — only after the admin publishes
CREATE OR REPLACE FUNCTION get_results(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e elections;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;
  -- results visibility model:
  --   admin_only -> never public; live -> always public; hidden -> only once published
  IF e.results_mode = 'admin_only' THEN
    RAISE EXCEPTION 'Results are not public for this election';
  ELSIF e.results_mode = 'hidden' AND NOT e.results_published THEN
    RAISE EXCEPTION 'Results are not published yet';
  END IF;

  RETURN jsonb_build_object(
    'title', e.title,
    'positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'max_winners', p.max_winners,
        'candidates', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id', c.id, 'name', c.name,
                   'votes', (SELECT count(*) FROM votes v
                             WHERE v.candidate_id = c.id AND v.is_counted))
                 ORDER BY (SELECT count(*) FROM votes v
                           WHERE v.candidate_id = c.id AND v.is_counted) DESC)
          FROM candidates c WHERE c.position_id = p.id AND c.status='approved'
        ), '[]'::jsonb))
      ORDER BY p.sort_order, p.title)
      FROM positions p WHERE p.election_id = e.id
    ), '[]'::jsonb)
  );
END $$;

-- ============================================================================
-- 6. ADMIN FUNCTIONS — every one verifies the bcrypt password first.
-- ============================================================================

-- 6.1 login check + return settings (no password hash)
CREATE OR REPLACE FUNCTION admin_login(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid; e elections;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  SELECT * INTO e FROM elections WHERE id = v_id;
  RETURN jsonb_build_object(
    'election_id', e.id, 'code', e.code, 'title', e.title,
    'voter_identity_method', e.voter_identity_method,
    'code_format', e.code_format, 'code_length', e.code_length,
    'code_issue_timing', e.code_issue_timing,
    'verified_mode', e.verified_mode, 'admin_can_see_votes', e.admin_can_see_votes,
    'auto_email_codes', e.auto_email_codes, 'results_published', e.results_published,
    'enable_self_nomination', e.enable_self_nomination, 'results_mode', e.results_mode,
    'is_finalized', e.is_finalized,
    'is_paused', e.is_paused, 'registration_open', e.registration_open,
    'has_password', (e.admin_password_hash IS NOT NULL),
    'vote_message', e.vote_message,
    'nominations_open_at', e.nominations_open_at, 'nominations_close_at', e.nominations_close_at,
    'voting_open_at', e.voting_open_at, 'voting_close_at', e.voting_close_at,
    'phase', _lb_election_phase(e)
  );
END $$;

-- 6.2 list every voter + their code (for manual distribution). Includes selfie
--     path + duplicate-hash flag so the committee can spot abuse.
CREATE OR REPLACE FUNCTION admin_get_voters(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'email', r.email, 'grade', r.grade,
      'batch', r.batch, 'admission_number', r.admission_number,
      'voter_code', r.voter_code, 'code_issued', r.code_issued,
      'status', r.status, 'has_voted', r.has_voted,
      'selfie_path', r.selfie_path,
      'duplicate_selfie', (r.selfie_hash IS NOT NULL AND EXISTS(
          SELECT 1 FROM registrations r2 WHERE r2.election_id = r.election_id
          AND r2.selfie_hash = r.selfie_hash AND r2.id <> r.id)),
      'rejection_reason', r.rejection_reason,
      'created_at', r.created_at)
    ORDER BY r.created_at DESC)
    FROM registrations r WHERE r.election_id = v_id
  ), '[]'::jsonb);
END $$;

-- 6.3 admin override of an individual voter's code
CREATE OR REPLACE FUNCTION admin_set_voter_code(
  p_code text, p_password text, p_registration_id uuid, p_new_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  IF coalesce(trim(p_new_code),'') = '' THEN RAISE EXCEPTION 'Code cannot be empty'; END IF;
  IF EXISTS (SELECT 1 FROM registrations WHERE election_id = v_id
             AND voter_code = p_new_code AND id <> p_registration_id) THEN
    RAISE EXCEPTION 'That code is already in use in this election';
  END IF;
  UPDATE registrations SET voter_code = p_new_code, code_issued = true
    WHERE id = p_registration_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  PERFORM _lb_audit(v_id, 'code_overridden', 'admin',
            jsonb_build_object('registration_id', p_registration_id));
  RETURN jsonb_build_object('ok', true, 'voter_code', p_new_code);
END $$;

-- 6.4 (re)generate a system code for one voter (e.g. resend-a-code)
CREATE OR REPLACE FUNCTION admin_regenerate_code(
  p_code text, p_password text, p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid; e elections; v_new text; v_tries int := 0;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  SELECT * INTO e FROM elections WHERE id = v_id;
  LOOP
    v_new := _lb_gen_code(e.code_format, e.code_length);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations
                          WHERE election_id = v_id AND voter_code = v_new);
    v_tries := v_tries + 1;
    IF v_tries > 50 THEN RAISE EXCEPTION 'Could not allocate code'; END IF;
  END LOOP;
  UPDATE registrations SET voter_code = v_new, code_issued = true
    WHERE id = p_registration_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  PERFORM _lb_audit(v_id, 'code_regenerated', 'admin',
            jsonb_build_object('registration_id', p_registration_id));
  RETURN jsonb_build_object('ok', true, 'voter_code', v_new);
END $$;

-- 6.5 approve a registration. If method=generated_code and timing=at_approval
--     and no code yet, issue one now and return it.
CREATE OR REPLACE FUNCTION admin_approve_registration(
  p_code text, p_password text, p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid; e elections; r registrations%ROWTYPE; v_new text; v_tries int := 0;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  SELECT * INTO e FROM elections WHERE id = v_id;
  SELECT * INTO r FROM registrations WHERE id = p_registration_id AND election_id = v_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;

  IF e.voter_identity_method = 'generated_code'
     AND e.code_issue_timing = 'at_approval'
     AND r.voter_code IS NULL THEN
    LOOP
      v_new := _lb_gen_code(e.code_format, e.code_length);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations
                            WHERE election_id = v_id AND voter_code = v_new);
      v_tries := v_tries + 1;
      IF v_tries > 50 THEN RAISE EXCEPTION 'Could not allocate code'; END IF;
    END LOOP;
    UPDATE registrations
      SET status='approved', code_issued=true, voter_code=v_new, rejection_reason=NULL
      WHERE id = r.id;
  ELSE
    UPDATE registrations
      SET status='approved', rejection_reason=NULL,
          code_issued = (voter_code IS NOT NULL)
      WHERE id = r.id;
  END IF;

  -- re-count any previously pulled votes for this voter
  UPDATE votes SET is_counted = true WHERE registration_id = r.id;

  PERFORM _lb_audit(v_id, 'registration_approved', 'admin',
            jsonb_build_object('registration_id', r.id));
  RETURN jsonb_build_object('ok', true,
           'voter_code', COALESCE(v_new, r.voter_code), 'status','approved');
END $$;

-- 6.6 reject a registration (reason required). Pulls their votes (reversible).
CREATE OR REPLACE FUNCTION admin_reject_registration(
  p_code text, p_password text, p_registration_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  UPDATE registrations SET status='rejected', rejection_reason=p_reason
    WHERE id = p_registration_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  UPDATE votes SET is_counted = false WHERE registration_id = p_registration_id;
  PERFORM _lb_audit(v_id, 'registration_rejected', 'admin',
            jsonb_build_object('registration_id', p_registration_id, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'status','rejected');
END $$;

-- 6.7 approve a self-nominated candidate
CREATE OR REPLACE FUNCTION admin_approve_candidate(
  p_code text, p_password text, p_candidate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE candidates SET status='approved', rejection_reason=NULL
    WHERE id = p_candidate_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  PERFORM _lb_audit(v_id, 'candidate_approved', 'admin',
            jsonb_build_object('candidate_id', p_candidate_id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6.8 reject a self-nominated candidate (reason required)
CREATE OR REPLACE FUNCTION admin_reject_candidate(
  p_code text, p_password text, p_candidate_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'A rejection reason is required'; END IF;
  UPDATE candidates SET status='rejected', rejection_reason=p_reason
    WHERE id = p_candidate_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  PERFORM _lb_audit(v_id, 'candidate_rejected', 'admin',
            jsonb_build_object('candidate_id', p_candidate_id, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6.9 list ALL candidates (incl. pending self-nominations) for committee review
CREATE OR REPLACE FUNCTION admin_get_candidates(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'position_id', c.position_id, 'position_title', p.title,
      'name', c.name, 'bio', c.bio, 'manifesto', c.manifesto,
      'photo_path', c.photo_path, 'source', c.source, 'status', c.status,
      'rejection_reason', c.rejection_reason, 'created_at', c.created_at)
    ORDER BY c.status, p.sort_order, c.name)
    FROM candidates c JOIN positions p ON p.id = c.position_id
    WHERE c.election_id = v_id
  ), '[]'::jsonb);
END $$;

-- 6.10 full admin tally: PROVISIONAL (all votes) vs VERIFIED (approved voters
--     only). If admin_can_see_votes is true, also returns the per-voter ballot
--     mapping; otherwise that field is null (ballot secrecy preserved).
CREATE OR REPLACE FUNCTION admin_get_tally(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid; e elections;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  SELECT * INTO e FROM elections WHERE id = v_id;

  RETURN jsonb_build_object(
    'admin_can_see_votes', e.admin_can_see_votes,
    'turnout', (SELECT count(DISTINCT registration_id) FROM votes WHERE election_id = v_id),
    'positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title,
        'candidates', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', c.id, 'name', c.name,
            'provisional', (SELECT count(*) FROM votes v
                            WHERE v.candidate_id = c.id),
            'verified', (SELECT count(*) FROM votes v
                         JOIN registrations r ON r.id = v.registration_id
                         WHERE v.candidate_id = c.id AND v.is_counted
                           AND r.status = 'approved'))
          ORDER BY c.name)
          FROM candidates c WHERE c.position_id = p.id AND c.status='approved'
        ), '[]'::jsonb))
      ORDER BY p.sort_order, p.title)
      FROM positions p WHERE p.election_id = v_id
    ), '[]'::jsonb),
    -- per-voter ballot mapping ONLY if the admin enabled it
    'ballots', CASE WHEN e.admin_can_see_votes THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'registration_id', r.id, 'voter', r.name,
          'admission_number', r.admission_number, 'voter_code', r.voter_code,
          'choices', (SELECT jsonb_agg(jsonb_build_object(
                        'position_id', v.position_id, 'candidate_id', v.candidate_id,
                        'is_counted', v.is_counted))
                      FROM votes v WHERE v.registration_id = r.id)))
        FROM registrations r
        WHERE r.election_id = v_id AND r.has_voted), '[]'::jsonb)
      ELSE NULL END
  );
END $$;

-- 6.10 list intake responses
CREATE OR REPLACE FUNCTION admin_get_intake(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', i.name, 'email', i.email, 'grade', i.grade,
      'batch', i.batch, 'admission_number', i.admission_number,
      'raw_data', i.raw_data, 'status', i.status, 'created_at', i.created_at)
    ORDER BY i.created_at DESC)
    FROM intake_responses i WHERE i.election_id = v_id
  ), '[]'::jsonb);
END $$;

-- 6.11 convert an intake response into a registration (+ issue code if the
--      election issues codes at approval / at registration)
CREATE OR REPLACE FUNCTION admin_convert_intake(
  p_code text, p_password text, p_intake_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid; e elections; i intake_responses%ROWTYPE;
        v_reg uuid; v_new text; v_tries int := 0; v_issue boolean := false;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  SELECT * INTO e FROM elections WHERE id = v_id;
  SELECT * INTO i FROM intake_responses WHERE id = p_intake_id AND election_id = v_id;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Intake response not found'; END IF;
  IF i.status = 'converted' THEN RAISE EXCEPTION 'Already converted'; END IF;

  IF e.voter_identity_method = 'generated_code' THEN
    v_issue := true;
    LOOP
      v_new := _lb_gen_code(e.code_format, e.code_length);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations
                            WHERE election_id = v_id AND voter_code = v_new);
      v_tries := v_tries + 1;
      IF v_tries > 50 THEN RAISE EXCEPTION 'Could not allocate code'; END IF;
    END LOOP;
  END IF;

  INSERT INTO registrations(election_id, name, email, grade, batch,
                            admission_number, voter_code, code_issued, status)
  VALUES (v_id, i.name, i.email, i.grade, i.batch, i.admission_number,
          v_new, v_issue, 'approved')
  RETURNING id INTO v_reg;

  UPDATE intake_responses SET status='converted', registration_id=v_reg WHERE id = i.id;
  PERFORM _lb_audit(v_id, 'intake_converted', 'admin',
            jsonb_build_object('intake_id', i.id, 'registration_id', v_reg));
  RETURN jsonb_build_object('ok', true, 'registration_id', v_reg, 'voter_code', v_new);
END $$;

-- 6.12 reject an intake response
CREATE OR REPLACE FUNCTION admin_reject_intake(
  p_code text, p_password text, p_intake_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE intake_responses SET status='rejected' WHERE id = p_intake_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intake response not found'; END IF;
  PERFORM _lb_audit(v_id, 'intake_rejected', 'admin', jsonb_build_object('intake_id', p_intake_id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6.13 bulk-import voters from a parsed CSV array (admin paste/upload on client)
--      payload = [{name,email,grade,batch,admission_number}, ...]
--      Issues codes immediately for generated_code elections. Returns the list
--      with assigned codes for distribution.
CREATE OR REPLACE FUNCTION admin_import_voters(
  p_code text, p_password text, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid; e elections; row jsonb; v_new text; v_tries int;
        v_reg uuid; out_rows jsonb := '[]'::jsonb;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  SELECT * INTO e FROM elections WHERE id = v_id;

  FOR row IN SELECT * FROM jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) LOOP
    v_new := NULL;
    IF e.voter_identity_method = 'generated_code' THEN
      v_tries := 0;
      LOOP
        v_new := _lb_gen_code(e.code_format, e.code_length);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations
                              WHERE election_id = v_id AND voter_code = v_new);
        v_tries := v_tries + 1;
        IF v_tries > 50 THEN RAISE EXCEPTION 'Could not allocate code'; END IF;
      END LOOP;
    END IF;
    INSERT INTO registrations(election_id, name, email, grade, batch,
                              admission_number, voter_code, code_issued, status)
    VALUES (v_id, row->>'name', row->>'email', row->>'grade', row->>'batch',
            row->>'admission_number', v_new, (v_new IS NOT NULL), 'approved')
    RETURNING id INTO v_reg;
    out_rows := out_rows || jsonb_build_object(
      'registration_id', v_reg, 'name', row->>'name',
      'email', row->>'email', 'voter_code', v_new);
  END LOOP;

  PERFORM _lb_audit(v_id, 'voters_imported', 'admin',
            jsonb_build_object('count', jsonb_array_length(out_rows)));
  RETURN jsonb_build_object('ok', true, 'imported', out_rows);
END $$;

-- 6.14 toggle a single vote's counted state (manual disqualify / requalify)
CREATE OR REPLACE FUNCTION admin_set_vote_counted(
  p_code text, p_password text, p_vote_id uuid, p_counted boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE votes SET is_counted = p_counted WHERE id = p_vote_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vote not found'; END IF;
  PERFORM _lb_audit(v_id, 'vote_counted_toggled', 'admin',
            jsonb_build_object('vote_id', p_vote_id, 'counted', p_counted));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6.15 publish / unpublish results
CREATE OR REPLACE FUNCTION admin_publish_results(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET results_published = true WHERE id = v_id;
  PERFORM _lb_audit(v_id, 'results_published', 'admin', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION admin_unpublish_results(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET results_published = false WHERE id = v_id;
  PERFORM _lb_audit(v_id, 'results_unpublished', 'admin', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6.16 reset all votes (keeps registrations + codes; voters can vote again)
CREATE OR REPLACE FUNCTION admin_reset_votes(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; n int;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  DELETE FROM votes WHERE election_id = v_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE registrations SET has_voted = false WHERE election_id = v_id;
  PERFORM _lb_audit(v_id, 'votes_reset', 'admin', jsonb_build_object('deleted', n));
  RETURN jsonb_build_object('ok', true, 'deleted', n);
END $$;

-- 6.17 purge photos: returns every stored selfie/candidate path so the client
--      can delete them from Storage, then clears the references.
CREATE OR REPLACE FUNCTION admin_purge_photos(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; v_paths jsonb;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  v_paths := jsonb_build_object(
    'voter_photos', COALESCE((SELECT jsonb_agg(selfie_path) FROM registrations
                              WHERE election_id = v_id AND selfie_path IS NOT NULL), '[]'::jsonb),
    'candidate_photos', COALESCE((SELECT jsonb_agg(photo_path) FROM candidates
                              WHERE election_id = v_id AND photo_path IS NOT NULL), '[]'::jsonb)
  );
  UPDATE registrations SET selfie_path = NULL, selfie_hash = NULL WHERE election_id = v_id;
  UPDATE candidates    SET photo_path  = NULL WHERE election_id = v_id;
  PERFORM _lb_audit(v_id, 'photos_purged', 'admin', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'paths', v_paths);
END $$;

-- 6.18 delete an entire election (cascades). Returns photo paths first so the
--      client can clean Storage.
CREATE OR REPLACE FUNCTION admin_delete_election(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid; v_paths jsonb;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  v_paths := jsonb_build_object(
    'voter_photos', COALESCE((SELECT jsonb_agg(selfie_path) FROM registrations
                              WHERE election_id = v_id AND selfie_path IS NOT NULL), '[]'::jsonb),
    'candidate_photos', COALESCE((SELECT jsonb_agg(photo_path) FROM candidates
                              WHERE election_id = v_id AND photo_path IS NOT NULL), '[]'::jsonb)
  );
  DELETE FROM elections WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'paths', v_paths);
END $$;

-- ============================================================================
-- 6b. FORM BUILDER + RESPONSE MANAGEMENT + FINALIZATION (STEP 3.5 + timeline)
-- ============================================================================

-- 6b.0 the logged-in organiser's own elections (cross-device dashboard)
CREATE OR REPLACE FUNCTION get_my_elections()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid;
BEGIN
  v_uid := _lb_current_uid();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', e.code, 'title', e.title, 'phase', _lb_election_phase(e),
      'is_finalized', e.is_finalized, 'is_paused', e.is_paused,
      'turnout', (SELECT count(*) FROM registrations r WHERE r.election_id = e.id AND r.has_voted),
      'created_at', e.created_at)
    ORDER BY e.created_at DESC)
    FROM elections e WHERE e.owner_id = v_uid), '[]'::jsonb);
END $$;

-- 6b.0b owner-only rich detail for one of my elections (no per-election password)
CREATE OR REPLACE FUNCTION get_my_election(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_uid uuid; e elections;
BEGIN
  v_uid := _lb_current_uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO e FROM elections WHERE code = upper(p_code) AND owner_id = v_uid;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;
  RETURN jsonb_build_object(
    'code', e.code, 'title', e.title, 'description', e.description,
    'phase', _lb_election_phase(e), 'is_finalized', e.is_finalized, 'is_paused', e.is_paused,
    'registration_open', e.registration_open, 'results_mode', e.results_mode,
    'results_published', e.results_published, 'enable_self_nomination', e.enable_self_nomination,
    'has_password', (e.admin_password_hash IS NOT NULL),
    'voter_identity_method', e.voter_identity_method,
    'created_at', e.created_at, 'finalized_at', e.finalized_at,
    'voting_open_at', e.voting_open_at, 'voting_close_at', e.voting_close_at,
    'nominations_open_at', e.nominations_open_at, 'nominations_close_at', e.nominations_close_at,
    'registered', (SELECT count(*) FROM registrations r WHERE r.election_id = e.id),
    'voted',      (SELECT count(*) FROM registrations r WHERE r.election_id = e.id AND r.has_voted),
    'responses',  (SELECT count(*) FROM intake_responses i WHERE i.election_id = e.id),
    'positions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'title', p.title, 'max_winners', p.max_winners,
        'candidates', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'name', c.name,
            'votes', (SELECT count(*) FROM votes v WHERE v.candidate_id = c.id AND v.is_counted))
            ORDER BY (SELECT count(*) FROM votes v WHERE v.candidate_id = c.id AND v.is_counted) DESC, c.name)
          FROM candidates c WHERE c.position_id = p.id AND c.status = 'approved'), '[]'::jsonb))
        ORDER BY p.sort_order, p.title)
      FROM positions p WHERE p.election_id = e.id), '[]'::jsonb)
  );
END $$;

-- 6b.1 public: get the custom form definition (voter + candidate sections)
CREATE OR REPLACE FUNCTION get_form_fields(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE e elections;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'enable_self_nomination', e.enable_self_nomination,
    'fields', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'section', f.section, 'field_key', f.field_key,
        'label', f.label, 'field_type', f.field_type,
        'required', f.required, 'options', f.options, 'sort_order', f.sort_order)
        ORDER BY f.section, f.sort_order, f.label)
      FROM form_fields f WHERE f.election_id = e.id), '[]'::jsonb)
  );
END $$;
-- 6b.2 admin: replace the whole form definition in one call
CREATE OR REPLACE FUNCTION admin_set_form_fields(p_code text, p_password text, p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_n int;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  DELETE FROM form_fields WHERE election_id = v_id;
  INSERT INTO form_fields(election_id, section, field_key, label, field_type, required, options, sort_order)
  SELECT v_id,
         COALESCE(f->>'section','voter'),
         f->>'field_key', f->>'label', f->>'field_type',
         COALESCE((f->>'required')::boolean,false),
         COALESCE(f->'options','[]'::jsonb),
         COALESCE((f->>'sort_order')::int, (row_number() OVER ())::int)
  FROM jsonb_array_elements(COALESCE(p_fields,'[]'::jsonb)) f
  WHERE f->>'field_key' IS NOT NULL AND f->>'label' IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM _lb_audit(v_id, 'form_fields_set', 'admin', jsonb_build_object('count', v_n));
  RETURN jsonb_build_object('ok', true, 'count', v_n);
END $$;

-- 6b.3 public: submit a filled form (+ optional self-nomination)
CREATE OR REPLACE FUNCTION submit_form_response(
  p_code text, p_answers jsonb,
  p_wants_candidacy boolean DEFAULT false, p_candidacy jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE e elections; v_rid uuid;
BEGIN
  SELECT * INTO e FROM elections WHERE code = upper(p_code);
  IF e.id IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;
  IF e.is_finalized OR NOT e.registration_open THEN
    RAISE EXCEPTION 'Registration is closed for this election';
  END IF;

  INSERT INTO intake_responses(election_id, name, email, grade, batch, admission_number,
                               raw_data, wants_candidacy, candidacy)
  VALUES (e.id,
          COALESCE(p_answers->>'name', p_answers->>'full_name'),
          p_answers->>'email',
          p_answers->>'grade',
          p_answers->>'batch',
          COALESCE(p_answers->>'admission_number', p_answers->>'student_id'),
          COALESCE(p_answers,'{}'::jsonb),
          COALESCE(p_wants_candidacy,false) AND e.enable_self_nomination,
          COALESCE(p_candidacy,'{}'::jsonb))
  RETURNING id INTO v_rid;

  PERFORM _lb_audit(e.id, 'form_submitted', 'voter', jsonb_build_object('response_id', v_rid));
  RETURN jsonb_build_object('ok', true, 'response_id', v_rid);
END $$;

-- 6b.4 admin: list responses (+ duplicate flags on email/admission)
CREATE OR REPLACE FUNCTION admin_get_responses(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'email', r.email, 'grade', r.grade,
      'batch', r.batch, 'admission_number', r.admission_number,
      'answers', r.raw_data, 'wants_candidacy', r.wants_candidacy,
      'candidacy', r.candidacy, 'status', r.status,
      'registration_id', r.registration_id, 'created_at', r.created_at,
      'dup_email', (r.email IS NOT NULL AND (SELECT count(*) FROM intake_responses x
                     WHERE x.election_id = v_id AND x.email = r.email) > 1),
      'dup_admission', (r.admission_number IS NOT NULL AND (SELECT count(*) FROM intake_responses x
                     WHERE x.election_id = v_id AND x.admission_number = r.admission_number) > 1))
      ORDER BY r.created_at DESC)
    FROM intake_responses r WHERE r.election_id = v_id), '[]'::jsonb);
END $$;

-- 6b.5 admin: edit a response's details before generating a code
CREATE OR REPLACE FUNCTION admin_update_response(
  p_code text, p_password text, p_id uuid,
  p_answers jsonb DEFAULT NULL, p_wants_candidacy boolean DEFAULT NULL, p_candidacy jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE intake_responses SET
    raw_data = COALESCE(p_answers, raw_data),
    name = COALESCE(p_answers->>'name', p_answers->>'full_name', name),
    email = COALESCE(p_answers->>'email', email),
    grade = COALESCE(p_answers->>'grade', grade),
    batch = COALESCE(p_answers->>'batch', batch),
    admission_number = COALESCE(p_answers->>'admission_number', p_answers->>'student_id', admission_number),
    wants_candidacy = COALESCE(p_wants_candidacy, wants_candidacy),
    candidacy = COALESCE(p_candidacy, candidacy)
  WHERE id = p_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6b.6 admin: delete a response
CREATE OR REPLACE FUNCTION admin_delete_response(p_code text, p_password text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  DELETE FROM intake_responses WHERE id = p_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Response not found'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6b.7 admin: approve responses in bulk -> create registrations + issue codes,
--      and (if they opted in) create PENDING candidate rows per chosen position.
CREATE OR REPLACE FUNCTION admin_generate_codes(p_code text, p_password text, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid; e elections; r intake_responses%ROWTYPE;
  v_new text; v_tries int; v_reg uuid; v_pos jsonb; v_out jsonb := '[]'::jsonb;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  SELECT * INTO e FROM elections WHERE id = v_id;

  FOR r IN SELECT * FROM intake_responses
           WHERE election_id = v_id AND id = ANY(p_ids) AND status = 'pending' LOOP
    -- allocate a unique code for this election
    v_tries := 0;
    LOOP
      v_new := _lb_gen_code(e.code_format, e.code_length);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations
                            WHERE election_id = v_id AND voter_code = v_new);
      v_tries := v_tries + 1;
      IF v_tries > 50 THEN RAISE EXCEPTION 'Could not allocate code'; END IF;
    END LOOP;

    INSERT INTO registrations(election_id, name, email, grade, batch, admission_number,
                              raw_data, voter_code, code_issued, status)
    VALUES (v_id, r.name, r.email, r.grade, r.batch, r.admission_number,
            r.raw_data, v_new, true, 'approved')
    RETURNING id INTO v_reg;

    UPDATE intake_responses SET status='converted', registration_id=v_reg WHERE id = r.id;

    -- self-nomination: one pending candidate row per chosen position
    IF r.wants_candidacy THEN
      FOR v_pos IN SELECT * FROM jsonb_array_elements(COALESCE(r.candidacy->'position_ids','[]'::jsonb)) LOOP
        INSERT INTO candidates(election_id, position_id, name, photo_path, bio, manifesto,
                               source, status, registration_id)
        SELECT v_id, (v_pos #>> '{}')::uuid, r.name,
               r.candidacy->>'photo_path', r.candidacy->>'experience',
               r.candidacy->>'statement', 'self_nominated', 'pending', v_reg
        WHERE EXISTS (SELECT 1 FROM positions WHERE id = (v_pos #>> '{}')::uuid AND election_id = v_id);
      END LOOP;
    END IF;

    v_out := v_out || jsonb_build_object('response_id', r.id, 'registration_id', v_reg,
                        'name', r.name, 'email', r.email, 'voter_code', v_new);
  END LOOP;

  PERFORM _lb_audit(v_id, 'codes_generated', 'admin',
            jsonb_build_object('count', jsonb_array_length(v_out)));
  RETURN jsonb_build_object('ok', true, 'issued', v_out);
END $$;

-- 6b.8 admin: finalize / unfinalize (the gate that lets voting open)
CREATE OR REPLACE FUNCTION admin_finalize_election(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET is_finalized = true, finalized_at = now() WHERE id = v_id;
  PERFORM _lb_audit(v_id, 'election_finalized', 'admin', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'is_finalized', true);
END $$;

CREATE OR REPLACE FUNCTION admin_unfinalize_election(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET is_finalized = false, finalized_at = NULL WHERE id = v_id;
  PERFORM _lb_audit(v_id, 'election_unfinalized', 'admin', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'is_finalized', false);
END $$;

-- 6b.9 admin: set results visibility mode
CREATE OR REPLACE FUNCTION admin_set_results_mode(p_code text, p_password text, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  IF p_mode NOT IN ('hidden','live','admin_only') THEN RAISE EXCEPTION 'Bad results mode'; END IF;
  UPDATE elections SET results_mode = p_mode WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'results_mode', p_mode);
END $$;

-- 6b.10 pause / resume voting (temporary halt without closing)
CREATE OR REPLACE FUNCTION admin_set_paused(p_code text, p_password text, p_paused boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET is_paused = COALESCE(p_paused,false) WHERE id = v_id;
  PERFORM _lb_audit(v_id, CASE WHEN p_paused THEN 'election_paused' ELSE 'election_resumed' END, 'admin', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'is_paused', COALESCE(p_paused,false));
END $$;

-- 6b.11 open / close the registration form
CREATE OR REPLACE FUNCTION admin_set_registration_open(p_code text, p_password text, p_open boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET registration_open = COALESCE(p_open,true) WHERE id = v_id;
  PERFORM _lb_audit(v_id, 'registration_toggled', 'admin', jsonb_build_object('open', COALESCE(p_open,true)));
  RETURN jsonb_build_object('ok', true, 'registration_open', COALESCE(p_open,true));
END $$;

-- 6b.12 toggle candidate self-nomination on the form (one form does both)
CREATE OR REPLACE FUNCTION admin_set_self_nomination(p_code text, p_password text, p_enable boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET enable_self_nomination = COALESCE(p_enable,false) WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'enable_self_nomination', COALESCE(p_enable,false));
END $$;

-- 6b.13 set / change / remove the optional sharing password for an election.
--       Owner (logged in) can always do this; a delegate may use the current pw.
--       Pass an empty new password to remove it (owner-only access afterwards).
CREATE OR REPLACE FUNCTION admin_set_password(p_code text, p_password text, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET admin_password_hash =
    CASE WHEN COALESCE(btrim(p_new_password),'') = '' THEN NULL
         ELSE crypt(p_new_password, gen_salt('bf')) END
  WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'has_password', COALESCE(btrim(p_new_password),'') <> '');
END $$;

-- 6b.14 set the custom message a voter sees right after casting their vote
CREATE OR REPLACE FUNCTION admin_set_vote_message(p_code text, p_password text, p_message text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE elections SET vote_message = NULLIF(btrim(p_message), '') WHERE id = v_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6b.15 activity log for an election (admin actions, newest first)
CREATE OR REPLACE FUNCTION admin_get_activity(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'action', a.action, 'actor', a.actor, 'metadata', a.metadata, 'at', a.created_at)
      ORDER BY a.created_at DESC)
    FROM audit_log a WHERE a.election_id = v_id), '[]'::jsonb);
END $$;

-- ============================================================================
-- 6c. BALLOT SETUP — manage positions & candidates ANY time after creation,
--     so an organiser can start with just a form and build the vote later.
-- ============================================================================

-- 6c.1 the full ballot for the admin (every position + candidates of any status)
CREATE OR REPLACE FUNCTION admin_get_ballot(p_code text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'max_winners', p.max_winners, 'sort_order', p.sort_order,
      'candidates', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'bio', c.bio, 'status', c.status, 'source', c.source)
          ORDER BY c.name)
        FROM candidates c WHERE c.position_id = p.id), '[]'::jsonb))
      ORDER BY p.sort_order, p.title)
    FROM positions p WHERE p.election_id = v_id), '[]'::jsonb);
END $$;

-- 6c.2 add a position
CREATE OR REPLACE FUNCTION admin_add_position(p_code text, p_password text, p_title text, p_max_winners integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_new uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  IF COALESCE(btrim(p_title),'') = '' THEN RAISE EXCEPTION 'Position title is required'; END IF;
  INSERT INTO positions(election_id, title, max_winners, sort_order)
  VALUES (v_id, btrim(p_title), GREATEST(COALESCE(p_max_winners,1),1),
          (SELECT COALESCE(max(sort_order)+1,0) FROM positions WHERE election_id = v_id))
  RETURNING id INTO v_new;
  PERFORM _lb_audit(v_id, 'position_added', 'admin', jsonb_build_object('title', p_title));
  RETURN jsonb_build_object('ok', true, 'id', v_new);
END $$;

-- 6c.3 update a position
CREATE OR REPLACE FUNCTION admin_update_position(p_code text, p_password text, p_position_id uuid, p_title text, p_max_winners integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  UPDATE positions SET title = COALESCE(NULLIF(btrim(p_title),''), title),
                       max_winners = GREATEST(COALESCE(p_max_winners,max_winners),1)
  WHERE id = p_position_id AND election_id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Position not found'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6c.4 delete a position (and its candidates/votes, by cascade)
CREATE OR REPLACE FUNCTION admin_delete_position(p_code text, p_password text, p_position_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  DELETE FROM positions WHERE id = p_position_id AND election_id = v_id;
  PERFORM _lb_audit(v_id, 'position_deleted', 'admin', jsonb_build_object('position_id', p_position_id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 6c.5 add a candidate to a position (admin-entered, approved immediately)
CREATE OR REPLACE FUNCTION admin_add_candidate(p_code text, p_password text, p_position_id uuid, p_name text, p_bio text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_new uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  IF NOT EXISTS (SELECT 1 FROM positions WHERE id = p_position_id AND election_id = v_id) THEN
    RAISE EXCEPTION 'Position not found';
  END IF;
  IF COALESCE(btrim(p_name),'') = '' THEN RAISE EXCEPTION 'Candidate name is required'; END IF;
  INSERT INTO candidates(election_id, position_id, name, bio, source, status)
  VALUES (v_id, p_position_id, btrim(p_name), NULLIF(btrim(p_bio),''), 'admin_added', 'approved')
  RETURNING id INTO v_new;
  PERFORM _lb_audit(v_id, 'candidate_added', 'admin', jsonb_build_object('name', p_name));
  RETURN jsonb_build_object('ok', true, 'id', v_new);
END $$;

-- 6c.6 delete a candidate
CREATE OR REPLACE FUNCTION admin_delete_candidate(p_code text, p_password text, p_candidate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid;
BEGIN
  v_id := _lb_verify_admin(p_code, p_password);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Invalid code or password'; END IF;
  DELETE FROM candidates WHERE id = p_candidate_id AND election_id = v_id;
  PERFORM _lb_audit(v_id, 'candidate_deleted', 'admin', jsonb_build_object('candidate_id', p_candidate_id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================================
-- 7. GRANTS — clients may EXECUTE the public-facing RPCs only. No table grants.
--    Internal helpers (_lb_*) are NOT granted, so anon/authenticated can't call
--    them directly.
-- ============================================================================
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Revoke client access to the internal helpers explicitly.
REVOKE ALL ON FUNCTION
  _lb_gen_code(text,integer),
  _lb_verify_admin(text,text),
  _lb_audit(uuid,text,text,jsonb),
  _lb_election_phase(elections),
  lb_now()
FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE on all client-facing RPCs (public + admin). Admin functions
-- are safe to expose because each verifies the bcrypt password internally.
GRANT EXECUTE ON FUNCTION
  create_election(text,text,text,text,integer,integer,text,integer,text,boolean,boolean,boolean,boolean,text,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb),
  get_election_public(text),
  get_turnout(text),
  get_my_elections(),
  get_my_election(text),
  get_form_fields(text),
  register_voter(text,text,text,text,text,text,text,text),
  self_nominate(text,uuid,text,text,text,text,uuid),
  submit_intake(text,jsonb),
  submit_form_response(text,jsonb,boolean,jsonb),
  cast_vote(text,text,jsonb),
  get_results(text),
  admin_login(text,text),
  admin_get_voters(text,text),
  admin_set_voter_code(text,text,uuid,text),
  admin_regenerate_code(text,text,uuid),
  admin_approve_registration(text,text,uuid),
  admin_reject_registration(text,text,uuid,text),
  admin_approve_candidate(text,text,uuid),
  admin_reject_candidate(text,text,uuid,text),
  admin_get_candidates(text,text),
  admin_get_tally(text,text),
  admin_get_intake(text,text),
  admin_convert_intake(text,text,uuid),
  admin_reject_intake(text,text,uuid),
  admin_import_voters(text,text,jsonb),
  admin_set_vote_counted(text,text,uuid,boolean),
  admin_publish_results(text,text),
  admin_unpublish_results(text,text),
  admin_reset_votes(text,text),
  admin_purge_photos(text,text),
  admin_delete_election(text,text),
  admin_set_form_fields(text,text,jsonb),
  admin_get_responses(text,text),
  admin_update_response(text,text,uuid,jsonb,boolean,jsonb),
  admin_delete_response(text,text,uuid),
  admin_generate_codes(text,text,uuid[]),
  admin_finalize_election(text,text),
  admin_unfinalize_election(text,text),
  admin_set_results_mode(text,text,text),
  admin_set_paused(text,text,boolean),
  admin_set_registration_open(text,text,boolean),
  admin_set_self_nomination(text,text,boolean),
  admin_set_password(text,text,text),
  admin_set_vote_message(text,text,text),
  admin_get_activity(text,text),
  admin_get_ballot(text,text),
  admin_add_position(text,text,text,integer),
  admin_update_position(text,text,uuid,text,integer),
  admin_delete_position(text,text,uuid),
  admin_add_candidate(text,text,uuid,text,text),
  admin_delete_candidate(text,text,uuid)
TO anon, authenticated;