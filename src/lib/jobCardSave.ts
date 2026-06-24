export type JobCardSaveFields = {
  description: string
  notes: string
  bowlType: string | null
  valveType: string | null
  isTurnaround: boolean
  assignedTechnicianId: number | null
  pressureClass: string | null
  bodyMaterial: string | null
  customer: string | null
  cell: string | null
  size: string | null
  jobType: string | null
  orderType: string | null
  dueDate: string | null
  testType: string | null
  materialSpec: string | null
  drawingPoNumber: string | null
}

export function toDateInputValue(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  return s.slice(0, 10)
}
