import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TestGaugesPanel } from '../components/TestGaugesPanel'
import { ToolCalibrationsPanel } from '../components/ToolCalibrationsPanel'

type MteTab = 'testGauges' | 'toolLog'

export function MteCalibrationsPage() {
  const [tab, setTab] = useState<MteTab>('testGauges')

  return (
    <section className="dashboard-page mte-calibrations-page">
      <div className="dashboard-header">
        <div>
          <p className="status-priorities-back">
            <Link to="/dashboard">← Dashboard</Link>
          </p>
          <h2 className="dashboard-title">MTE Calibrations</h2>
          <p className="placeholder-copy resources-hint">
            Measuring and test equipment — pressure/test gauges for the test log, and the shop tool
            calibration log (micrometers, calipers, and other MTE).
          </p>
        </div>
      </div>

      <div className="admin-lists-tabs" role="tablist" aria-label="MTE calibrations">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'testGauges'}
          className={`admin-lists-tab ${tab === 'testGauges' ? 'active' : ''}`}
          onClick={() => setTab('testGauges')}
        >
          Test gauges
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'toolLog'}
          className={`admin-lists-tab ${tab === 'toolLog' ? 'active' : ''}`}
          onClick={() => setTab('toolLog')}
        >
          Tool calibration log
        </button>
      </div>

      {tab === 'testGauges' ? <TestGaugesPanel /> : null}
      {tab === 'toolLog' ? <ToolCalibrationsPanel /> : null}
    </section>
  )
}
