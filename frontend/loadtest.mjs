// Live Ballot — HTTP load test against your real Supabase project.
// It creates a throwaway election, fires N concurrent votes over HTTPS,
// verifies the tally, and deletes the test election. Nothing else is touched.
//
// USAGE (from the live-ballot folder, Node 18+):
//   export SUPABASE_URL="https://YOURPROJECT.supabase.co"
//   export SUPABASE_ANON_KEY="eyJhbGciOi...your anon key..."
//   node tools/loadtest.mjs                 # defaults: 500 voters, 50 at a time
//   TOTAL=2000 CONCURRENCY=100 node tools/loadtest.mjs
//
// The anon key is the same public key your website uses — safe to paste here.

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_ANON_KEY
const TOTAL = parseInt(process.env.TOTAL || '500', 10)
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '50', 10)

if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY first. See the comment at the top.')
  process.exit(1)
}

async function rpc(fn, params) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text.slice(0, 200)}`)
  try { return JSON.parse(text) } catch { return text }
}

async function pool(items, worker, concurrency) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run))
  return results
}

const PW = 'loadtest1234'

;(async () => {
  console.log(`Target: ${URL}`)
  console.log(`Plan: ${TOTAL} voters, ${CONCURRENCY} at a time\n`)

  // 1) create a throwaway admission-number election (plain mode auto-registers voters)
  const created = await rpc('create_election', {
    p_title: `LOAD TEST ${new Date().toISOString()}`,
    p_admin_password: PW,
    p_voter_identity_method: 'admission_number',
    p_admission_min: 1,
    p_admission_max: TOTAL,
    p_verified_mode: false,
  })
  const code = Array.isArray(created) ? created[0].code : created.code
  console.log(`Created test election: ${code}`)

  // 2) one position + 3 candidates
  const pos = (await rpc('admin_add_position', { p_code: code, p_password: PW, p_title: 'President', p_max_winners: 1 })).id
  const cands = []
  for (const name of ['Aisha', 'Marcus', 'Priya']) {
    const r = await rpc('admin_add_candidate', { p_code: code, p_password: PW, p_position_id: pos, p_name: name, p_bio: null })
    cands.push(r.id)
  }
  console.log(`Ballot ready: 1 position, ${cands.length} candidates`)

  // 3) open voting
  await rpc('admin_finalize_election', { p_code: code, p_password: PW })
  console.log('Voting opened (finalized)\n')

  // 4) fire concurrent votes — voter i is admission number i
  const voters = Array.from({ length: TOTAL }, (_, k) => k + 1)
  let ok = 0
  const errs = {}
  const t0 = Date.now()
  await pool(voters, async (i) => {
    const cand = cands[i % cands.length]
    try {
      await rpc('cast_vote', { p_code: code, p_identity: String(i), p_votes: [{ position_id: pos, candidate_id: cand }] })
      ok++
    } catch (e) {
      const key = String(e.message).slice(0, 80)
      errs[key] = (errs[key] || 0) + 1
    }
  }, CONCURRENCY)
  const dt = (Date.now() - t0) / 1000

  console.log(`--- ${TOTAL} votes in ${dt.toFixed(2)}s  =>  ${(TOTAL / dt).toFixed(0)} votes/sec ---`)
  console.log(`success: ${ok}   errors: ${TOTAL - ok}`)
  for (const [m, c] of Object.entries(errs)) console.log(`   [${c}] ${m}`)

  // 5) verify the tally matches
  const tally = await rpc('admin_get_tally', { p_code: code, p_password: PW })
  const counted = (tally.positions || []).reduce(
    (s, p) => s + (p.candidates || []).reduce((a, c) => a + (c.provisional || 0), 0), 0)
  console.log(`\nServer tally total: ${counted}  (expected ${ok})  => ${counted === ok ? 'PASS' : 'MISMATCH'}`)

  // 6) clean up
  await rpc('admin_delete_election', { p_code: code, p_password: PW })
  console.log(`Deleted test election ${code}. Done.`)
})().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })
