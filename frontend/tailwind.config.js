/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // remapped to the new SaaS palette (keeps old class names working)
        ink:    '#1A1A22',
        paper:  '#FFFFFF',   // was cream; now card white
        paper2: '#FBFBFD',
        violet: '#5B34C4',
        ballot: '#D33A4B',
        verify: '#16915A',
        rule:   '#E7E7EC',   // now hairline grey, not near-black
        faint:  '#9A9AA6',
        muted:  '#6B6B78',
        bg:     '#F7F7F9',
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        body:    ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        paper: '0 1px 3px #0000000a',
        soft:  '0 4px 16px -6px #0000001f',
      },
    },
  },
  plugins: [],
}