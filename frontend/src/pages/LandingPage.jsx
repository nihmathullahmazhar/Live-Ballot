import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow } from '../components/ui'
import { supabase, isConfigured } from '../lib/supabase'
import { LogIn, ArrowRight, UserPlus, FileText, KeyRound, BarChart3, ShieldCheck } from 'lucide-react'

export default function LandingPage() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session))
  }, [])

  function enter(e) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length >= 4) nav(`/e/${c}`)
  }

  return (
    <Layout>
      {!isConfigured && (
        <div className="panel border-ballot text-ballot px-4 py-3 mb-6 text-sm">
          Supabase isn't configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your
          <span className="font-mono"> .env</span>.
        </div>
      )}

      {/* HERO */}
      <div className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          {/* left */}
          <div className="p-6 sm:p-10">
            <Eyebrow>Form&nbsp;LB&nbsp;·&nbsp;Official&nbsp;ballot&nbsp;system</Eyebrow>
            <h1 className="font-display font-900 text-5xl sm:text-6xl leading-[0.9] uppercase mt-3">
              Run clean<br />elections,<br /><span className="text-violet">end to end.</span>
            </h1>
            <p className="mt-5 text-ink/80 max-w-md text-lg">
              Build a registration form, verify who's in, issue one-time codes, and watch the
              count come in live — all from one organiser dashboard.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {loggedIn ? (
                <button className="btn btn-primary text-lg" onClick={() => nav('/dashboard')}>
                  Open your dashboard <ArrowRight size={18} className="inline -mt-1 ml-1" />
                </button>
              ) : (
                <button className="btn btn-primary text-lg" onClick={() => nav('/auth')}>
                  <UserPlus size={18} className="inline -mt-1 mr-1" /> Create an account
                </button>
              )}
              <a href="#vote" className="btn text-lg">I have a code</a>
            </div>
          </div>

          {/* right — mock ballot paper */}
          <div className="bg-paper2 border-t-2 lg:border-t-0 lg:border-l-2 border-rule p-6 sm:p-10 flex items-center justify-center">
            <div className="w-full max-w-xs bg-white border-2 border-rule shadow-paper p-5 rotate-[-1.5deg]">
              <div className="flex items-center justify-between border-b-2 border-rule pb-2">
                <span className="font-display font-900 uppercase text-sm">Official Ballot</span>
                <span className="text-ballot"><InkX size={20} /></span>
              </div>
              <div className="mt-3 space-y-2">
                <p className="eyebrow text-[0.6rem]">Choose one — President</p>
                {[['Aisha R.', true], ['Marcus L.', false], ['Priya N.', false]].map(([n, on]) => (
                  <div key={n} className="flex items-center gap-3 border-2 border-rule px-3 py-2 bg-paper">
                    <span className={`h-5 w-5 grid place-items-center border-2 border-rule ${on ? 'text-ballot' : 'text-transparent'}`}>
                      <InkX size={14} />
                    </span>
                    <span className={`font-body ${on ? 'font-800' : ''}`}>{n}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t-2 border-dashed border-rule font-mono text-[0.6rem] text-faint">
                SEALED · ONE VOTE PER SEAT · CODE 7F2K9Q
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        {[
          [FileText, 'Custom forms', 'Build your own registration + nomination form, no extra links.'],
          [ShieldCheck, 'Verify voters', 'Admission ranges or one-time codes, with optional photo check.'],
          [KeyRound, 'Issue codes', 'Approve registrants and hand out single-use voting codes.'],
          [BarChart3, 'Live count', 'Watch turnout and results update as votes land.'],
        ].map(([Icon, t, d]) => (
          <div key={t} className="panel p-5">
            <span className="text-violet"><Icon size={22} /></span>
            <h3 className="font-display font-800 uppercase text-sm mt-3">{t}</h3>
            <p className="text-ink/70 text-sm mt-1">{d}</p>
          </div>
        ))}
      </section>

      {/* TWO PATHS */}
      <section id="vote" className="grid md:grid-cols-2 gap-6 mt-6">
        <div className="panel p-6 sm:p-8 flex flex-col">
          <Eyebrow>For organisers</Eyebrow>
          {loggedIn ? (
            <>
              <h2 className="font-display font-800 text-2xl uppercase mt-2">Welcome back</h2>
              <p className="text-ink/75 text-sm mt-2">Your elections are on your dashboard.</p>
              <button className="btn btn-primary mt-4" onClick={() => nav('/dashboard')}>
                Open your dashboard <ArrowRight size={16} className="inline -mt-1 ml-1" />
              </button>
            </>
          ) : (
            <>
              <h2 className="font-display font-800 text-2xl uppercase mt-2">Create an account</h2>
              <p className="text-ink/75 text-sm mt-2">
                Sign up with your email and a password, then create and run elections from your
                dashboard — log back in from any device.
              </p>
              <button className="btn btn-primary mt-4" onClick={() => nav('/auth')}>
                <UserPlus size={16} className="inline -mt-1 mr-1" /> Create account / Log in
              </button>
            </>
          )}
        </div>

        <div className="panel p-6 sm:p-8 flex flex-col">
          <Eyebrow>For voters</Eyebrow>
          <h2 className="font-display font-800 text-2xl uppercase mt-2">Enter an election</h2>
          <p className="text-ink/75 text-sm mt-2">Got a code from your organiser? Type it in to register or vote.</p>
          <form onSubmit={enter} className="mt-4 flex gap-2">
            <input className="input font-mono tracking-[0.25em] uppercase"
              placeholder="AB12CD" value={code} maxLength={6}
              onChange={(e) => setCode(e.target.value)} />
            <button className="btn whitespace-nowrap" type="submit">
              <LogIn size={16} className="inline -mt-1 mr-1" /> Go
            </button>
          </form>
          <p className="text-xs text-faint mt-4">Your vote is private. Codes work once and can't be reused.</p>
        </div>
      </section>
    </Layout>
  )
}