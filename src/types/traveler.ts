export type ValveTypeId =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'

export interface Traveler {
  id: string
  valve_id: string
  valve_type_id: ValveTypeId | null
  created_at: string
  updated_at: string
  is_complete: boolean
}

export interface TravelerBasicInfo {
  id: string
  traveler_id: string
  valve_id: string
  customer: string | null
  salesman: string | null
  purchase_order_no: string | null
  customer_valve_id: string | null
  location_id: string | null
  manufacturer_name: string | null
  due_date: string | null
  manufacturer_sn: string | null
  pressure: string | null
  size: string | null
  outlet_connection: 'RF' | 'RTJ' | 'BW' | 'FF' | 'Other' | null
  figure_number: string | null
  drawing_number: string | null
  operator: 'Handwheel' | 'Gear Op.' | 'Air Act.' | 'Electric Act.' | null
  valve_condition: 'Repairable' | 'Unrepairable' | null
  junked_reason: string | null
  notes: string | null
  material_id: Record<string, string>
  pmi_required: boolean | null
  pmi_attached: boolean | null
  tech_initials: string | null
  submitted_at: string | null
  is_complete: boolean
}

export interface TravelerValveSelection {
  id: string
  traveler_id: string
  valve_id: string
  notes: string | null
  tech_initials: string | null
  submitted_at: string | null
  is_complete: boolean
  is_na: boolean
}

export interface TravelerValveSpecs {
  id: string
  traveler_id: string
  valve_id: string
  valve_type_id: ValveTypeId | null
  kit_type: string | null
  specs: Record<string, any>
  tech_initials_specs: string | null
  tech_initials_dims: string | null
  tech_initials_assembly: string | null
  submitted_assembly_at: string | null
  is_complete: boolean
  is_na: boolean
}

export interface TravelerWelding {
  id: string
  traveler_id: string
  valve_id: string
  is_na: boolean
  weld_procedure: string | null
  welder_id: string | null
  notes: string | null
  tech_initials: string | null
  submitted_at: string | null
  is_complete: boolean
}

export interface TravelerTestingQC {
  id: string
  traveler_id: string
  valve_id: string
  testing_notes: string | null
  testing_tech_initials: string | null
  testing_completed_at: string | null
  qa_test_area_tech_initials: string | null
  qa_test_area_completed_at: string | null
  shipping_tech_initials: string | null
  shipping_completed_at: string | null
  final_inspection_tech_initials: string | null
  final_inspection_completed_at: string | null
  is_complete: boolean
}

export interface TravelerAttachment {
  id: string
  traveler_id: string
  valve_id: string
  file_type: 'image_before' | 'image_after' | 'qa_doc' | 'additional_doc' | 'weld_cert' | 'pmi_report'
  file_name: string
  file_url: string
  uploaded_at: string
}

export interface TravelerSectionStatus {
  section: string
  is_complete: boolean
  is_na: boolean
  tech_initials: string | null
  submitted_at: string | null
}
