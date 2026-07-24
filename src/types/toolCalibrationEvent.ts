import type { ToolCalibrationMeasurement } from '../lib/toolCalibrationSopPoints'

export type ToolCalibrationEventResult = 'pass' | 'fail'

export type ToolCalibrationEvent = {
  id: string
  tool_id: number
  calibrated_at: string
  next_due_at: string
  tech_initials: string
  technician_id: number | null
  technician_name: string | null
  signed_off_at: string | null
  ambient_temp_f: number | null
  gauge_block_serial: string | null
  gauge_block_next_due: string | null
  procedure_ref: string
  result: ToolCalibrationEventResult
  notes: string | null
  measurements: ToolCalibrationMeasurement[]
  certificate_number: string | null
  certificate_storage_path: string | null
  certificate_file_name: string | null
  created_at: string
}

export type ToolRecalibrationInput = {
  calibratedAt: string
  nextDueAt: string
  technicianId: number | null
  technicianName: string
  signedOffAt: string
  ambientTempF: number | null
  gaugeBlockSerial: string
  gaugeBlockNextDue: string
  procedureRef?: string
  result: ToolCalibrationEventResult
  notes: string
  measurements: ToolCalibrationMeasurement[]
}
