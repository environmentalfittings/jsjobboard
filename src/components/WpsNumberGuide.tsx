import { useState } from 'react'
import {
  WPS_HEAT_TREAT_DIGITS,
  WPS_MATERIAL_DIGITS,
  WPS_NUMBER_INTRO,
  WPS_PROCESS_DIGITS,
  WPS_P_NUMBER_EXAMPLES,
  WPS_QW424_ROWS,
  WPS_THICKNESS_DIGITS,
  WPS_TYPE_DIGITS,
} from '../lib/wpsNumberGuide'

function CodeTable({
  caption,
  rows,
}: {
  caption: string
  rows: { code: string; label?: string; examples?: string }[]
}) {
  return (
    <div className="wps-guide-table-wrap">
      <h4 className="wps-guide-subhead">{caption}</h4>
      <table className="wps-guide-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${caption}-${row.code}-${row.label ?? row.examples}`}>
              <td>
                <code>{row.code}</code>
              </td>
              <td>{row.label ?? row.examples}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WpsNumberGuide() {
  const [open, setOpen] = useState(false)

  return (
    <div className="wps-guide">
      <button
        type="button"
        className="wps-guide-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{open ? 'Hide' : 'Show'} WPS number lookup</span>
        <span className="wps-guide-toggle-hint">How titles like 1 10 11 are built</span>
      </button>
      {open ? (
        <div className="wps-guide-body">
          <p className="wps-guide-intro">{WPS_NUMBER_INTRO}</p>
          <ol className="wps-guide-steps">
            <li>
              <strong>1st digit</strong> — type of weld
            </li>
            <li>
              <strong>2nd–3rd digits</strong> — process
            </li>
            <li>
              <strong>4th–5th digits</strong> — material joined
            </li>
            <li>
              <strong>6th digit</strong> — heat treat
            </li>
            <li>
              <strong>7th digit</strong> — coupon thickness
            </li>
          </ol>
          <p className="wps-guide-intro">
            Example: <strong>1 10 11</strong> is a joint, SMAW stick, P1 to P42 (carbon to Monel).{' '}
            <strong>HF</strong> at the end means the procedure is for HF-service valves.
          </p>
          <div className="wps-guide-grid">
            <CodeTable caption="Type (1st digit)" rows={WPS_TYPE_DIGITS} />
            <CodeTable caption="Process (2nd–3rd)" rows={WPS_PROCESS_DIGITS} />
            <CodeTable caption="Heat treat (6th)" rows={WPS_HEAT_TREAT_DIGITS} />
            <CodeTable caption="Thickness (7th)" rows={WPS_THICKNESS_DIGITS} />
          </div>
          <CodeTable caption="Material joined (4th–5th)" rows={WPS_MATERIAL_DIGITS} />
          <details className="wps-guide-details">
            <summary>P-number examples (what shop metals map to)</summary>
            <CodeTable caption="ASME P-numbers used in the shop" rows={WPS_P_NUMBER_EXAMPLES} />
          </details>
          <details className="wps-guide-details">
            <summary>ASME IX QW-424 — which base metals a coupon qualifies</summary>
            <div className="wps-guide-table-wrap">
              <table className="wps-guide-table">
                <thead>
                  <tr>
                    <th>Coupon</th>
                    <th>Base metals qualified</th>
                  </tr>
                </thead>
                <tbody>
                  {WPS_QW424_ROWS.map((row) => (
                    <tr key={row.coupon}>
                      <td>{row.coupon}</td>
                      <td>{row.qualified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  )
}
