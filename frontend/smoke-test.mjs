// Renders every route server-side to catch import/JSX/hook errors that
// `vite build` doesn't (build checks syntax/imports; this checks runtime mount).
import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'

const outfile = 'smoke-bundle.mjs'

await build({
  entryPoints: ['smoke-entry.jsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  jsx: 'automatic',
  logLevel: 'error',
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  // CSS + asset imports aren't needed for an SSR render
  loader: { '.css': 'empty', '.png': 'empty', '.svg': 'text' },
  // stub the browser-only env the client reads
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '"https://placeholder.supabase.co"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"placeholder"',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
  },
})

try {
  await import('./' + outfile)
} finally {
  try { rmSync(outfile) } catch { /* ignore */ }
}
