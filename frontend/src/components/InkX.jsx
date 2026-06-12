// The signature element: a hand-inked X, drawn with irregular strokes so it
// reads like a pen mark on a ballot rather than a clean icon.
export default function InkX({ size = 36, className = '' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      className={className} aria-hidden="true"
    >
      <g
        fill="none" stroke="currentColor"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M22 20 C 40 38, 60 60, 80 82" strokeWidth="11" />
        <path d="M80 19 C 62 39, 41 59, 21 81" strokeWidth="11" />
        {/* ink bleed flecks */}
        <circle cx="20" cy="18" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="82" cy="84" r="2.1" fill="currentColor" stroke="none" />
        <circle cx="84" cy="17" r="1.8" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}
