import { isValveRelatedJobType, normalizeJobType } from '../constants/jobTypes'
import type { Valve } from '../types'
import { supabase } from './supabase'

export function buildCopiedValveInsert(source: Valve, valveId: string) {
  const normalizedJobType = normalizeJobType(source.job_type ?? 'Valve Repair')
  const valveRelated = isValveRelatedJobType(normalizedJobType)

  return {
    valve_id: valveId.trim(),
    job_type: normalizedJobType,
    customer: source.customer?.trim() || null,
    cell: source.cell?.trim() || null,
    size: source.size?.trim() || null,
    pressure_class: source.pressure_class?.trim() || null,
    body_material: source.body_material?.trim() || null,
    test_type: valveRelated ? source.test_type?.trim() || null : null,
    valve_type: valveRelated ? source.valve_type?.trim() || null : null,
    bowl_type: valveRelated ? source.bowl_type?.trim() || null : null,
    order_type: source.order_type?.trim() || null,
    status: 'Arrived - Not Started',
    due_date: source.due_date?.trim().slice(0, 10) || null,
    description: source.description?.trim() || null,
    notes: source.notes?.trim() || null,
    material_spec: valveRelated ? null : source.material_spec?.trim() || null,
    drawing_po_number: valveRelated ? null : source.drawing_po_number?.trim() || null,
    is_turnaround: source.is_turnaround === true,
    needs_failure_analysis: source.needs_failure_analysis === true,
    assigned_technician_ids: [],
    assigned_technician_id: null,
    assigned_by: null,
    assigned_at: null,
    assignment_notes: null,
    needs_attention: false,
    sub_status: null,
    date_tested: null,
    date_closed: null,
  }
}

export async function createCopiedJob(source: Valve, valveId: string): Promise<{ error: string | null }> {
  const id = valveId.trim()
  if (!id) return { error: 'Valve ID is required' }

  const { error } = await supabase.from('valves').insert(buildCopiedValveInsert(source, id))
  if (error) {
    if (error.message.includes('duplicate') || error.code === '23505') {
      return { error: 'That Valve ID already exists' }
    }
    return { error: error.message || 'Could not create job' }
  }

  return { error: null }
}
