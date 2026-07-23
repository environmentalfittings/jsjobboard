import { supabase } from './supabase'

/** Replace job-card technician assignments (job_technicians + valve summary fields). */
export async function replaceJobTechnicians(
  valveRowId: number,
  technicianIds: number[],
): Promise<{ error: string | null }> {
  const unique = [...new Set(technicianIds.filter((id) => Number.isInteger(id) && id > 0))]

  const { error: deleteError } = await supabase
    .from('job_technicians')
    .delete()
    .eq('valve_row_id', valveRowId)
  if (deleteError) return { error: deleteError.message }

  if (unique.length) {
    const { error: insertError } = await supabase.from('job_technicians').insert(
      unique.map((technician_id) => ({ valve_row_id: valveRowId, technician_id })),
    )
    if (insertError) return { error: insertError.message }
  }

  const { error: valveError } = await supabase
    .from('valves')
    .update({
      assigned_technician_id: unique[0] ?? null,
      assigned_technician_ids: unique,
    })
    .eq('id', valveRowId)
  if (valveError) return { error: valveError.message }

  return { error: null }
}

/** Map valve row id → assigned technician ids from job_technicians. */
export async function loadJobTechnicianIdsByValveRowId(
  valveRowIds: number[],
): Promise<Record<number, number[]>> {
  const unique = [...new Set(valveRowIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (!unique.length) return {}

  const { data, error } = await supabase
    .from('job_technicians')
    .select('valve_row_id,technician_id')
    .in('valve_row_id', unique)
  if (error || !data) return {}

  const map: Record<number, number[]> = {}
  for (const row of data as { valve_row_id: number; technician_id: number }[]) {
    if (!map[row.valve_row_id]) map[row.valve_row_id] = []
    map[row.valve_row_id]!.push(row.technician_id)
  }
  return map
}
