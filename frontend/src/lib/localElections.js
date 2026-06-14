// Tracks elections created/opened on THIS device so the admin can manage
// several at once without accounts yet. When Firebase auth lands, this is
// replaced by a server-side owner lookup. We never store the admin password.
const KEY = 'lb_elections'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function write(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)) } catch { /* ignore */ }
}

export function listLocalElections() {
  return read().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

export function rememberElection(code, title) {
  if (!code) return
  const arr = read().filter((e) => e.code !== code)
  arr.push({ code, title: title || code, createdAt: Date.now() })
  write(arr)
}

export function forgetElection(code) {
  write(read().filter((e) => e.code !== code))
}

/* ---- organiser profile (device-local "account" until Firebase auth) ---- */
const PROFILE_KEY = 'lb_profile'

export function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, createdAt: Date.now() }))
  } catch { /* ignore */ }
}

export function clearProfile() {
  try { localStorage.removeItem(PROFILE_KEY) } catch { /* ignore */ }
}