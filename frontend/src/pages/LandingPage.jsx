import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow, Rule } from '../components/ui'
import { isConfigured } from '../lib/supabase'

export default function LandingPage() {
  const [code, setCode] = useState('')
  const nav = useNavigate()

  function enter(e) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length >= 4) nav(`/e/${c}`)
  }

  return (
    <Layout>
      {!isConfigured && (
        <div className="panel border-ballot text-ballot px-4 py-3 mb-6 text-sm">
          Supabase is not configured. Add VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY to your <span className="font-mono">.env</span> file.
        </div>
      )}

      <section className="grid md:grid-cols-2 gap-8 items-stretch">
        {/* Hero: an actual ballot cell with the inked X as the thesis */}
        <div className="panel p-8 flex flex-col justify-between">
          <div>
            <Eyebrow>Form&nbsp;LB&nbsp;·&nbsp;Official&nbsp;ballot</Eyebrow>
            <h1 className="font-display font-900 text-5xl leading-[0.95] mt-3 uppercase">
              Run a clean<br />election in<br />minutes.
            </h1>
            <p className="mt-5 text-ink/80 max-w-sm">
              Create a vote, verify who's allowed in however you choose, and watch
              the count come in live. One mark per seat. No accounts to vote.
            </p>
          </div>
          <div className="mt-8 flex items-center gap-4">
            <div className="border-2 border-rule bg-white h-16 w-16 grid place-items-center text-ballot">
              <InkX size={46} />
            </div>
            <span className="font-mono text-sm text-faint">
              your choice, stamped and counted
            </span>
          </div>
        </div>

        {/* Action panel */}
        <div className="panel p-8 flex flex-col">
          <Eyebrow>Have a code?</Eyebrow>
          <form onSubmit={enter} className="mt-3">
            <label className="block font-display font-700 text-lg uppercase mb-2">
              Enter election code
            </label>
            <div className="flex gap-2">
              <input
                className="input font-mono tracking-[0.3em] uppercase text-lg"
                placeholder="AB12CD"
                value={code}
                maxLength={6}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="btn btn-primary whitespace-nowrap" type="submit">
                Go
              </button>
            </div>
          </form>

          <Rule />

          <Eyebrow>Starting fresh?</Eyebrow>
          <p className="mt-2 text-ink/80 text-sm">
            Set up positions, candidates, how voters prove who they are, and your
            time windows. You'll get a code and an admin password.
          </p>
          <Link to="/create" className="btn mt-4 text-center">
            Create an election
          </Link>
        </div>
      </section>
    </Layout>
  )
}
