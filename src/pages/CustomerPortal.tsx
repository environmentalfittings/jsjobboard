import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/js-logo.png'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ToastNotification'

type PortalUser = {
  id: string
  customer_name: string
}

type TravelerListRow = {
  traveler_id: string
  valve_id: string
  purchase_order_no: string | null
  due_date: string | null
  updated_at: string | null
  is_complete: boolean
  valve_type_id: string | null
}

const TYPE_LABELS: Record<string, string> = {
  a: 'Lubricated Plug Valve',
  b: 'Non Lubricated Plug Valve',
  c: 'Orbit Valve',
  d: 'Piston Check',
  f: 'Pressure Seal Check Valve',
  g: 'Pressure Seal Gate Valve',
  h: 'Pressure Seal Globe Valve',
  i: 'Twinseal',
  j: 'Pipeline Gate',
  k: 'Angle Globe Valve',
  l: 'Check Valve',
  m: 'Gate Valve',
  n: 'Globe Valve',
  o: 'Ball Valve',
  p: 'Wedge Plug',
  q: 'Delayed Coker - Isolation Ball Valve',
  r: 'Relief Valve - VR Traveler',
  s: 'Relief Valve - TO Traveler',
  t: 'Manufacturing Traveler',
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function CustomerPortal() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null)
  const [rows, setRows] = useState<TravelerListRow[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data: me } = await supabase.auth.getUser()
      if (!me.user) {
        navigate('/customer-login', { replace: true })
        return
      }

      const { data: customer, error: customerError } = await supabase
        .from('customer_portal_users')
        .select('id,customer_name')
        .eq('auth_user_id', me.user.id)
        .maybeSingle()

      if (cancelled) return
      if (customerError || !customer) {
        await supabase.auth.signOut()
        navigate('/customer-login', { replace: true })
        return
      }
      setPortalUser(customer as PortalUser)

      const { data: basicRows, error: basicError } = await supabase
        .from('traveler_basic_info')
        .select('traveler_id,valve_id,purchase_order_no,due_date,updated_at')
        .eq('customer', customer.customer_name)
        .order('updated_at', { ascending: false })

      if (cancelled) return
      if (basicError) {
        showToast(`Could not load portal travelers: ${basicError.message}`)
        setRows([])
        setLoading(false)
        return
      }

      const travelerIds = Array.from(new Set((basicRows ?? []).map((row) => row.traveler_id).filter(Boolean)))
      if (travelerIds.length === 0) {
        setRows([])
        setLoading(false)
        return
      }

      const { data: travelerRows, error: travelerError } = await supabase
        .from('travelers')
        .select('id,valve_type_id,is_complete,updated_at')
        .in('id', travelerIds)

      if (cancelled) return
      if (travelerError) {
        showToast(`Could not load traveler statuses: ${travelerError.message}`)
        setRows([])
        setLoading(false)
        return
      }

      const travelerById = new Map((travelerRows ?? []).map((row) => [row.id, row]))
      const merged: TravelerListRow[] = (basicRows ?? [])
        .map((basic) => {
          const traveler = travelerById.get(basic.traveler_id)
          if (!traveler) return null
          return {
            traveler_id: basic.traveler_id,
            valve_id: basic.valve_id,
            purchase_order_no: basic.purchase_order_no,
            due_date: basic.due_date,
            updated_at: (traveler.updated_at as string | null) ?? (basic.updated_at as string | null),
            is_complete: Boolean(traveler.is_complete),
            valve_type_id: (traveler.valve_type_id as string | null) ?? null,
          }
        })
        .filter((row): row is TravelerListRow => Boolean(row))

      setRows(merged)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [navigate, showToast])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aa = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const bb = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return bb - aa
    })
  }, [rows])

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/customer-login', { replace: true })
  }

  return (
    <section className="dashboard-page">
      <header className="customer-portal-header">
        <div className="brand">
          <img src={logo} alt="JS Valve logo" className="brand-logo" />
          <span>JS Customer Portal</span>
        </div>
        <button className="logout-button" type="button" onClick={() => void logout()}>
          Logout
        </button>
      </header>

      <section className="dashboard-panel">
        <div className="dashboard-title-row">
          <h2 className="dashboard-title">Traveler Status</h2>
          <span className="status-breakdown-note">{portalUser?.customer_name ?? ''}</span>
        </div>

        {loading ? (
          <p className="status-breakdown-note">Loading traveler list...</p>
        ) : sortedRows.length === 0 ? (
          <p className="status-breakdown-note">No travelers found for your customer account.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Valve ID</th>
                  <th>Type</th>
                  <th>PO Number</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.traveler_id} onClick={() => navigate(`/customer-portal/traveler/${encodeURIComponent(row.valve_id)}`)}>
                    <td>{row.valve_id}</td>
                    <td>{row.valve_type_id ? TYPE_LABELS[row.valve_type_id] ?? row.valve_type_id : '-'}</td>
                    <td>{row.purchase_order_no ?? '-'}</td>
                    <td>{formatDate(row.due_date)}</td>
                    <td>{row.is_complete ? 'Complete' : 'In Progress'}</td>
                    <td>{formatDate(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
