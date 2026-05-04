import criticalDimensionsImage from '../assets/itp-non-lubricated-critical-dimensions.png'

/**
 * Reference image for Body -> Flanges measurements (thickness A/B, face-to-face C).
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
        <img
          className="itp-critical-dimensions-image"
          src={criticalDimensionsImage}
          alt="Critical dimensions for non-lubricated plug valve showing A, B, and face-to-face C measurements."
        />
      </div>
      <p className="itp-critical-dimensions-hint">
        For each <strong>Flange</strong> block below, use <strong>Measurement (as found)</strong> and{' '}
        <strong>Minimum allowable</strong> for thickness at that port (callout A or B for that end). Record overall
        face-to-face (C) in <strong>Measurement notes</strong> on one of the flanges or your shop traveler when needed.
      </p>
    </div>
  )
}
