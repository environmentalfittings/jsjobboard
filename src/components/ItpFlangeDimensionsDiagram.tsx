/**
 * Reference schematic for Body → Flanges measurements (thickness A/B, face-to-face C).
 * Side-view valve profile (not to scale) so callouts read as flanges + body, not a fastener.
 */
export function ItpFlangeDimensionsDiagram() {
  return (
    <div
      className="itp-critical-dimensions"
      role="figure"
      aria-label="Side view of a valve: flange thickness A and B, face-to-face dimension C"
    >
      <div className="itp-critical-dimensions-badge">Critical dimensions</div>
      <div className="itp-critical-dimensions-inner">
        <svg
          className="itp-critical-dimensions-svg"
          viewBox="0 0 300 132"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <marker
              id="itp-dim-arrowhead"
              markerWidth="5"
              markerHeight="5"
              refX="4.2"
              refY="2.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L5,2.5 L0,5 Z" fill="#475569" />
            </marker>
          </defs>

          {/* Flow centerline (visual cue) */}
          <line
            x1="10"
            y1="68"
            x2="210"
            y2="68"
            stroke="#94a3b8"
            strokeWidth="0.75"
            strokeDasharray="3 3"
            opacity="0.85"
          />

          <g stroke="#475569" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round">
            {/* Left pipe stub */}
            <line x1="8" y1="68" x2="22" y2="68" fill="none" />

            {/* Left flange disk + bolt holes */}
            <rect x="22" y="38" width="22" height="60" rx="2" fill="#f1f5f9" stroke="#475569" />
            <circle cx="33" cy="50" r="2.2" fill="none" stroke="#64748b" strokeWidth="1" />
            <circle cx="33" cy="68" r="2.2" fill="none" stroke="#64748b" strokeWidth="1" />
            <circle cx="33" cy="86" r="2.2" fill="none" stroke="#64748b" strokeWidth="1" />

            {/* Valve body (wider center block) */}
            <path
              d="M 44 54 L 44 82 L 48 86 L 152 86 L 156 82 L 156 54 L 152 50 L 48 50 Z"
              fill="#e2e8f0"
              stroke="#475569"
            />

            {/* Bonnet + yoke (reads “valve” vs bolt) */}
            <path
              d="M 88 50 L 88 30 L 92 26 L 128 26 L 132 30 L 132 50"
              fill="#cbd5e1"
              stroke="#475569"
            />
            <rect x="98" y="18" width="24" height="10" rx="2" fill="#e2e8f0" stroke="#475569" />
            <line x1="110" y1="18" x2="110" y2="10" stroke="#475569" />
            <line x1="102" y1="10" x2="118" y2="10" stroke="#475569" strokeWidth="1.5" />

            {/* Right flange */}
            <rect x="156" y="38" width="22" height="60" rx="2" fill="#f1f5f9" stroke="#475569" />
            <circle cx="167" cy="50" r="2.2" fill="none" stroke="#64748b" strokeWidth="1" />
            <circle cx="167" cy="68" r="2.2" fill="none" stroke="#64748b" strokeWidth="1" />
            <circle cx="167" cy="86" r="2.2" fill="none" stroke="#64748b" strokeWidth="1" />

            {/* Right pipe stub */}
            <line x1="178" y1="68" x2="208" y2="68" fill="none" />

            {/* Dimension A — left flange thickness (outer to body face) */}
            <g fill="none">
              <line
                x1="22"
                y1="100"
                x2="44"
                y2="100"
                markerStart="url(#itp-dim-arrowhead)"
                markerEnd="url(#itp-dim-arrowhead)"
              />
              <line x1="22" y1="96" x2="22" y2="104" />
              <line x1="44" y1="96" x2="44" y2="104" />
            </g>

            {/* Dimension B — right flange thickness */}
            <g fill="none">
              <line
                x1="156"
                y1="100"
                x2="178"
                y2="100"
                markerStart="url(#itp-dim-arrowhead)"
                markerEnd="url(#itp-dim-arrowhead)"
              />
              <line x1="156" y1="96" x2="156" y2="104" />
              <line x1="178" y1="96" x2="178" y2="104" />
            </g>

            {/* Dimension C — face-to-face */}
            <g fill="none">
              <line
                x1="22"
                y1="118"
                x2="178"
                y2="118"
                markerStart="url(#itp-dim-arrowhead)"
                markerEnd="url(#itp-dim-arrowhead)"
              />
              <line x1="22" y1="114" x2="22" y2="122" />
              <line x1="178" y1="114" x2="178" y2="122" />
            </g>
          </g>

          <text
            x="33"
            y="94"
            textAnchor="middle"
            fill="#334155"
            fontSize="11"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            A
          </text>
          <text
            x="167"
            y="94"
            textAnchor="middle"
            fill="#334155"
            fontSize="11"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            B
          </text>
          <text
            x="100"
            y="112"
            textAnchor="middle"
            fill="#334155"
            fontSize="11"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            C
          </text>
        </svg>

        <ul className="itp-critical-dimensions-legend">
          <li>
            <span className="itp-critical-dimensions-key">A</span>
            <span>Thickness at flange A (port)</span>
          </li>
          <li>
            <span className="itp-critical-dimensions-key">B</span>
            <span>Thickness at flange B (port)</span>
          </li>
          <li>
            <span className="itp-critical-dimensions-key">C</span>
            <span>Face-to-face (outer flange faces)</span>
          </li>
        </ul>
      </div>
      <p className="itp-critical-dimensions-hint">
        For each <strong>Flange</strong> block below, use <strong>Measurement (as found)</strong> and{' '}
        <strong>Minimum allowable</strong> for thickness at that port (callout A or B for that end). Record overall
        face-to-face (C) in <strong>Measurement notes</strong> on one of the flanges or your shop traveler when needed.
      </p>
    </div>
  )
}
