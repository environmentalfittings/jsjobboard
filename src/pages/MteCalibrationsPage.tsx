import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TestGaugesPanel } from '../components/TestGaugesPanel'
import { ToolCalibrationsPanel } from '../components/ToolCalibrationsPanel'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { resolveActiveCompanyKey } from '../lib/companyDataScope'

type MteTab = 'testGauges' | 'toolLog'

export function MteCalibrationsPage() {
  const [tab, setTab] = useState<MteTab>('testGauges')
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()
  const companyKey = resolveActiveCompanyKey(workflow.key, activeOrganization)
  const companyName = activeOrganization?.name?.trim() || (companyKey === 'vsi' ? 'VSI' : '')

  return (
    <section className="dashboard-page mte-calibrations-page">
      <div className="dashboard-header">
        <div>
          <p className="status-priorities-back">
            <Link to="/quality-team">← Quality Team</Link>
          </p>
          <h2 className="dashboard-title">
            MTE Calibrations{companyName ? ` · ${companyName}` : ''}
          </h2>
          <p className="placeholder-copy resources-hint">
            {companyKey === 'vsi'
              ? 'VSI measuring and test equipment. Historical JS Valve gauges and tools are not included.'
              : 'Measuring and test equipment — pressure/test gauges for the test log, and the shop tool calibration log (micrometers, calipers, and other MTE).'}
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
