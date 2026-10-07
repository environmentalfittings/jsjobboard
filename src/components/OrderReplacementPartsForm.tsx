import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ORDER_PART_KIND_IDS,
  ORDER_PART_KIND_NAMES,
  isOrderStudsKind,
} from '../lib/itpOrderParts'
import {
  formatNeededPartNotes,
  formatNeededPartsSummary,
  jobNeededPartStatusLabel,
  type JobNeededPart,
  type JobNeededPartDraft,
} from '../lib/jobNeededParts'

const STUD_LOCATION_OPTIONS = [
  'Body to bonnet',
  'Yoke to bonnet',
  'Bonnet to yoke',
  'Gland flange',
  'Packing flange',
  'Actuator to yoke',
]

type HardwareDraft = {
  type: string
  size: string
  location: string
  extra: string
  quantity: number
}

type SpecDraft = {
  partNumber: string
  material: string
  extra: string
  quantity: number
}

type Props = {
  rows: JobNeededPart[]
  canEdit?: boolean
  saving?: boolean
  showBoardLink?: boolean
  onSaveKind: (draft: JobNeededPartDraft) => Promise<boolean>
  onAddOther: (draft: JobNeededPartDraft) => Promise<boolean>
  onRemove?: (id: string) => void
}

function materialFromNotes(notes: string): string {
  const match = String(notes ?? '').match(/^Material:\s*(.*)$/im)
  return match ? match[1].trim() : ''
}

function extraFromNotes(notes: string): string {
  const text = String(notes ?? '').trim()
  if (/^(Material|Location):/im.test(text)) return ''
  return text
}

function emptyHardware(): HardwareDraft {
  return { type: '', size: '', location: '', extra: '', quantity: 1 }
}

function emptySpec(): SpecDraft {
  return { partNumber: '', material: '', extra: '', quantity: 1 }
}

function rowForKind(rows: JobNeededPart[], kind: string): JobNeededPart | undefined {
  return rows.find((row) => row.itpItemId === kind)
}

function studNotes(location: string, extra: string): string {
  return [location.trim() ? `Location: ${location.trim()}` : '', extra.trim()].filter(Boolean).join('\n')
}

export function OrderReplacementPartsForm({
  rows,
  canEdit = true,
  saving = false,
  showBoardLink = true,
  onSaveKind,
  onAddOther,
  onRemove,
}: Props) {
  const studsRows = rows.filter((row) => isOrderStudsKind(row.itpItemId))
  const slipsRow = rowForKind(rows, ORDER_PART_KIND_IDS.slips)
  const softRow = rowForKind(rows, ORDER_PART_KIND_IDS.softGoods)
  const otherRows = rows.filter(
    (row) =>
      !isOrderStudsKind(row.itpItemId) &&
      row.itpItemId !== ORDER_PART_KIND_IDS.slips &&
      row.itpItemId !== ORDER_PART_KIND_IDS.softGoods,
  )

  const [studs, setStuds] = useState<HardwareDraft>(emptyHardware)
  const [slips, setSlips] = useState<SpecDraft>(emptySpec)
  const [softGoods, setSoftGoods] = useState<SpecDraft>(emptySpec)
  const [otherQty, setOtherQty] = useState(1)
  const [otherDesc, setOtherDesc] = useState('')

  useEffect(() => {
    if (slipsRow) {
      setSlips({
        partNumber: slipsRow.partNumber,
        material: materialFromNotes(slipsRow.notes) || slipsRow.notes,
        extra: extraFromNotes(slipsRow.notes),
        quantity: slipsRow.quantity,
      })
    }
    if (softRow) {
      setSoftGoods({
        partNumber: softRow.partNumber,
        material: materialFromNotes(softRow.notes) || softRow.notes,
        extra: extraFromNotes(softRow.notes),
        quantity: softRow.quantity,
      })
    }
  }, [slipsRow, softRow])

  const hardwareReady = useMemo(() => {
    const hasSlips = Boolean(slips.partNumber.trim() || slips.material.trim())
    const hasSoft = Boolean(softGoods.partNumber.trim() || softGoods.material.trim())
    return hasSlips || hasSoft
  }, [slips, softGoods])

  const studsReady = Boolean(studs.type.trim() || studs.size.trim())

  const addStuds = async () => {
    if (!studsReady) return
    const type = studs.type.trim() || 'Studs'
    const location = studs.location.trim()
    const ok = await onAddOther({
      partName: location ? `${type} — ${location}` : type,
      partNumber: studs.size.trim(),
      quantity: Math.max(1, studs.quantity),
      supplier: '',
      notes: studNotes(location, studs.extra),
      itpItemId: `${ORDER_PART_KIND_IDS.studs}:${crypto.randomUUID()}`,
      itpItemName: ORDER_PART_KIND_NAMES[ORDER_PART_KIND_IDS.studs],
    })
    if (ok) setStuds(emptyHardware())
  }

  const saveHardware = async () => {
    if (slips.partNumber.trim() || slips.material.trim()) {
      const ok = await onSaveKind({
        partName: slips.extra.trim() || 'Slips',
        partNumber: slips.partNumber.trim(),
        quantity: Math.max(1, slips.quantity),
        supplier: '',
        notes: slips.material.trim() ? `Material: ${slips.material.trim()}` : '',
        itpItemId: ORDER_PART_KIND_IDS.slips,
        itpItemName: ORDER_PART_KIND_NAMES[ORDER_PART_KIND_IDS.slips],
      })
      if (!ok) return
    }
    if (softGoods.partNumber.trim() || softGoods.material.trim()) {
      const ok = await onSaveKind({
        partName: softGoods.extra.trim() || 'Soft goods kit',
        partNumber: softGoods.partNumber.trim(),
        quantity: Math.max(1, softGoods.quantity),
        supplier: '',
        notes: softGoods.material.trim() ? `Material: ${softGoods.material.trim()}` : '',
        itpItemId: ORDER_PART_KIND_IDS.softGoods,
        itpItemName: ORDER_PART_KIND_NAMES[ORDER_PART_KIND_IDS.softGoods],
      })
      if (!ok) return
    }
  }

  const addOther = async () => {
    const desc = otherDesc.trim()
    if (!desc) return
    const ok = await onAddOther({
      partName: desc,
      partNumber: '',
      quantity: Math.max(1, otherQty),
      supplier: '',
      notes: '',
      itpItemId: 'parts_order',
      itpItemName: 'Order replacement parts',
    })
    if (ok) {
      setOtherDesc('')
      setOtherQty(1)
    }
  }

  const listedRows = [...studsRows, slipsRow, softRow, ...otherRows].filter(Boolean) as JobNeededPart[]

  return (
    <div className="order-parts-form">
      <div className="needed-parts-list-hdr">
        <strong>Parts required — order replacements</strong>
        <span>{formatNeededPartsSummary(rows)}</span>
        {showBoardLink ? (
          <Link to="/needed-parts" className="needed-parts-list-board">
            Open needs parts
          </Link>
        ) : null}
      </div>
      <p className="placeholder-copy">
        Studs, slips, soft goods, and anything else that must be purchased. Add a stud line for each
        location. Purchasing sees every line on Needs parts with PO and due date.
      </p>

      <section className="order-parts-block">
        <h4>Studs</h4>
        <div className="order-parts-grid order-parts-grid--studs">
          <label>
            Type
            <input
              value={studs.type}
              disabled={!canEdit || saving}
              placeholder="B7 STUDS"
              onChange={(e) => setStuds((prev) => ({ ...prev, type: e.target.value }))}
            />
          </label>
          <label>
            Size
            <input
              value={studs.size}
              disabled={!canEdit || saving}
              placeholder={`3/4"-10 x 7"`}
              onChange={(e) => setStuds((prev) => ({ ...prev, size: e.target.value }))}
            />
          </label>
          <label>
            Qty
            <input
              type="number"
              min={1}
              value={studs.quantity}
              disabled={!canEdit || saving}
              onChange={(e) =>
                setStuds((prev) => ({ ...prev, quantity: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </label>
          <label className="order-parts-span">
            Location
            <input
              list="order-parts-stud-locations"
              value={studs.location}
              disabled={!canEdit || saving}
              placeholder="Yoke to bonnet"
              onChange={(e) => setStuds((prev) => ({ ...prev, location: e.target.value }))}
            />
          </label>
          <label>
            Extra
            <input
              value={studs.extra}
              disabled={!canEdit || saving}
              placeholder="1 nut each"
              onChange={(e) => setStuds((prev) => ({ ...prev, extra: e.target.value }))}
            />
          </label>
          {canEdit ? (
            <button
              type="button"
              className="button-secondary"
              disabled={saving || !studsReady}
              onClick={() => void addStuds()}
            >
              Add studs
            </button>
          ) : null}
        </div>
        <datalist id="order-parts-stud-locations">
          {STUD_LOCATION_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </section>

      <div className="order-parts-two">
        <section className="order-parts-block">
          <h4>Slips</h4>
          <div className="order-parts-grid">
            <label>
              Part #
              <input
                value={slips.partNumber}
                disabled={!canEdit || saving}
                placeholder="5-467V"
                onChange={(e) => setSlips((prev) => ({ ...prev, partNumber: e.target.value }))}
              />
            </label>
            <label>
              Material
              <input
                value={slips.material}
                disabled={!canEdit || saving}
                placeholder="VITON"
                onChange={(e) => setSlips((prev) => ({ ...prev, material: e.target.value }))}
              />
            </label>
            <label>
              Qty
              <input
                type="number"
                min={1}
                value={slips.quantity}
                disabled={!canEdit || saving}
                onChange={(e) =>
                  setSlips((prev) => ({ ...prev, quantity: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </label>
            <label>
              Description
              <input
                value={slips.extra}
                disabled={!canEdit || saving}
                placeholder="Slips need rebonded"
                onChange={(e) => setSlips((prev) => ({ ...prev, extra: e.target.value }))}
              />
            </label>
          </div>
        </section>

        <section className="order-parts-block">
          <h4>Soft goods</h4>
          <div className="order-parts-grid">
            <label>
              Part #
              <input
                value={softGoods.partNumber}
                disabled={!canEdit || saving}
                placeholder="SG-28"
                onChange={(e) => setSoftGoods((prev) => ({ ...prev, partNumber: e.target.value }))}
              />
            </label>
            <label>
              Material
              <input
                value={softGoods.material}
                disabled={!canEdit || saving}
                placeholder="VITON"
                onChange={(e) => setSoftGoods((prev) => ({ ...prev, material: e.target.value }))}
              />
            </label>
            <label>
              Qty
              <input
                type="number"
                min={1}
                value={softGoods.quantity}
                disabled={!canEdit || saving}
                onChange={(e) =>
                  setSoftGoods((prev) => ({ ...prev, quantity: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </label>
            <label>
              Description
              <input
                value={softGoods.extra}
                disabled={!canEdit || saving}
                placeholder="Soft goods kit"
                onChange={(e) => setSoftGoods((prev) => ({ ...prev, extra: e.target.value }))}
              />
            </label>
          </div>
        </section>
      </div>

      {canEdit ? (
        <button
          type="button"
          className="button-primary"
          disabled={saving || !hardwareReady}
          onClick={() => void saveHardware()}
        >
          {saving ? 'Saving…' : 'Add slips & soft goods to needs parts'}
        </button>
      ) : null}

      <section className="order-parts-block">
        <h4>Other parts required</h4>
        {canEdit ? (
          <div className="order-parts-other-add">
            <label>
              Qty
              <input
                type="number"
                min={1}
                value={otherQty}
                disabled={saving}
                onChange={(e) => setOtherQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label>
              Description
              <input
                value={otherDesc}
                disabled={saving}
                placeholder="B7 HEX HEAD CAP BOLTS 3/4-10x1-1/2"
                onChange={(e) => setOtherDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addOther()
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="button-secondary"
              disabled={saving || !otherDesc.trim()}
              onClick={() => void addOther()}
            >
              Add other part
            </button>
          </div>
        ) : null}
      </section>

      {listedRows.length === 0 ? (
        <p className="placeholder-copy">No parts listed yet.</p>
      ) : (
        <ul className="needed-parts-list-items">
          {listedRows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {row.quantity}× {row.partName}
                </strong>
                <span>
                  {row.partNumber ? `#${row.partNumber}` : ''}
                  {row.notes ? `${row.partNumber ? ' · ' : ''}${formatNeededPartNotes(row.notes)}` : ''}
                  {row.poNumber ? ` · PO ${row.poNumber}` : ''}
                  {row.expectedDate ? ` · due ${row.expectedDate}` : ''}
                </span>
              </div>
              <span className={`needed-parts-status needed-parts-status--${row.status}`}>
                {jobNeededPartStatusLabel(row.status)}
              </span>
              {canEdit && row.status === 'needed' && onRemove ? (
                <button type="button" className="link-button-danger" onClick={() => onRemove(row.id)}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
