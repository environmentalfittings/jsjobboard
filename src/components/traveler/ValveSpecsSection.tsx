import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ToastNotification'

type ValveSpecsSectionProps = {
  travelerId: string
  valveId: string
  valveTypeId: string
  onComplete: () => void
}

type AssemblyComponent = {
  key: string
  label: string
}

type AssemblyEntry = {
  repaired: boolean
  replaced: boolean
  description: string
}

type SpecsObject = Record<string, unknown>

const KIT_TYPES = new Set(['a', 'b', 'c', 'i', 'j', 'l', 'm', 'n', 'o', 'p'])
const STUD_TYPES = new Set(['a', 'b', 'i', 'l', 'm', 'n', 'o'])
const CRITICAL_DIM_TYPES = new Set(['a', 'b', 'i', 'l', 'm'])
const ASSEMBLY_TYPES = new Set(['a', 'b', 'i', 'l', 'm', 'n', 'o'])
const PLUG_STEM_TYPES = new Set(['a', 'b'])
const GASKET_TYPES = new Set(['a', 'b', 'l'])
const RELIEF_TYPES = new Set(['r', 's'])

const ASSEMBLY_COMPONENTS: Record<string, AssemblyComponent[]> = {
  b: [
    { key: 'body', label: 'Body' },
    { key: 'top_cap', label: 'Top Cap' },
    { key: 'plug', label: 'Plug' },
    { key: 'sleeve_a', label: 'Sleeve A' },
    { key: 'sleeve_b', label: 'Sleeve B' },
    { key: 'thrust_collar', label: 'Thrust Collar' },
    { key: 'adjuster', label: 'Adjuster' },
    { key: 'metal_diaphragm', label: 'Metal Diaphragm' },
    { key: 'diaphragm', label: 'Diaphragm' },
  ],
  l: [
    { key: 'body', label: 'Body' },
    { key: 'clapper', label: 'Clapper' },
    { key: 'clapper_nut', label: 'Clapper Nut' },
    { key: 'top_cap', label: 'Top Cap' },
    { key: 'seat', label: 'Seat' },
    { key: 'pin', label: 'Pin' },
    { key: 'clapper_arm', label: 'Clapper Arm' },
  ],
  m: [
    { key: 'body', label: 'Body' },
    { key: 'wedge', label: 'Wedge' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_rings', label: 'Seat Rings' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  n: [
    { key: 'body', label: 'Body' },
    { key: 'disc', label: 'Disc' },
    { key: 'stem', label: 'Stem' },
    { key: 'seat_ring', label: 'Seat Ring' },
    { key: 'bonnet', label: 'Bonnet' },
  ],
  o: [
    { key: 'body', label: 'Body' },
    { key: 'ball', label: 'Ball' },
    { key: 'stem', label: 'Stem' },
    { key: 'end_caps', label: 'End Caps' },
  ],
  a: [
    { key: 'body', label: 'Body' },
    { key: 'top_cap', label: 'Top Cap' },
    { key: 'plug', label: 'Plug' },
    { key: 'seats', label: 'Seats' },
  ],
  i: [
    { key: 'body', label: 'Body' },
    { key: 'top_cap', label: 'Top Cap' },
    { key: 'plug', label: 'Plug' },
    { key: 'seats', label: 'Seats' },
  ],
}

function toSpecsObject(value: unknown): SpecsObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as SpecsObject
}

function toAssemblyObject(value: unknown): Record<string, AssemblyEntry> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const output: Record<string, AssemblyEntry> = {}
  for (const [key, row] of Object.entries(source)) {
    const obj = typeof row === 'object' && row && !Array.isArray(row) ? (row as Record<string, unknown>) : {}
    output[key] = {
      repaired: Boolean(obj.repaired),
      replaced: Boolean(obj.replaced),
      description: typeof obj.description === 'string' ? obj.description : '',
    }
  }
  return output
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString()
}

export function ValveSpecsSection({ travelerId, valveId, valveTypeId, onComplete }: ValveSpecsSectionProps) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDims, setSavingDims] = useState(false)
  const [rowId, setRowId] = useState<string | null>(null)
  const [specs, setSpecs] = useState<SpecsObject>({})
  const [isNa, setIsNa] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [locked, setLocked] = useState(false)
  const [techInitialsAssembly, setTechInitialsAssembly] = useState('')
  const [techInitialsDims, setTechInitialsDims] = useState('')
  const [submittedAssemblyAt, setSubmittedAssemblyAt] = useState<string | null>(null)
  const [submittedDimsAt, setSubmittedDimsAt] = useState<string | null>(null)
  const [operator, setOperator] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({
    kit: true,
    studs: false,
    dims: false,
    assembly: false,
    plug_stem: false,
    air_actuator: false,
    gasket: false,
    relief: false,
  })

  const showKit = KIT_TYPES.has(valveTypeId)
  const showStuds = STUD_TYPES.has(valveTypeId)
  const showCriticalDims = CRITICAL_DIM_TYPES.has(valveTypeId)
  const showAssembly = ASSEMBLY_TYPES.has(valveTypeId)
  const showPlugStem = PLUG_STEM_TYPES.has(valveTypeId)
  const showAirActuator = operator === 'Air Act.'
  const showGasket = GASKET_TYPES.has(valveTypeId)
  const showRelief = RELIEF_TYPES.has(valveTypeId)
  const assemblyComponents = ASSEMBLY_COMPONENTS[valveTypeId] ?? []

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)

      const [specRes, basicInfoRes] = await Promise.all([
        supabase
          .from('traveler_valve_specs')
          .select(
            'id,specs,is_complete,is_na,tech_initials_dims,submitted_dims_at,tech_initials_assembly,submitted_assembly_at',
          )
          .eq('traveler_id', travelerId)
          .maybeSingle(),
        supabase.from('traveler_basic_info').select('operator').eq('traveler_id', travelerId).maybeSingle(),
      ])

      if (cancelled) return

      if (specRes.error) {
        showToast(`Could not load Valve Specifications: ${specRes.error.message}`)
      } else if (specRes.data) {
        setRowId(specRes.data.id as string)
        setSpecs(toSpecsObject(specRes.data.specs))
        setIsComplete(Boolean(specRes.data.is_complete))
        setIsNa(Boolean(specRes.data.is_na))
        setLocked(Boolean(specRes.data.is_complete))
        setTechInitialsDims(asString(specRes.data.tech_initials_dims))
        setSubmittedDimsAt((specRes.data.submitted_dims_at as string | null) ?? null)
        setTechInitialsAssembly(asString(specRes.data.tech_initials_assembly))
        setSubmittedAssemblyAt((specRes.data.submitted_assembly_at as string | null) ?? null)
      }

      if (!basicInfoRes.error && basicInfoRes.data) {
        setOperator((basicInfoRes.data.operator as string | null) ?? null)
      }

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [travelerId, showToast])

  const setSpecField = (key: string, value: unknown) => {
    setSpecs((prev) => ({ ...prev, [key]: value }))
  }

  const assembly = useMemo(() => toAssemblyObject(specs.assembly), [specs.assembly])

  const setAssemblyField = (componentKey: string, patch: Partial<AssemblyEntry>) => {
    setSpecs((prev) => {
      const currentAssembly = toAssemblyObject(prev.assembly)
      const current = currentAssembly[componentKey] ?? { repaired: false, replaced: false, description: '' }
      return {
        ...prev,
        assembly: {
          ...currentAssembly,
          [componentKey]: {
            ...current,
            ...patch,
          },
        },
      }
    })
  }

  const persistSpecs = async (payload: {
    is_complete: boolean
    is_na: boolean
    tech_initials_dims?: string | null
    submitted_dims_at?: string | null
    tech_initials_assembly?: string | null
    submitted_assembly_at?: string | null
  }) => {
    const rowPayload = {
      traveler_id: travelerId,
      valve_id: valveId,
      valve_type_id: valveTypeId,
      kit_type: asString(specs.kit_type) || null,
      specs,
      is_complete: payload.is_complete,
      is_na: payload.is_na,
      tech_initials_dims: payload.tech_initials_dims ?? null,
      submitted_dims_at: payload.submitted_dims_at ?? null,
      tech_initials_assembly: payload.tech_initials_assembly ?? null,
      submitted_assembly_at: payload.submitted_assembly_at ?? null,
    }

    const result = await supabase
      .from('traveler_valve_specs')
      .upsert(
        {
          id: rowId ?? crypto.randomUUID(),
          ...rowPayload,
        },
        { onConflict: 'id' },
      )
      .select('id,submitted_dims_at,submitted_assembly_at')
      .single()

    if (result.error) {
      throw result.error
    }
    const saved = result.data as { id: string; submitted_dims_at: string | null; submitted_assembly_at: string | null }
    setRowId(saved.id)
    setSubmittedDimsAt(saved.submitted_dims_at ?? null)
    setSubmittedAssemblyAt(saved.submitted_assembly_at ?? null)
  }

  const saveDimensions = async () => {
    if (!techInitialsDims.trim()) {
      showToast('Tech initials [dims] are required.')
      return
    }
    setSavingDims(true)
    try {
      const submittedAt = new Date().toISOString()
      const initials = techInitialsDims.trim().slice(0, 6).toUpperCase()
      await persistSpecs({
        is_complete: false,
        is_na: isNa,
        tech_initials_dims: initials,
        submitted_dims_at: submittedAt,
        tech_initials_assembly: techInitialsAssembly.trim().slice(0, 6).toUpperCase() || null,
        submitted_assembly_at: submittedAssemblyAt,
      })
      setTechInitialsDims(initials)
      setSubmittedDimsAt(submittedAt)
      showToast('Dimensions saved')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save dimensions')
    } finally {
      setSavingDims(false)
    }
  }

  const submitSpecifications = async () => {
    if (!isNa && !techInitialsAssembly.trim()) {
      showToast('Tech initials [assembly] are required before submit.')
      return
    }
    setSaving(true)
    try {
      const submittedAt = new Date().toISOString()
      const assemblyInitials = techInitialsAssembly.trim().slice(0, 6).toUpperCase()
      await persistSpecs({
        is_complete: true,
        is_na: isNa,
        tech_initials_dims: techInitialsDims.trim().slice(0, 6).toUpperCase() || null,
        submitted_dims_at: submittedDimsAt,
        tech_initials_assembly: assemblyInitials || null,
        submitted_assembly_at: submittedAt,
      })
      setTechInitialsAssembly(assemblyInitials)
      setSubmittedAssemblyAt(submittedAt)
      setIsComplete(true)
      setLocked(true)
      showToast('Specifications submitted')
      onComplete()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not submit specifications')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="status-breakdown-note">Loading Valve Specifications...</p>
  }

  return (
    <section className="traveler-basic-section">
      {isComplete ? (
        <div className="traveler-basic-complete-banner">
          <span aria-hidden>✅</span>
          <span>
            Specifications submitted
            {techInitialsAssembly ? ` by ${techInitialsAssembly}` : ''}
            {submittedAssemblyAt ? ` on ${formatDateLabel(submittedAssemblyAt)}` : ''}
          </span>
          <button type="button" className="button-secondary" onClick={() => setLocked((prev) => !prev)}>
            {locked ? 'Edit' : 'Lock'}
          </button>
        </div>
      ) : null}

      <div className="traveler-basic-card">
        <div className="traveler-section-head-row">
          <h4 className="traveler-basic-subtitle">Valve Specifications</h4>
          <label className="traveler-na-toggle">
            <input type="checkbox" checked={isNa} onChange={(e) => setIsNa(e.target.checked)} disabled={locked || saving} /> N/A
          </label>
        </div>

        {isNa ? <p className="status-breakdown-note">N/A is selected. Submit to mark this section complete.</p> : null}

        {!isNa ? (
          <div className="traveler-subaccordion-list">
            {showKit ? (
              <section className="traveler-subaccordion-item">
                <button type="button" className="traveler-subaccordion-head" onClick={() => setOpen((p) => ({ ...p, kit: !p.kit }))}>
                  <span>Kit</span>
                  <span>{open.kit ? '▾' : '▸'}</span>
                </button>
                {open.kit ? (
                  <div className="traveler-subaccordion-body">
                    <label className="traveler-textarea-label">
                      Kit Type
                      <input
                        value={asString(specs.kit_type)}
                        onChange={(e) => setSpecField('kit_type', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showStuds ? (
              <section className="traveler-subaccordion-item">
                <button type="button" className="traveler-subaccordion-head" onClick={() => setOpen((p) => ({ ...p, studs: !p.studs }))}>
                  <span>Studs</span>
                  <span>{open.studs ? '▾' : '▸'}</span>
                </button>
                {open.studs ? (
                  <div className="traveler-subaccordion-body traveler-spec-grid">
                    <label>
                      Stud Type
                      <input
                        value={asString(specs.stud_type)}
                        onChange={(e) => setSpecField('stud_type', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                    <label>
                      Stud Size
                      <input
                        value={asString(specs.stud_size)}
                        onChange={(e) => setSpecField('stud_size', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                    <label>
                      Stud Quantity
                      <input
                        type="number"
                        min={0}
                        value={asString(specs.stud_qty)}
                        onChange={(e) => setSpecField('stud_qty', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showCriticalDims ? (
              <section className="traveler-subaccordion-item">
                <button type="button" className="traveler-subaccordion-head" onClick={() => setOpen((p) => ({ ...p, dims: !p.dims }))}>
                  <span>Critical Dimensions</span>
                  <span>{open.dims ? '▾' : '▸'}</span>
                </button>
                {open.dims ? (
                  <div className="traveler-subaccordion-body">
                    <div className="traveler-spec-grid">
                      <label>
                        Thickness of Flange A
                        <input
                          value={asString(specs.flange_a_thickness)}
                          onChange={(e) => setSpecField('flange_a_thickness', e.target.value)}
                          disabled={locked || saving || savingDims}
                        />
                      </label>
                      <label>
                        Thickness of Flange B
                        <input
                          value={asString(specs.flange_b_thickness)}
                          onChange={(e) => setSpecField('flange_b_thickness', e.target.value)}
                          disabled={locked || saving || savingDims}
                        />
                      </label>
                      <label>
                        Dimension of C
                        <input
                          value={asString(specs.dimension_c)}
                          onChange={(e) => setSpecField('dimension_c', e.target.value)}
                          disabled={locked || saving || savingDims}
                        />
                      </label>
                    </div>

                    <div className="traveler-radio-wrap">
                      <div className="traveler-radio-row">
                        <span className="traveler-radio-label">Dimensions Acceptable?</span>
                        <label>
                          <input
                            type="radio"
                            checked={asBooleanOrNull(specs.dimensions_acceptable) === true}
                            onChange={() => setSpecField('dimensions_acceptable', true)}
                            disabled={locked || saving || savingDims}
                          />{' '}
                          Yes
                        </label>
                        <label>
                          <input
                            type="radio"
                            checked={asBooleanOrNull(specs.dimensions_acceptable) === false}
                            onChange={() => setSpecField('dimensions_acceptable', false)}
                            disabled={locked || saving || savingDims}
                          />{' '}
                          No
                        </label>
                      </div>
                    </div>

                    <div className="traveler-dims-save-row">
                      <label className="traveler-tech-initials">
                        Tech Initials [dims]
                        <input
                          value={techInitialsDims}
                          maxLength={6}
                          onChange={(e) => setTechInitialsDims(e.target.value.toUpperCase())}
                          disabled={locked || saving || savingDims}
                        />
                      </label>
                      <button type="button" className="button-secondary" onClick={() => void saveDimensions()} disabled={locked || saving || savingDims}>
                        {savingDims ? 'Saving...' : 'Save Dimensions'}
                      </button>
                      {submittedDimsAt ? <span className="status-breakdown-note">Saved {formatDateLabel(submittedDimsAt)}</span> : null}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showAssembly ? (
              <section className="traveler-subaccordion-item">
                <button type="button" className="traveler-subaccordion-head" onClick={() => setOpen((p) => ({ ...p, assembly: !p.assembly }))}>
                  <span>Assembly Area</span>
                  <span>{open.assembly ? '▾' : '▸'}</span>
                </button>
                {open.assembly ? (
                  <div className="traveler-subaccordion-body traveler-parts-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th>Repaired?</th>
                          <th>Replaced?</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assemblyComponents.map((component) => {
                          const row = assembly[component.key] ?? { repaired: false, replaced: false, description: '' }
                          return (
                            <tr key={component.key}>
                              <td>{component.label}</td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.repaired}
                                  onChange={(e) => setAssemblyField(component.key, { repaired: e.target.checked })}
                                  disabled={locked || saving}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={row.replaced}
                                  onChange={(e) => setAssemblyField(component.key, { replaced: e.target.checked })}
                                  disabled={locked || saving}
                                />
                              </td>
                              <td>
                                <input
                                  value={row.description}
                                  onChange={(e) => setAssemblyField(component.key, { description: e.target.value })}
                                  disabled={locked || saving}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showPlugStem ? (
              <section className="traveler-subaccordion-item">
                <button
                  type="button"
                  className="traveler-subaccordion-head"
                  onClick={() => setOpen((p) => ({ ...p, plug_stem: !p.plug_stem }))}
                >
                  <span>Plug / Stem Dimensions</span>
                  <span>{open.plug_stem ? '▾' : '▸'}</span>
                </button>
                {open.plug_stem ? (
                  <div className="traveler-subaccordion-body">
                    <div className="traveler-spec-grid">
                      <label>
                        Plug Dimension A
                        <input
                          value={asString(specs.plug_dim_a)}
                          onChange={(e) => setSpecField('plug_dim_a', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                      <label>
                        Plug Dimension B
                        <input
                          value={asString(specs.plug_dim_b)}
                          onChange={(e) => setSpecField('plug_dim_b', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                      <label>
                        Top Cap Fastener Torque
                        <input
                          value={asString(specs.top_cap_torque)}
                          onChange={(e) => setSpecField('top_cap_torque', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                      <label>
                        Adjuster Fastener Torque
                        <input
                          value={asString(specs.adjuster_torque)}
                          onChange={(e) => setSpecField('adjuster_torque', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                    </div>
                    <div className="traveler-radio-wrap">
                      <div className="traveler-radio-row">
                        <span className="traveler-radio-label">Locktite applied to top cap fastener?</span>
                        <label>
                          <input
                            type="radio"
                            checked={asBooleanOrNull(specs.locktite_applied) === true}
                            onChange={() => setSpecField('locktite_applied', true)}
                            disabled={locked || saving}
                          />{' '}
                          Yes
                        </label>
                        <label>
                          <input
                            type="radio"
                            checked={asBooleanOrNull(specs.locktite_applied) === false}
                            onChange={() => setSpecField('locktite_applied', false)}
                            disabled={locked || saving}
                          />{' '}
                          No
                        </label>
                      </div>
                      <div className="traveler-radio-row">
                        <span className="traveler-radio-label">Was valve put in oven?</span>
                        <label>
                          <input
                            type="radio"
                            checked={asBooleanOrNull(specs.oven_used) === true}
                            onChange={() => setSpecField('oven_used', true)}
                            disabled={locked || saving}
                          />{' '}
                          Yes
                        </label>
                        <label>
                          <input
                            type="radio"
                            checked={asBooleanOrNull(specs.oven_used) === false}
                            onChange={() => setSpecField('oven_used', false)}
                            disabled={locked || saving}
                          />{' '}
                          No
                        </label>
                      </div>
                    </div>
                    {asBooleanOrNull(specs.oven_used) === true ? (
                      <div className="traveler-spec-grid">
                        <label>
                          Temperature
                          <input
                            value={asString(specs.oven_temp)}
                            onChange={(e) => setSpecField('oven_temp', e.target.value)}
                            disabled={locked || saving}
                          />
                        </label>
                        <label>
                          Duration
                          <input
                            value={asString(specs.oven_duration)}
                            onChange={(e) => setSpecField('oven_duration', e.target.value)}
                            disabled={locked || saving}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {showAirActuator ? (
              <section className="traveler-subaccordion-item">
                <button
                  type="button"
                  className="traveler-subaccordion-head"
                  onClick={() => setOpen((p) => ({ ...p, air_actuator: !p.air_actuator }))}
                >
                  <span>Air Actuator</span>
                  <span>{open.air_actuator ? '▾' : '▸'}</span>
                </button>
                {open.air_actuator ? (
                  <div className="traveler-subaccordion-body traveler-radio-wrap">
                    <div className="traveler-radio-row">
                      <span className="traveler-radio-label">Break Away Torque at 40 PSI</span>
                      <label>
                        <input
                          type="radio"
                          checked={asString(specs.breakaway_torque_40psi) === 'Pass'}
                          onChange={() => setSpecField('breakaway_torque_40psi', 'Pass')}
                          disabled={locked || saving}
                        />{' '}
                        Pass
                      </label>
                      <label>
                        <input
                          type="radio"
                          checked={asString(specs.breakaway_torque_40psi) === 'Fail'}
                          onChange={() => setSpecField('breakaway_torque_40psi', 'Fail')}
                          disabled={locked || saving}
                        />{' '}
                        Fail
                      </label>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showGasket ? (
              <section className="traveler-subaccordion-item">
                <button type="button" className="traveler-subaccordion-head" onClick={() => setOpen((p) => ({ ...p, gasket: !p.gasket }))}>
                  <span>Gasket &amp; Surface Finish</span>
                  <span>{open.gasket ? '▾' : '▸'}</span>
                </button>
                {open.gasket ? (
                  <div className="traveler-subaccordion-body traveler-spec-grid">
                    <label>
                      Gasket Area Surface Finish
                      <input
                        value={asString(specs.gasket_surface_finish)}
                        onChange={(e) => setSpecField('gasket_surface_finish', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                    <label>
                      Plug/Stem Surface Finish
                      <input
                        value={asString(specs.plug_surface_finish)}
                        onChange={(e) => setSpecField('plug_surface_finish', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showRelief ? (
              <section className="traveler-subaccordion-item">
                <button type="button" className="traveler-subaccordion-head" onClick={() => setOpen((p) => ({ ...p, relief: !p.relief }))}>
                  <span>Relief Valve Specific</span>
                  <span>{open.relief ? '▾' : '▸'}</span>
                </button>
                {open.relief ? (
                  <div className="traveler-subaccordion-body">
                    <div className="traveler-spec-grid">
                      <label>
                        Set Pressure
                        <input
                          value={asString(specs.set_pressure)}
                          onChange={(e) => setSpecField('set_pressure', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                      <label>
                        Accumulation
                        <input
                          value={asString(specs.accumulation)}
                          onChange={(e) => setSpecField('accumulation', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                      <label>
                        Blowdown
                        <input
                          value={asString(specs.blowdown)}
                          onChange={(e) => setSpecField('blowdown', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                      <label>
                        Test Fluid
                        <input
                          value={asString(specs.test_fluid)}
                          onChange={(e) => setSpecField('test_fluid', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                      <label>
                        Seat Leakage
                        <input
                          value={asString(specs.seat_leakage)}
                          onChange={(e) => setSpecField('seat_leakage', e.target.value)}
                          disabled={locked || saving}
                        />
                      </label>
                    </div>
                    <label className="traveler-textarea-label">
                      As-found Condition
                      <textarea
                        className="new-job-textarea"
                        value={asString(specs.as_found_condition)}
                        onChange={(e) => setSpecField('as_found_condition', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                    <label className="traveler-textarea-label">
                      As-left Condition
                      <textarea
                        className="new-job-textarea"
                        value={asString(specs.as_left_condition)}
                        onChange={(e) => setSpecField('as_left_condition', e.target.value)}
                        disabled={locked || saving}
                      />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="traveler-basic-card traveler-basic-submit-row">
        <label className="traveler-tech-initials">
          Tech Initials [assembly]
          <input
            value={techInitialsAssembly}
            maxLength={6}
            onChange={(e) => setTechInitialsAssembly(e.target.value.toUpperCase())}
            disabled={locked || saving}
          />
        </label>
        <button type="button" className="button-primary" onClick={() => void submitSpecifications()} disabled={locked || saving}>
          {saving ? 'Submitting...' : 'Submit Specifications'}
        </button>
      </div>
    </section>
  )
}
