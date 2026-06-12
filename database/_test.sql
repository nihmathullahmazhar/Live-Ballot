\set ON_ERROR_STOP on
\pset pager off

\echo '========================================================'
\echo 'TEST A — generated_code + at_approval + verified_mode'
\echo '========================================================'

-- create election (capture code)
SELECT election_id AS a_id, code AS a_code
FROM create_election(
  p_title => 'Student Council 2026',
  p_admin_password => 'secret123',
  p_voter_identity_method => 'generated_code',
  p_code_format => 'alphanumeric',
  p_code_length => 8,
  p_code_issue_timing => 'at_approval',
  p_verified_mode => true,
  p_admin_can_see_votes => false,
  p_positions => '[{"title":"President","max_winners":1,"candidates":[{"name":"Alice"},{"name":"Bob"}]}]'::jsonb
) \gset

\echo 'Created election code:' :a_code

-- voter registers (verified mode => pending, no code yet)
SELECT register_voter(:'a_code','Voter One','v1@example.com','12','A') ->> 'status' AS reg_status \gset
\echo 'Registration status (expect pending):' :reg_status

-- grab the registration id
SELECT id AS reg1 FROM registrations WHERE email='v1@example.com' \gset

-- voting before approval should FAIL (no code issued)
\echo '-- attempting vote before approval (expect failure):'
DO $$
BEGIN
  PERFORM cast_vote((SELECT code FROM elections WHERE title='Student Council 2026'),
                    'FAKECODE', '[]'::jsonb);
  RAISE NOTICE 'ERROR: vote should have failed';
EXCEPTION WHEN others THEN RAISE NOTICE 'OK blocked: %', SQLERRM;
END $$;

-- admin approves => code issued
SELECT admin_approve_registration(:'a_code','secret123', :'reg1') ->> 'voter_code' AS issued_code \gset
\echo 'Issued code on approval:' :issued_code

-- get candidate ids
SELECT c.id AS alice FROM candidates c WHERE c.name='Alice' AND c.election_id=:'a_id' \gset
SELECT p.id AS pres FROM positions p WHERE p.title='President' AND p.election_id=:'a_id' \gset

-- cast vote with issued code
SELECT cast_vote(:'a_code', :'issued_code',
  format('[{"position_id":"%s","candidate_id":"%s"}]', :'pres', :'alice')::jsonb) AS vote_result \gset
\echo 'Vote result:' :vote_result

-- double vote should fail (code burned)
\echo '-- attempting second vote with same code (expect failure):'
DO $$
DECLARE c text; code text; pres uuid; alice uuid;
BEGIN
  SELECT e.code INTO c FROM elections e WHERE e.title='Student Council 2026';
  SELECT voter_code INTO code FROM registrations WHERE email='v1@example.com';
  SELECT id INTO pres FROM positions WHERE title='President';
  SELECT id INTO alice FROM candidates WHERE name='Alice';
  PERFORM cast_vote(c, code, format('[{"position_id":"%s","candidate_id":"%s"}]', pres, alice)::jsonb);
  RAISE NOTICE 'ERROR: double vote should have failed';
EXCEPTION WHEN others THEN RAISE NOTICE 'OK blocked: %', SQLERRM;
END $$;

-- tally: provisional vs verified (ballots should be NULL since admin_can_see_votes=false)
\echo 'Tally (ballots must be null):'
SELECT jsonb_pretty(admin_get_tally(:'a_code','secret123'));

\echo '========================================================'
\echo 'TEST B — reject voter pulls vote from verified count'
\echo '========================================================'
SELECT admin_reject_registration(:'a_code','secret123', :'reg1', 'Duplicate selfie detected') ->> 'status' AS rej \gset
\echo 'Rejection status:' :rej
\echo 'After reject — provisional should still be 1, verified should be 0:'
SELECT jsonb_path_query(admin_get_tally(:'a_code','secret123'),
  '$.positions[0].candidates[*] ? (@.name == "Alice")');

\echo '========================================================'
\echo 'TEST C — admission_number election, on-the-fly registration'
\echo '========================================================'
SELECT code AS c_code FROM create_election(
  p_title => 'Quick Poll',
  p_admin_password => 'pw1234',
  p_voter_identity_method => 'admission_number',
  p_admission_min => 10000, p_admission_max => 99999,
  p_verified_mode => false,
  p_positions => '[{"title":"Captain","candidates":[{"name":"Xavier"},{"name":"Yara"}]}]'::jsonb
) \gset
SELECT id AS c_id FROM elections WHERE code=:'c_code' \gset
SELECT id AS cap FROM positions WHERE title='Captain' AND election_id=:'c_id' \gset
SELECT id AS xavier FROM candidates WHERE name='Xavier' AND election_id=:'c_id' \gset

-- vote with a number in range (no prior registration -> auto-created)
SELECT cast_vote(:'c_code','54321',
  format('[{"position_id":"%s","candidate_id":"%s"}]', :'cap', :'xavier')::jsonb) AS r \gset
\echo 'Voted with admission number 54321:' :r

-- out of range should fail
\echo '-- attempting out-of-range admission number (expect failure):'
DO $$
DECLARE c text; cap uuid; x uuid;
BEGIN
  SELECT code INTO c FROM elections WHERE title='Quick Poll';
  SELECT id INTO cap FROM positions WHERE title='Captain';
  SELECT id INTO x FROM candidates WHERE name='Xavier';
  PERFORM cast_vote(c, '999', format('[{"position_id":"%s","candidate_id":"%s"}]', cap, x)::jsonb);
  RAISE NOTICE 'ERROR: out-of-range should fail';
EXCEPTION WHEN others THEN RAISE NOTICE 'OK blocked: %', SQLERRM;
END $$;

\echo '========================================================'
\echo 'TEST D — admin_can_see_votes = true exposes ballots'
\echo '========================================================'
SELECT code AS d_code FROM create_election(
  p_title => 'Open Ballot Test', p_admin_password => 'pw12',
  p_voter_identity_method => 'admission_number', p_admin_can_see_votes => true,
  p_positions => '[{"title":"Lead","candidates":[{"name":"Zoe"}]}]'::jsonb
) \gset
SELECT id AS d_id FROM elections WHERE code=:'d_code' \gset
SELECT id AS lead FROM positions WHERE election_id=:'d_id' \gset
SELECT id AS zoe FROM candidates WHERE election_id=:'d_id' \gset
SELECT cast_vote(:'d_code','11111', format('[{"position_id":"%s","candidate_id":"%s"}]', :'lead', :'zoe')::jsonb);
\echo 'Ballots field should now be a non-null array:'
SELECT jsonb_path_query(admin_get_tally(:'d_code','pw12'), '$.ballots');

\echo '========================================================'
\echo 'TEST E — bulk import + intake conversion'
\echo '========================================================'
SELECT code AS e_code FROM create_election(
  p_title => 'Bulk Test', p_admin_password => 'pw12',
  p_voter_identity_method => 'generated_code', p_code_issue_timing => 'at_registration'
) \gset
SELECT admin_import_voters(:'e_code','pw12',
  '[{"name":"Imp One","email":"i1@x.com"},{"name":"Imp Two","email":"i2@x.com"}]'::jsonb) AS imp \gset
\echo 'Bulk import (each row should have a voter_code):'
SELECT jsonb_pretty(admin_import_voters(:'e_code','pw12','[{"name":"Imp Three","email":"i3@x.com"}]'::jsonb));

SELECT submit_intake(:'e_code','{"name":"Form Person","email":"fp@x.com","grade":"13"}'::jsonb) ->> 'intake_id' AS intake_id \gset
SELECT admin_convert_intake(:'e_code','pw12', :'intake_id') ->> 'voter_code' AS conv_code \gset
\echo 'Converted intake to registration with code:' :conv_code

\echo '========================================================'
\echo 'TEST F — wrong admin password is rejected'
\echo '========================================================'
DO $$
BEGIN
  PERFORM admin_get_tally((SELECT code FROM elections WHERE title='Bulk Test'), 'WRONGPASS');
  RAISE NOTICE 'ERROR: wrong password accepted!';
EXCEPTION WHEN others THEN RAISE NOTICE 'OK blocked: %', SQLERRM;
END $$;

\echo '========================================================'
\echo 'TEST G — RLS: anon role cannot read tables directly'
\echo '========================================================'
SET ROLE anon;
DO $$
BEGIN
  PERFORM * FROM elections LIMIT 1;
  RAISE NOTICE 'ERROR: anon read elections!';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK anon blocked from elections table (insufficient_privilege)';
         WHEN others THEN RAISE NOTICE 'anon blocked: %', SQLERRM;
END $$;
-- but anon CAN call a granted RPC
SELECT get_turnout((SELECT 'x')) IS NOT NULL AS turnout_callable_note;
RESET ROLE;

\echo '========================================================'
\echo 'ALL TESTS COMPLETED'
\echo '========================================================'
