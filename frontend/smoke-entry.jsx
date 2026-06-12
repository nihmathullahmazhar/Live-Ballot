import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import App from './src/App.jsx'
import { ToastProvider } from './src/components/Toast.jsx'

const routes = [
  '/',
  '/create',
  '/e/AB12CD',
  '/e/AB12CD/results',
  '/e/AB12CD/register',
  '/e/AB12CD/nominate',
  '/e/AB12CD/request',
  '/e/AB12CD/admin',
  '/totally-unknown-route',
]

let failures = 0
for (const path of routes) {
  try {
    const html = renderToString(
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    )
    if (!html || html.length < 20) throw new Error('empty render')
    console.log(`OK   ${path}  (${html.length} chars)`)
  } catch (err) {
    failures++
    console.log(`FAIL ${path}\n     ${err.message}`)
  }
}

console.log(failures === 0 ? '\nSMOKE TEST PASSED — all routes render' : `\nSMOKE TEST FAILED — ${failures} route(s) threw`)
process.exit(failures === 0 ? 0 : 1)
