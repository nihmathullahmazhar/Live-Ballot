import { supabase } from './supabase'

// Thin wrapper so every call has consistent error handling. Each function maps
// 1:1 to a SECURITY DEFINER RPC in schema_complete.sql.
async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message || 'Request failed')
  return data
}

/* ----------------------------- PUBLIC ----------------------------- */

export const createElection = (payload) =>
  rpc('create_election', payload)

export const getElectionPublic = (code) =>
  rpc('get_election_public', { p_code: code })

export const getTurnout = (code) =>
  rpc('get_turnout', { p_code: code })

export const getMyElections = () =>
  rpc('get_my_elections', {})

export const getMyElection = (code) =>
  rpc('get_my_election', { p_code: code })

export const registerVoter = (args) =>
  rpc('register_voter', args)

export const selfNominate = (args) =>
  rpc('self_nominate', args)

export const submitIntake = (code, payload) =>
  rpc('submit_intake', { p_code: code, p_payload: payload })

export const castVote = (code, identity, votes) =>
  rpc('cast_vote', { p_code: code, p_identity: identity, p_votes: votes })

export const getResults = (code) =>
  rpc('get_results', { p_code: code })

/* ----------------------------- ADMIN ------------------------------ */
// Every admin call passes the election code + password; the DB verifies bcrypt.

export const adminLogin = (code, password) =>
  rpc('admin_login', { p_code: code, p_password: password })

export const adminSetPassword = (code, password, newPassword) =>
  rpc('admin_set_password', { p_code: code, p_password: password, p_new_password: newPassword })

export const adminGetVoters = (code, password) =>
  rpc('admin_get_voters', { p_code: code, p_password: password })

export const adminGetTally = (code, password) =>
  rpc('admin_get_tally', { p_code: code, p_password: password })

export const adminSetVoterCode = (code, password, registrationId, newCode) =>
  rpc('admin_set_voter_code', {
    p_code: code, p_password: password,
    p_registration_id: registrationId, p_new_code: newCode,
  })

export const adminRegenerateCode = (code, password, registrationId) =>
  rpc('admin_regenerate_code', {
    p_code: code, p_password: password, p_registration_id: registrationId,
  })

export const adminApproveRegistration = (code, password, registrationId) =>
  rpc('admin_approve_registration', {
    p_code: code, p_password: password, p_registration_id: registrationId,
  })

export const adminRejectRegistration = (code, password, registrationId, reason) =>
  rpc('admin_reject_registration', {
    p_code: code, p_password: password,
    p_registration_id: registrationId, p_reason: reason,
  })

export const adminApproveCandidate = (code, password, candidateId) =>
  rpc('admin_approve_candidate', {
    p_code: code, p_password: password, p_candidate_id: candidateId,
  })

export const adminRejectCandidate = (code, password, candidateId, reason) =>
  rpc('admin_reject_candidate', {
    p_code: code, p_password: password, p_candidate_id: candidateId, p_reason: reason,
  })

export const adminGetIntake = (code, password) =>
  rpc('admin_get_intake', { p_code: code, p_password: password })

export const adminGetCandidates = (code, password) =>
  rpc('admin_get_candidates', { p_code: code, p_password: password })

/* ------------------- FORM BUILDER + TIMELINE (STEP 3.5) ------------------- */

export const getFormFields = (code) =>
  rpc('get_form_fields', { p_code: code })

export const adminSetFormFields = (code, password, fields) =>
  rpc('admin_set_form_fields', { p_code: code, p_password: password, p_fields: fields })

export const submitFormResponse = (code, answers, wantsCandidacy, candidacy) =>
  rpc('submit_form_response', {
    p_code: code, p_answers: answers,
    p_wants_candidacy: wantsCandidacy, p_candidacy: candidacy,
  })

export const adminGetResponses = (code, password) =>
  rpc('admin_get_responses', { p_code: code, p_password: password })

export const adminUpdateResponse = (code, password, id, answers, wantsCandidacy, candidacy) =>
  rpc('admin_update_response', {
    p_code: code, p_password: password, p_id: id,
    p_answers: answers, p_wants_candidacy: wantsCandidacy, p_candidacy: candidacy,
  })

export const adminDeleteResponse = (code, password, id) =>
  rpc('admin_delete_response', { p_code: code, p_password: password, p_id: id })

export const adminGenerateCodes = (code, password, ids) =>
  rpc('admin_generate_codes', { p_code: code, p_password: password, p_ids: ids })

export const adminFinalizeElection = (code, password) =>
  rpc('admin_finalize_election', { p_code: code, p_password: password })

export const adminUnfinalizeElection = (code, password) =>
  rpc('admin_unfinalize_election', { p_code: code, p_password: password })

export const adminSetResultsMode = (code, password, mode) =>
  rpc('admin_set_results_mode', { p_code: code, p_password: password, p_mode: mode })

export const adminSetPaused = (code, password, paused) =>
  rpc('admin_set_paused', { p_code: code, p_password: password, p_paused: paused })

export const adminSetRegistrationOpen = (code, password, open) =>
  rpc('admin_set_registration_open', { p_code: code, p_password: password, p_open: open })

export const adminSetSelfNomination = (code, password, enable) =>
  rpc('admin_set_self_nomination', { p_code: code, p_password: password, p_enable: enable })

export const adminSetVoteMessage = (code, password, message) =>
  rpc('admin_set_vote_message', { p_code: code, p_password: password, p_message: message })

export const adminGetActivity = (code, password) =>
  rpc('admin_get_activity', { p_code: code, p_password: password })

// ---- ballot setup: positions & candidates, any time after creation ----
export const adminGetBallot = (code, password) =>
  rpc('admin_get_ballot', { p_code: code, p_password: password })

export const adminAddPosition = (code, password, title, maxWinners) =>
  rpc('admin_add_position', { p_code: code, p_password: password, p_title: title, p_max_winners: maxWinners })

export const adminReorderPositions = (code, password, orderedIds) =>
  rpc('admin_reorder_positions', { p_code: code, p_password: password, p_ordered_ids: orderedIds })

export const adminUpdatePosition = (code, password, positionId, title, maxWinners) =>
  rpc('admin_update_position', { p_code: code, p_password: password, p_position_id: positionId, p_title: title, p_max_winners: maxWinners })

export const adminDeletePosition = (code, password, positionId) =>
  rpc('admin_delete_position', { p_code: code, p_password: password, p_position_id: positionId })

export const adminAddCandidate = (code, password, positionId, name, bio) =>
  rpc('admin_add_candidate', { p_code: code, p_password: password, p_position_id: positionId, p_name: name, p_bio: bio })

export const adminDeleteCandidate = (code, password, candidateId) =>
  rpc('admin_delete_candidate', { p_code: code, p_password: password, p_candidate_id: candidateId })

export const adminConvertIntake = (code, password, intakeId) =>
  rpc('admin_convert_intake', {
    p_code: code, p_password: password, p_intake_id: intakeId,
  })

export const adminRejectIntake = (code, password, intakeId) =>
  rpc('admin_reject_intake', {
    p_code: code, p_password: password, p_intake_id: intakeId,
  })

export const adminImportVoters = (code, password, rows) =>
  rpc('admin_import_voters', { p_code: code, p_password: password, p_rows: rows })

export const adminSetVoteCounted = (code, password, voteId, counted) =>
  rpc('admin_set_vote_counted', {
    p_code: code, p_password: password, p_vote_id: voteId, p_counted: counted,
  })

export const adminPublishResults = (code, password) =>
  rpc('admin_publish_results', { p_code: code, p_password: password })

export const adminUnpublishResults = (code, password) =>
  rpc('admin_unpublish_results', { p_code: code, p_password: password })

export const adminResetVotes = (code, password) =>
  rpc('admin_reset_votes', { p_code: code, p_password: password })

export const adminPurgePhotos = (code, password) =>
  rpc('admin_purge_photos', { p_code: code, p_password: password })

export const adminDeleteElection = (code, password) =>
  rpc('admin_delete_election', { p_code: code, p_password: password })

/* ---------------------------- STORAGE ----------------------------- */
// Selfies/candidate photos go to PRIVATE buckets. We store only the path + a
// sha256 hash (for the duplicate-selfie flag). Committee views via signed URLs.

export async function uploadPhoto(bucket, code, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const path = `${code}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600', upsert: false,
  })
  if (error) throw new Error(error.message)
  const hash = await sha256(file)
  return { path, hash }
}

export async function signedUrl(bucket, path, seconds = 120) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds)
  if (error) return null
  return data?.signedUrl || null
}

async function sha256(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ---------------------- BATCH 1 ADDITIONS --------------------------- */
export const adminSetMaxNomineePositions = (code, password, max) =>
  rpc('admin_set_max_nominee_positions', { p_code: code, p_password: password, p_max: max })

export const adminSetCodeFormat = (code, password, format, length) =>
  rpc('admin_set_code_format', { p_code: code, p_password: password, p_format: format, p_length: length })

export const adminSetWhatsappTemplate = (code, password, template) =>
  rpc('admin_set_whatsapp_template', { p_code: code, p_password: password, p_template: template })

export const adminSetWindows = (code, password, opts = {}) =>
  rpc('admin_set_windows', {
    p_code: code, p_password: password,
    p_nominations_open_at:  opts.nominations_open_at  ?? null,
    p_nominations_close_at: opts.nominations_close_at ?? null,
    p_voting_open_at:       opts.voting_open_at       ?? null,
    p_voting_close_at:      opts.voting_close_at      ?? null,
    p_clear_nominations:    opts.clear_nominations    ?? false,
    p_clear_voting:         opts.clear_voting         ?? false,
  })

export const adminGetSyncToken = (code, password) =>
  rpc('admin_get_sync_token', { p_code: code, p_password: password })

export const adminRotateSyncToken = (code, password) =>
  rpc('admin_rotate_sync_token', { p_code: code, p_password: password })

export const adminBulkImportVoters = (code, password, rows, generateCodes = true) =>
  rpc('admin_bulk_import_voters', { p_code: code, p_password: password, p_rows: rows, p_generate_codes: generateCodes })

export const adminPromoteToCandidate = (code, password, responseId, positionId) =>
  rpc('admin_promote_to_candidate', { p_code: code, p_password: password, p_response_id: responseId, p_position_id: positionId })

export const adminLogSession = (code, password, actorName) =>
  rpc('admin_log_session', { p_code: code, p_password: password, p_actor_name: actorName })

// Subscribe to realtime changes for a given election table.
// onChange runs on any insert/update/delete. Returns an unsubscribe fn.
export function subscribeElection(table, electionId, onChange) {
  if (!electionId) return () => {}
  const channel = supabase
    .channel(`rt-${table}-${electionId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `election_id=eq.${electionId}` },
        () => onChange())
    .subscribe()
  return () => { try { supabase.removeChannel(channel) } catch (_) {} }
}

// Resolve a path in a storage bucket to a viewable URL.
// Tries public URL first (works if the bucket is set Public in Supabase Storage).
// Falls back to a 1-hour signed URL if not.
export async function imageUrl(bucket, path) {
  if (!path) return null
  // try public URL
  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    if (data?.publicUrl) {
      // verify it actually loads (private buckets return 400 on the URL)
      const ok = await fetch(data.publicUrl, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)
      if (ok) return data.publicUrl
    }
  } catch (_) {}
  // fall back to signed URL
  return signedUrl(bucket, path, 3600)
}