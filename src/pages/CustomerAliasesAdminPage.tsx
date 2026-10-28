import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchCustomerAliasCandidates,
  saveCustomerAlias,
  type CustomerAliasCandidates,
} from '../lib/demandProfile'

export function CustomerAliasesAdminPage() {
  const { showToast } = useToast()
  const { username } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [data, setData] = useState<CustomerAliasCandidates | null>(null)
  const [pickByAlias, setPickByAlias] = useState<Record<string, number>>({})

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await fetchCustomerAliasCandidates()
    setLoading(false)
    if (result.error) {
      showToast(
        result.error.includes('customer_alias') || result.error.includes('schema cache')
          ? 'Run migration-customer-aliases.sql (and migration-demand-profile-rpc.sql) in Supabase first.'
          : `Could not load aliases: ${result.error}`,
      )
      setData(null)
      return
    }
    setData(result.data)
  }, [showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  const mapAlias = async (aliasText: string) => {
    const customerId = pickByAlias[aliasText]
    if (!customerId) {
      showToast('Pick a canonical customer first')
      return
    }
    setSaving(aliasText)
    const { error } = await saveCustomerAlias({
      aliasText,
      customerId,
      createdByName: username ?? '',
    })
    setSaving(null)
    if (error) {
      showToast(`Could not save alias: ${error}`)
      return
    }
    showToast(`Mapped “${aliasText}”`)
    await reload()
  }

  return (
    <div className="page-stack">
      <header className="page-header-row">
        <div>
          <p className="breadcrumb-row">
            <Link to="/admin/lists?tab=customers">Manage lists · Customers</Link>
            {' · '}
            <Link to="/reports/demand-profile">Demand profile</Link>
          </p>
          <h1>Customer name mapping</h1>
          <p className="placeholder-copy">
            Job cards store free-text customer names. Map unmatched spellings to a canonical customer so demand
            reports group them together. Near-duplicates are flagged — they are not merged automatically.
          </p>
        </div>
        <button type="button" className="button-secondary" disabled={loading} onClick={() => void reload()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>

      {loading && !data ? <p className="placeholder-copy">Loading…</p> : null}

      {data ? (
        <>
          <section className="dashboard-panel">
            <h3>Near-duplicates</h3>
            <p className="placeholder-copy">
              Same name with punctuation/spacing differences (and fuzzy matches when pg_trgm is available).
            </p>
            {data.nearDuplicates.length === 0 ? (
              <p className="placeholder-copy">No near-duplicates among unmatched names.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Name A</th>
                      <th>Jobs</th>
                      <th>Name B</th>
                      <th>Jobs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nearDuplicates.map((row) => (
                      <tr key={`${row.normalizedA}|${row.normalizedB}`}>
                        <td>{row.nameA}</td>
                        <td>{row.jobsA}</td>
                        <td>{row.nameB}</td>
                        <td>{row.jobsB}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dashboard-panel">
            <h3>Unmatched job-card names</h3>
            <p className="placeholder-copy">
              These appear on jobs but are not mapped in <code>customer_aliases</code>. Pick a canonical customer
              from Manage lists → Customers, then Map.
            </p>
            {data.unmatched.length === 0 ? (
              <p className="placeholder-copy">All job-card customer names are mapped (or blank).</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Job-card name</th>
                      <th>Jobs</th>
                      <th>Map to canonical</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.unmatched.map((row) => (
                      <tr key={row.normalized}>
                        <td>
                          {row.name}
                          <div className="job-muted">{row.normalized}</div>
                        </td>
                        <td>{row.jobCount}</td>
                        <td>
                          <select
                            className="report-inline-select"
                            value={pickByAlias[row.name] ?? ''}
                            onChange={(e) =>
                              setPickByAlias((prev) => ({
                                ...prev,
                                [row.name]: Number(e.target.value) || 0,
                              }))
                            }
                            aria-label={`Canonical customer for ${row.name}`}
                          >
                            <option value="">— Select —</option>
                            {data.canonicalCustomers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button-primary"
                            disabled={saving === row.name || !pickByAlias[row.name]}
                            onClick={() => void mapAlias(row.name)}
                          >
                            {saving === row.name ? 'Saving…' : 'Map'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
