import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import InkX from '../components/InkX'
import { Eyebrow } from '../components/ui'
import { supabase, isConfigured } from '../lib/supabase'
import { ArrowRight, UserPlus, LogIn } from 'lucide-react'

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

      {/* One unified hero: pitch + both actions + ballot visual */}
      <div className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          {/* left: headline + actions */}
          <div className="p-6 sm:p-10">
            <Eyebrow>Form&nbsp;LB&nbsp;·&nbsp;Official&nbsp;ballot&nbsp;system</Eyebrow>
            <h1 className="font-display font-900 text-5xl sm:text-6xl leading-[0.9] uppercase mt-3">
              Run clean<br />elections,<br /><span className="text-violet">end to end.</span>
            </h1>
            <p className="mt-4 text-ink/80 max-w-md">
              Build a form, verify who's in, issue one-time codes, and watch the count come in live —
              all from one dashboard.
            </p>

            {/* organiser action */}
            <div className="mt-6">
              {loggedIn ? (
                <button className="btn btn-primary text-lg w-full sm:w-auto" onClick={() => nav('/dashboard')}>
                  Open your dashboard <ArrowRight size={18} className="inline -mt-1 ml-1" />
                </button>
              ) : (
                <button className="btn btn-primary text-lg w-full sm:w-auto" onClick={() => nav('/auth')}>
                  <UserPlus size={18} className="inline -mt-1 mr-1" /> Create an account / Log in
                </button>
              )}
              <p className="text-xs text-faint mt-2">For organisers — set up and run your elections.</p>
            </div>

            {/* divider */}
            <div className="flex items-center gap-3 my-5">
              <span className="h-[2px] flex-1 bg-rule/30" />
              <span className="eyebrow text-[0.65rem]">have a code?</span>
              <span className="h-[2px] flex-1 bg-rule/30" />
            </div>

            {/* voter action — now right here in the hero */}
            <form onSubmit={enter} className="flex gap-2">
              <input className="input font-mono tracking-[0.3em] uppercase text-center"
                placeholder="AB12CD" value={code} maxLength={6}
                onChange={(e) => setCode(e.target.value)} aria-label="Election code" />
              <button className="btn whitespace-nowrap" type="submit">
                <LogIn size={16} className="inline -mt-1 mr-1" /> Vote
              </button>
            </form>
            <p className="text-xs text-faint mt-2">For voters — enter the code from your organiser to register or vote.</p>
          </div>

          {/* right: ballot visual */}
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

      {/* slim one-line capability strip — no boxes */}
      <p className="mt-5 text-center eyebrow text-[0.65rem] text-faint">
        Custom forms · Verified voters · One-time codes · Live count · Export to CSV
      </p>
    </Layout>
  )
}