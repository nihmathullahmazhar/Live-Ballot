import { Link, useParams } from 'react-router-dom'

const UPDATED = 'June 2026'

export default function LegalPage({ kind }) {
  const which = kind || useParams().kind // 'terms' | 'privacy'
  const doc = which === 'privacy' ? PRIVACY : TERMS
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/" className="text-sm underline underline-offset-4" style={{ color: 'var(--violet)' }}>← Back to Live Ballot</Link>
        <div className="card vb-glass p-7 mt-4">
          <div className="text-xs font-mono uppercase tracking-widest text-muted">Live Ballot</div>
          <h1 className="text-3xl font-extrabold mt-1 vb-gradient-text">{doc.title}</h1>
          <div className="vb-accent-bar mt-3" />
          <p className="text-sm text-faint mt-3">Last updated: {UPDATED}</p>

          <div className="mt-6 space-y-6">
            {doc.sections.map((s, i) => (
              <section key={i} className={s.h ? '' : '-mt-3'}>
                {s.h && <h2 className="font-extrabold text-lg" style={{ color: 'var(--ink)' }}>{s.h}</h2>}
                {(s.p || []).map((para, j) => (
                  <p key={j} className="text-sm text-muted mt-2 leading-relaxed">{para}</p>
                ))}
                {(s.groups || []).map((g, gi) => (
                  <div key={gi} className="mt-3">
                    {g.sub && <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{g.sub}</div>}
                    <ul className="mt-1 space-y-1">
                      {g.items.map((li, k) => (
                        <li key={k} className="text-sm text-muted flex gap-2">
                          <span style={{ color: 'var(--violet)' }}>•</span><span>{li}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {s.list && (
                  <ul className="mt-2 space-y-1">
                    {s.list.map((li, k) => (
                      <li key={k} className="text-sm text-muted flex gap-2">
                        <span style={{ color: 'var(--violet)' }}>•</span><span>{li}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-8 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex gap-4 text-sm">
              <Link to="/terms" className="underline underline-offset-4" style={{ color: which === 'terms' ? 'var(--ink)' : 'var(--violet)' }}>Terms of Use</Link>
              <Link to="/privacy" className="underline underline-offset-4" style={{ color: which === 'privacy' ? 'var(--ink)' : 'var(--violet)' }}>Privacy Policy</Link>
            </div>
            <p className="text-xs text-faint mt-3">
              Live Ballot is operated by NWS Digital Services. For election-related matters, contact your election organiser. For platform inquiries, visit nihmathullah.com.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const PRIVACY = {
  title: 'Privacy Policy',
  sections: [
    { h: '1. Introduction',
      p: [
        'Live Ballot is an online election platform operated by NWS Digital Services. This Privacy Policy explains how information is collected, used, stored, and protected when individuals participate in elections hosted on the platform.',
        'By using Live Ballot, you acknowledge that your information may be processed in accordance with this policy.',
      ] },
    { h: '2. Data Controller',
      p: ['Each election is managed by an election organiser ("Election Committee" or "Organiser").', 'The organiser determines:'],
      list: [
        'Who may participate',
        'What information is collected',
        'How registrations are reviewed',
        'How election results are managed',
      ],
    },
    { h: '', p: ['NWS Digital Services provides and operates the software platform on behalf of organisers.'] },
    { h: '3. Information We Collect',
      p: ['Depending on the election configuration, information collected may include:'],
      groups: [
        { sub: 'Identity Information', items: ['Full name', 'Email address', 'Phone number', 'Admission number', 'Registration number', 'Student ID or membership number'] },
        { sub: 'Registration Information', items: ['Responses submitted through registration forms', 'Candidate nomination information', 'Candidate photographs'] },
        { sub: 'Verification Information (when enabled by the organiser)', items: ['Selfie photographs', 'Additional verification documents', 'Eligibility verification records'] },
        { sub: 'Voting Information', items: ['Voting code issuance status', 'Whether a voter has voted', 'Vote receipt code', 'Election participation records'] },
        { sub: 'Technical Information', items: ['Browser information', 'Device information', 'Platform usage logs', 'Security and audit records'] },
      ],
    },
    { h: '4. Voter Verification & Fraud Prevention',
      p: ['To maintain election integrity, Live Ballot may assist organisers in:'],
      list: [
        'Detecting duplicate registrations',
        'Identifying suspicious submissions',
        'Comparing admission numbers',
        'Comparing phone numbers',
        'Comparing email addresses',
        'Identifying similar or altered names',
        'Reviewing selfie verification submissions',
      ],
    },
    { h: '', p: ['Flagged registrations may be reviewed by authorised organisers before approval. Final decisions regarding voter eligibility remain the responsibility of the organiser.'] },
    { h: '5. Secret Ballot & Voting Privacy',
      p: [
        'Live Ballot is designed to protect ballot secrecy.',
        'The platform records whether a voter has participated in an election to prevent duplicate voting.',
        'Voting selections are handled separately from voter participation records.',
        'Election organisers may view:',
      ],
      list: ['Voter turnout', 'Participation statistics', 'Aggregate results'],
    },
    { h: '', p: ['The standard organiser interface does not reveal how an individual voter voted.', 'Vote receipt codes confirm participation only and do not reveal voting choices.'] },
    { h: '6. How Information Is Used',
      p: ['Information may be used to:'],
      list: [
        'Verify voter eligibility', 'Approve registrations', 'Issue voting codes', 'Deliver voting instructions',
        'Prevent fraud and duplicate registrations', 'Conduct elections', 'Generate election results',
        'Monitor turnout', 'Provide technical support', 'Maintain security and audit records',
      ],
    },
    { h: '', p: ['Information is never sold to third parties. Live Ballot does not use election data for advertising purposes.'] },
    { h: '7. Sharing of Information',
      p: ['Election data may be accessible to:'],
      list: ['Authorised election organisers', 'NWS Digital Services support personnel when necessary', 'Platform infrastructure providers required to operate the service (including Supabase and Vercel)'],
    },
    { h: '', p: ['Information is not disclosed to unrelated third parties except where required by law.'] },
    { h: '8. Data Retention',
      p: ['Election data remains available until:'],
      list: ['The organiser deletes the election', 'The organiser deletes specific records', 'Retention periods required by applicable law expire'],
    },
    { h: '', p: ['Organisers are encouraged to remove election data when it is no longer required.'] },
    { h: '9. Your Rights',
      p: ['Where applicable, participants may request:'],
      list: ['Access to their information', 'Correction of inaccurate information', 'Deletion of information', 'Withdrawal from an election before voting'],
    },
    { h: '', p: ['Requests should be directed to the election organiser, who controls election data.'] },
    { h: '10. Security',
      p: ['Live Ballot employs reasonable technical and organisational safeguards, including:'],
      list: ['Authentication controls', 'Database security rules', 'Protected administrative access', 'Single-use voting codes', 'Audit logging', 'Secure infrastructure'],
    },
    { h: '', p: ['No online platform can guarantee absolute security.'] },
    { h: '11. Changes to This Policy',
      p: ['This Privacy Policy may be updated periodically. Continued use of the platform constitutes acceptance of any updated version.'] },
    { h: '12. Contact',
      p: ['Live Ballot is operated by NWS Digital Services.', 'For election-related questions, contact your election organiser.', 'For platform-related inquiries, visit nihmathullah.com.'] },
  ],
}

const TERMS = {
  title: 'Terms of Use',
  sections: [
    { h: '1. About Live Ballot',
      p: ['Live Ballot is an online election platform that enables organisations to:'],
      list: ['Collect registrations', 'Verify voters', 'Manage candidates', 'Distribute voting access', 'Conduct elections', 'Publish results'],
    },
    { h: '', p: ['NWS Digital Services provides the software platform. The organiser remains responsible for the administration and conduct of each election.'] },
    { h: '2. Eligibility',
      p: ['You may use Live Ballot only if:'],
      list: ['You are an authorised organiser; or', 'You are an eligible participant in an election hosted on the platform.'],
    },
    { h: '', p: ['Organisers determine voter eligibility.'] },
    { h: '3. Voting Codes & Access',
      p: ['Voting codes are personal, single-use, and non-transferable.', 'Users agree not to:'],
      list: ['Share voting codes', 'Sell voting codes', 'Transfer voting codes', 'Attempt to obtain additional voting codes', 'Circumvent voting restrictions'],
    },
    { h: '', p: ['A voting code becomes invalid immediately after successful use.'] },
    { h: '4. One Person, One Vote',
      p: ['Users agree not to:'],
      list: ['Register multiple times', 'Impersonate another person', 'Submit false information', 'Attempt to vote more than once', 'Create duplicate registrations'],
    },
    { h: '', p: ['Organisers may reject or remove registrations that violate these rules.'] },
    { h: '5. Election Integrity',
      p: ['Live Ballot provides tools to help organisers maintain election integrity, including:'],
      list: ['Duplicate detection', 'Registration review', 'Verification workflows', 'Vote validation controls', 'Audit logging'],
    },
    { h: '', p: ['Any attempt to manipulate an election may result in:'], list: ['Registration removal', 'Vote disqualification', 'Access suspension', 'Permanent platform restrictions'] },
    { h: '6. Candidate Information',
      p: ['Candidates are responsible for information submitted through the platform.', 'Organisers may approve, reject, edit, or remove candidate information in accordance with their election rules.'] },
    { h: '7. Results',
      p: ['Election organisers control:'],
      list: ['Election schedules', 'Voting periods', 'Result publication', 'Turnout visibility'],
    },
    { h: '', p: ['NWS Digital Services does not alter election results. Any disputes regarding election outcomes must be directed to the organiser.'] },
    { h: '8. Organiser Responsibility',
      p: ['Election organisers are responsible for:'],
      list: ['Verifying voter eligibility', 'Managing registrations', 'Reviewing candidates', 'Publishing results', 'Enforcing election rules'],
    },
    { h: '', p: ['Live Ballot provides tools only.'] },
    { h: '9. Availability',
      p: ['The platform is provided on an "as is" and "as available" basis.', 'We strive for reliability but do not guarantee uninterrupted availability. Service interruptions may occur due to:'],
      list: ['Internet failures', 'Infrastructure outages', 'Third-party service issues', 'Maintenance activities'],
    },
    { h: '10. Limitation of Liability',
      p: [
        'To the maximum extent permitted by law, NWS Digital Services shall not be liable for any indirect, incidental, consequential, or special damages arising from the use of Live Ballot.',
        'Responsibility for election administration and decisions remains with the organiser.',
      ] },
    { h: '11. Changes',
      p: ['These Terms may be updated periodically. Continued use of Live Ballot constitutes acceptance of the updated Terms.'] },
    { h: '12. Contact',
      p: ['Live Ballot is operated by NWS Digital Services.', 'For election-related matters, contact the election organiser.', 'For platform-related inquiries, visit nihmathullah.com.'] },
  ],
}