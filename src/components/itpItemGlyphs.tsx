import type { ReactNode } from 'react'

/** Small inline SVGs for Twinseal ITP list rows (match tablet reference styling). */

function SvgWrap({ children }: { children: ReactNode }) {
  return (
    <span className="itp-item-glyph" aria-hidden>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
        {children}
      </svg>
    </span>
  )
}

export function ItpItemGlyph({ label }: { label: string }) {
  const k = label.toLowerCase()

  if (k.includes('flange')) {
    return (
      <SvgWrap>
        <path d="M4 9h16M4 15h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </SvgWrap>
    )
  }
  if (k.includes('bore')) {
    return (
      <SvgWrap>
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="1.75" fill="currentColor" />
      </SvgWrap>
    )
  }
  if (k.includes('sealing') || k.includes('seal')) {
    return (
      <SvgWrap>
        <path
          d="M12 4v4M12 16v4M4 12h4M16 12h4M6.34 6.34l2.83 2.83M14.83 14.83l2.83 2.83M6.34 17.66l2.83-2.83M14.83 9.17l2.83-2.83"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </SvgWrap>
    )
  }
  if (k.includes('thread') || k.includes('tapped') || k.includes('bolting') || k.includes('stud')) {
    return (
      <SvgWrap>
        <path
          d="M5 7h14M5 10h14M5 13h14M5 16h14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </SvgWrap>
    )
  }
  if (k.includes('pressure') || k.includes('boundary')) {
    return (
      <SvgWrap>
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.75" />
        <path d="M12 12V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12 12h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </SvgWrap>
    )
  }
  if (k.includes('coating') || k.includes('paint')) {
    return (
      <SvgWrap>
        <path d="M8 6l8 4-8 4-8-4 8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 14v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </SvgWrap>
    )
  }
  if (k.includes('fit') || k.includes('alignment')) {
    return (
      <SvgWrap>
        <path
          d="M4 12h5l2-4 2 8 2-4h5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </SvgWrap>
    )
  }
  if (k.includes('trunnion') || k.includes('bearing')) {
    return (
      <SvgWrap>
        <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      </SvgWrap>
    )
  }
  if (k.includes('lubricat')) {
    return (
      <SvgWrap>
        <path
          d="M12 5c-2 3-4 4.5-4 7a4 4 0 008 0c0-2.5-2-4-4-7z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </SvgWrap>
    )
  }
  if (k.includes('fastener') || k.includes('hardware')) {
    return (
      <SvgWrap>
        <path d="M10 4h4v3l3 3-5 10-5-10 3-3V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </SvgWrap>
    )
  }

  return (
    <SvgWrap>
      <rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
    </SvgWrap>
  )
}

export function ItpOverallTabIcon() {
  return (
    <svg
      className="itp-tab-grid-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}
