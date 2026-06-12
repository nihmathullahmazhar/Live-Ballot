/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:    '#16161D',   // near-black official ink
        paper:  '#FAF6EC',   // ballot-paper cream
        paper2: '#F1EADA',   // slightly deeper paper for panels
        violet: '#4B2E83',   // official violet (headers/seals)
        ballot: '#C8102E',   // ballot red (X marks, danger)
        verify: '#1B7B3A',   // verified green
        rule:   '#2A2A33',   // rule lines
        faint:  '#9A9384',    // muted captions on paper
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        body:    ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        paper: '0 1px 0 #00000010, 0 12px 30px -18px #00000040',
      },
    },
  },
  plugins: [],
}
