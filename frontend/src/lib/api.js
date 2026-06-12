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
