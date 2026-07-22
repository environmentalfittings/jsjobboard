import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ItpLibraryEditor } from '../components/ItpLibraryEditor'
import { useAuth } from '../contexts/AuthContext'
import { canWriteShop } from '../lib/roles'
import { supabase } from '../lib/supabase'
import { VALVE_LIST_SELECT } from '../lib/valveSelect'
import type { Valve } from '../types'

export function ItpPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [valve, setValve] = useState<Valve | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const valveId = Number.parseInt(id ?? '', 10)
      if (!Number.isFinite(valveId)) {
        if (!cancelled) setLoading(false)
        return
      }
      setLoading(true)
      const { data, error } = await supabase.from('valves').select(VALVE_LIST_SELECT).eq('id', valveId).maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setValve(null)
        setLoading(false)
        return
      }
      setValve(data as Valve)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const closeItp = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/job-board', { replace: true })
  }

  if (loading) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">Loading ITP...</p>
        </section>
      </section>
    )
  }

  if (!valve) {
    return (
      <section className="dashboard-page">
        <section className="dashboard-panel">
          <p className="status-breakdown-note">ITP job not found.</p>
        </section>
      </section>
    )
  }

  return <ItpLibraryEditor valve={valve} onClose={closeItp} readOnly={!canWrite} />
}
