import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import { useEmployees } from '../hooks/useEmployees'
import {
  TRAINING_FILE_KINDS,
  TRAINING_REASONS,
  TRAINING_RECERT_INTERVALS,
  TRAINING_SKILL_KEYS,
  TRAINING_SKILL_LEVELS,
  TRAINING_STATUSES,
  computeRecertDueDate,
  createEmployeeTraining,
  deleteEmployeeTraining,
  deleteTrainingAttendee,
  deleteTrainingFile,
  emptyTrainingInput,
  formatTrainingDate,
  inputFromTraining,
  isTrainingExpired,
  listAllAttendeeTrainings,
  listAttendeeTrainingsForEmployee,
  listEmployeeSkills,
  listEmployeeTrainings,
  listTrainingAttendees,
  listTrainingFiles,
  trainingFilePublicUrl,
  trainingRecertIntervalLabel,
  trainingStatusLabel,
  updateEmployeeTraining,
  updateTrainingAttendee,
  uploadTrainingFile,
  upsertEmployeeSkill,
  upsertTrainingAttendee,
  type EmployeeTraining,
  type EmployeeTrainingAttendee,
  type EmployeeTrainingFile,
  type EmployeeTrainingInput,
  type EmployeeTrainingSkill,
  type TrainingFileKind,
  type TrainingRecertInterval,
  type TrainingSkillLevel,
  type TrainingStatus,
} from '../lib/employeeTraining'
import type { Employee } from '../types/employees'

type Tab = 'schedule' | 'log' | 'employees' | 'library'
type LibraryFilter = 'all' | TrainingFileKind

type EmployeeTrainingPanelProps = {
  canWrite: boolean
  onCountsChange?: () => void
}

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function migrationHint(message: string) {
  return /relation .* does not exist|Could not find the table|function .* does not exist|allocate_training_record_no|row-level security|employee_training|recert_interval|recert_due_date|certificate/i.test(
    message,
  )
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function EmployeeTrainingPanel({ canWrite, onCountsChange }: EmployeeTrainingPanelProps) {
  const { showToast } = useToast()
  const { employees } = useEmployees()
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [employees],
  )

  const [tab, setTab] = useState<Tab>('schedule')
  const [rows, setRows] = useState<EmployeeTraining[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<EmployeeTrainingInput>(() => emptyTrainingInput())
  const [creating, setCreating] = useState(false)

  const [attendees, setAttendees] = useState<EmployeeTrainingAttendee[]>([])
  const [draftAttendees, setDraftAttendees] = useState<Array<{ employeeId: string; employeeName: string }>>([])
  const [files, setFiles] = useState<EmployeeTrainingFile[]>([])
  const [attendeePickId, setAttendeePickId] = useState('')
  const [fileKind, setFileKind] = useState<TrainingFileKind>('material')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [libraryFiles, setLibraryFiles] = useState<EmployeeTrainingFile[]>([])
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all')
  const [libraryKind, setLibraryKind] = useState<TrainingFileKind>('material')
  const libraryFileRef = useRef<HTMLInputElement>(null)

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [allAttendeeRows, setAllAttendeeRows] = useState<
    Array<EmployeeTrainingAttendee & { training?: EmployeeTraining | null }>
  >([])
  const [allSkills, setAllSkills] = useState<EmployeeTrainingSkill[]>([])
  const [skills, setSkills] = useState<EmployeeTrainingSkill[]>([])
  const [employeeHistory, setEmployeeHistory] = useState<
    Array<EmployeeTrainingAttendee & { training?: EmployeeTraining | null }>
  >([])
  const [employeeCertificates, setEmployeeCertificates] = useState<EmployeeTrainingFile[]>([])
  const [shopLocation, setShopLocation] = useState('')
  const certFileInputRef = useRef<HTMLInputElement>(null)
  const [certUploadTrainingId, setCertUploadTrainingId] = useState<number | null>(null)

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  const scheduledRows = useMemo(
    () => rows.filter((r) => r.status === 'scheduled' || r.status === 'in_progress'),
    [rows],
  )
  const logRows = useMemo(() => rows.filter((r) => r.status === 'completed' || r.status === 'cancelled'), [rows])

  const availableAttendeeEmployees = useMemo(() => {
    const taken = new Set(
      creating
        ? draftAttendees.map((a) => a.employeeId)
        : attendees.map((a) => a.employee_id).filter((id): id is string => Boolean(id)),
    )
    return activeEmployees.filter((e) => !taken.has(e.id))
  }, [activeEmployees, attendees, creating, draftAttendees])

  const employeeRoster = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase()
    const filtered = q
      ? activeEmployees.filter((e) => e.full_name.toLowerCase().includes(q))
      : activeEmployees

    return filtered.map((employee) => {
      const history = allAttendeeRows.filter((row) => row.employee_id === employee.id)
      const expirations = history
        .map((row) => row.training?.recert_due_date)
        .filter((d): d is string => Boolean(d))
        .sort()
      const nextExpires = expirations[0] ?? null
      const shop =
        allSkills.find((s) => s.employee_id === employee.id && s.shop_location.trim())?.shop_location ||
        ''
      return {
        employee,
        trainingCount: history.length,
        nextExpires,
        shop,
      }
    })
  }, [activeEmployees, allAttendeeRows, allSkills, employeeSearch])

  const loadTrainings = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listEmployeeTrainings()
      setRows(list)
      onCountsChange?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load trainings'
      setRows([])
      if (migrationHint(message)) {
        showToast('Run migration-employee-training-module.sql in Supabase, then refresh')
      } else {
        showToast(message)
      }
    } finally {
      setLoading(false)
    }
  }, [onCountsChange, showToast])

  const loadDetail = useCallback(
    async (trainingId: number) => {
      try {
        const [a, f] = await Promise.all([listTrainingAttendees(trainingId), listTrainingFiles({ trainingId })])
        setAttendees(a)
        setFiles(f)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not load training details')
        setAttendees([])
        setFiles([])
      }
    },
    [showToast],
  )

  const loadLibrary = useCallback(async () => {
    try {
      const list = await listTrainingFiles({
        libraryOnly: true,
        kind: libraryFilter === 'all' ? 'all' : libraryFilter,
      })
      setLibraryFiles(list)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load library'
      setLibraryFiles([])
      if (migrationHint(message)) {
        showToast('Run migration-employee-training-module.sql in Supabase, then refresh')
      } else {
        showToast(message)
      }
    }
  }, [libraryFilter, showToast])

  const loadEmployeeRoster = useCallback(async () => {
    try {
      const [skillRows, attendeeRows] = await Promise.all([listEmployeeSkills(), listAllAttendeeTrainings()])
      setAllSkills(skillRows)
      setAllAttendeeRows(attendeeRows)
    } catch (error) {
      setAllSkills([])
      setAllAttendeeRows([])
      showToast(errorMessage(error, 'Could not load employee roster'))
    }
  }, [showToast])

  const loadEmployeeDetail = useCallback(
    async (employeeId: string) => {
      if (!employeeId) {
        setSkills([])
        setEmployeeHistory([])
        setEmployeeCertificates([])
        setShopLocation('')
        return
      }
      try {
        const [skillRows, history, certificates] = await Promise.all([
          listEmployeeSkills(employeeId),
          listAttendeeTrainingsForEmployee(employeeId),
          listTrainingFiles({ employeeId, kind: 'certificate' }),
        ])
        setSkills(skillRows)
        setEmployeeHistory(history)
        setEmployeeCertificates(certificates)
        setShopLocation(skillRows.find((s) => s.shop_location)?.shop_location ?? '')
      } catch (error) {
        showToast(errorMessage(error, 'Could not load employee training record'))
        setSkills([])
        setEmployeeHistory([])
        setEmployeeCertificates([])
      }
    },
    [showToast],
  )

  useEffect(() => {
    void loadTrainings()
  }, [loadTrainings])

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  useEffect(() => {
    if (tab === 'library') void loadLibrary()
  }, [tab, loadLibrary])

  useEffect(() => {
    if (tab === 'employees') void loadEmployeeRoster()
  }, [tab, loadEmployeeRoster])

  useEffect(() => {
    if (tab === 'employees') void loadEmployeeDetail(selectedEmployeeId)
  }, [tab, selectedEmployeeId, loadEmployeeDetail])

  useEffect(() => {
    if (tab !== 'employees') return
    if (selectedEmployeeId) {
      const stillActive = activeEmployees.some((e) => e.id === selectedEmployeeId)
      if (!stillActive && activeEmployees[0]) setSelectedEmployeeId(activeEmployees[0].id)
      return
    }
    if (activeEmployees[0]) setSelectedEmployeeId(activeEmployees[0].id)
  }, [tab, activeEmployees, selectedEmployeeId])

  const openCreate = (preset?: Partial<EmployeeTrainingInput>) => {
    setCreating(true)
    setSelectedId(null)
    setDraft({
      ...emptyTrainingInput(),
      scheduled_date: todayIso(),
      status: 'scheduled',
      ...preset,
    })
    setAttendees([])
    setDraftAttendees([])
    setAttendeePickId('')
    setFiles([])
  }

  const openTraining = (row: EmployeeTraining) => {
    setCreating(false)
    setSelectedId(row.id)
    setDraft(inputFromTraining(row))
    setDraftAttendees([])
    setAttendeePickId('')
  }

  const saveTraining = async () => {
    if (!canWrite || busy) return
    setBusy(true)
    try {
      if (creating) {
        const created = await createEmployeeTraining(draft)
        for (const attendee of draftAttendees) {
          await upsertTrainingAttendee({
            trainingId: created.id,
            employeeId: attendee.employeeId,
            employeeName: attendee.employeeName,
            signedOff: created.status === 'completed',
            signedOffAt: created.status === 'completed' ? created.completed_date || todayIso() : null,
          })
        }
        const countLabel =
          draftAttendees.length > 0
            ? ` with ${draftAttendees.length} attendee${draftAttendees.length === 1 ? '' : 's'}`
            : ''
        showToast(`Created ${created.record_no}${countLabel}`)
        setDraftAttendees([])
        await loadTrainings()
        setCreating(false)
        setSelectedId(created.id)
        setDraft(inputFromTraining(created))
        await loadDetail(created.id)
      } else if (selectedId != null) {
        const updated = await updateEmployeeTraining(selectedId, draft)
        showToast(`Saved ${updated.record_no}`)
        await loadTrainings()
        setDraft(inputFromTraining(updated))
      }
    } catch (error) {
      const message = errorMessage(error, 'Could not save training')
      if (migrationHint(message)) {
        showToast('Run migration-employee-training-module.sql in Supabase, then try again')
      } else {
        showToast(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const markCompleted = async () => {
    if (!canWrite || busy || selectedId == null) return
    setBusy(true)
    try {
      const completed_date = draft.completed_date || todayIso()
      const updated = await updateEmployeeTraining(selectedId, {
        ...draft,
        status: 'completed',
        completed_date,
        recert_due_date: draft.recert_due_date || computeRecertDueDate(completed_date, draft.recert_interval),
      })
      showToast(`${updated.record_no} marked completed`)
      await loadTrainings()
      setDraft(inputFromTraining(updated))
      setTab('log')
    } catch (error) {
      showToast(errorMessage(error, 'Could not complete training'))
    } finally {
      setBusy(false)
    }
  }

  const removeTraining = async () => {
    if (!canWrite || busy || selectedId == null || !selected) return
    if (!window.confirm(`Delete ${selected.record_no} — ${selected.title}?`)) return
    setBusy(true)
    try {
      await deleteEmployeeTraining(selectedId)
      showToast('Training deleted')
      setSelectedId(null)
      setCreating(false)
      setDraft(emptyTrainingInput())
      await loadTrainings()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete')
    } finally {
      setBusy(false)
    }
  }

  const addAttendee = async () => {
    if (!canWrite || busy || !attendeePickId) return
    const emp = activeEmployees.find((e) => e.id === attendeePickId)
    if (!emp) return

    if (creating) {
      if (draftAttendees.some((a) => a.employeeId === emp.id)) {
        showToast(`${emp.full_name} is already added`)
        return
      }
      setDraftAttendees((prev) => [...prev, { employeeId: emp.id, employeeName: emp.full_name }])
      setAttendeePickId('')
      return
    }

    if (selectedId == null) return
    setBusy(true)
    try {
      await upsertTrainingAttendee({
        trainingId: selectedId,
        employeeId: emp.id,
        employeeName: emp.full_name,
      })
      setAttendeePickId('')
      await loadDetail(selectedId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not add attendee')
    } finally {
      setBusy(false)
    }
  }

  const removeDraftAttendee = (employeeId: string) => {
    setDraftAttendees((prev) => prev.filter((a) => a.employeeId !== employeeId))
  }

  const toggleSignedOff = async (row: EmployeeTrainingAttendee) => {
    if (!canWrite || busy) return
    setBusy(true)
    try {
      await updateTrainingAttendee(row.id, {
        signed_off: !row.signed_off,
        signed_off_at: !row.signed_off ? todayIso() : null,
      })
      if (selectedId != null) await loadDetail(selectedId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update attendee')
    } finally {
      setBusy(false)
    }
  }

  const removeAttendee = async (row: EmployeeTrainingAttendee) => {
    if (!canWrite || busy) return
    if (!window.confirm(`Remove ${row.employee_name}?`)) return
    setBusy(true)
    try {
      await deleteTrainingAttendee(row.id)
      if (selectedId != null) await loadDetail(selectedId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not remove attendee')
    } finally {
      setBusy(false)
    }
  }

  const uploadDetailFile = async (fileList: FileList | null) => {
    if (!fileList?.length || !canWrite || busy || selectedId == null) return
    setBusy(true)
    try {
      for (const file of Array.from(fileList)) {
        await uploadTrainingFile({ file, kind: fileKind, trainingId: selectedId })
      }
      showToast(fileList.length > 1 ? 'Files uploaded' : 'File uploaded')
      await loadDetail(selectedId)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const uploadLibraryFile = async (fileList: FileList | null) => {
    if (!fileList?.length || !canWrite || busy) return
    setBusy(true)
    try {
      for (const file of Array.from(fileList)) {
        await uploadTrainingFile({ file, kind: libraryKind, trainingId: null })
      }
      showToast(fileList.length > 1 ? 'Files uploaded' : 'File uploaded')
      await loadLibrary()
    } catch (error) {
      showToast(errorMessage(error, 'Upload failed'))
    } finally {
      setBusy(false)
      if (libraryFileRef.current) libraryFileRef.current.value = ''
    }
  }

  const uploadEmployeeCertificate = async (fileList: FileList | null) => {
    if (!fileList?.length || !canWrite || busy || !selectedEmployeeId || certUploadTrainingId == null) return
    const file = fileList[0]
    if (!file) return
    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please upload a PDF certificate')
      return
    }
    setBusy(true)
    try {
      await uploadTrainingFile({
        file,
        kind: 'certificate',
        title: `${file.name.replace(/\.pdf$/i, '')} certificate`,
        trainingId: certUploadTrainingId,
        employeeId: selectedEmployeeId,
      })
      showToast('Certificate uploaded')
      await loadEmployeeDetail(selectedEmployeeId)
      await loadEmployeeRoster()
    } catch (error) {
      showToast(errorMessage(error, 'Could not upload certificate'))
    } finally {
      setBusy(false)
      setCertUploadTrainingId(null)
      if (certFileInputRef.current) certFileInputRef.current.value = ''
    }
  }

  const removeEmployeeCertificate = async (row: EmployeeTrainingFile) => {
    if (!canWrite || busy || !selectedEmployeeId) return
    if (!window.confirm(`Remove certificate “${row.file_name}”?`)) return
    setBusy(true)
    try {
      await deleteTrainingFile(row)
      await loadEmployeeDetail(selectedEmployeeId)
      await loadEmployeeRoster()
    } catch (error) {
      showToast(errorMessage(error, 'Could not delete certificate'))
    } finally {
      setBusy(false)
    }
  }

  const certificateForTraining = (trainingId: number | null | undefined) => {
    if (trainingId == null) return null
    return employeeCertificates.find((f) => f.training_id === trainingId) ?? null
  }

  const removeFile = async (row: EmployeeTrainingFile, from: 'detail' | 'library') => {
    if (!canWrite || busy) return
    if (!window.confirm(`Remove “${row.file_name}”?`)) return
    setBusy(true)
    try {
      await deleteTrainingFile(row)
      if (from === 'detail' && selectedId != null) await loadDetail(selectedId)
      if (from === 'library') await loadLibrary()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete file')
    } finally {
      setBusy(false)
    }
  }

  const saveSkill = async (skillKey: string, level: TrainingSkillLevel) => {
    if (!canWrite || busy || !selectedEmployeeId) return
    setBusy(true)
    try {
      await upsertEmployeeSkill({
        employeeId: selectedEmployeeId,
        skillKey,
        level,
        shopLocation,
      })
      await loadEmployeeDetail(selectedEmployeeId)
      await loadEmployeeRoster()
    } catch (error) {
      showToast(errorMessage(error, 'Could not save skill'))
    } finally {
      setBusy(false)
    }
  }

  const saveShopLocation = async () => {
    if (!canWrite || busy || !selectedEmployeeId) return
    setBusy(true)
    try {
      // Persist shop location on every skill row (or create a placeholder for gtc_training).
      const existing = skills[0]
      await upsertEmployeeSkill({
        employeeId: selectedEmployeeId,
        skillKey: existing?.skill_key ?? 'gtc_training',
        level: (existing?.level as TrainingSkillLevel) ?? '',
        shopLocation,
      })
      await loadEmployeeDetail(selectedEmployeeId)
      await loadEmployeeRoster()
      showToast('Shop location saved')
    } catch (error) {
      showToast(errorMessage(error, 'Could not save shop location'))
    } finally {
      setBusy(false)
    }
  }

  const skillLevelFor = (key: string): TrainingSkillLevel =>
    (skills.find((s) => s.skill_key === key)?.level as TrainingSkillLevel) ?? ''

  const renderTrainingTable = (list: EmployeeTraining[], emptyLabel: string) => (
    <div className="dashboard-table-wrap training-table-scroll">
      <table className="dashboard-table">
        <thead>
          <tr>
            <th>Record #</th>
            <th>Title</th>
            <th>Status</th>
            <th>Scheduled</th>
            <th>Completed</th>
            <th>Expires</th>
            <th>Trainer</th>
            <th>Department(s)</th>
          </tr>
        </thead>
        <tbody>
          {list.map((row) => (
            <tr
              key={row.id}
              className={selectedId === row.id ? 'training-row--selected' : undefined}
              onClick={() => openTraining(row)}
              style={{ cursor: 'pointer' }}
            >
              <td>
                <strong>{row.record_no}</strong>
              </td>
              <td>{row.title}</td>
              <td>
                <span className={`training-status-chip training-status-chip--${row.status}`}>
                  {trainingStatusLabel(row.status)}
                </span>
              </td>
              <td>{formatTrainingDate(row.scheduled_date)}</td>
              <td>{formatTrainingDate(row.completed_date)}</td>
              <td className={isTrainingExpired(row.recert_due_date) ? 'training-expired' : undefined}>
                {formatTrainingDate(row.recert_due_date)}
              </td>
              <td>{row.trainer_name || '—'}</td>
              <td>{row.departments || '—'}</td>
            </tr>
          ))}
          {!loading && list.length === 0 ? (
            <tr>
              <td colSpan={8} className="table-empty-cell">
                {emptyLabel}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )

  const renderDetail = () => {
    if (!creating && !selected) {
      return <p className="placeholder-copy">Select a training, or create a new one.</p>
    }

    return (
      <div className="training-detail">
        <div className="training-detail-header">
          <div>
            <p className="training-record-no">{creating ? 'New training' : selected?.record_no}</p>
            <h4 className="training-detail-title">{draft.title.trim() || 'Untitled training'}</h4>
          </div>
          <div className="training-detail-actions">
            {canWrite ? (
              <>
                <button type="button" className="button-primary" disabled={busy} onClick={() => void saveTraining()}>
                  {busy ? 'Saving…' : creating ? 'Create & assign TR#' : 'Save changes'}
                </button>
                {!creating && draft.status !== 'completed' ? (
                  <button type="button" className="button-secondary" disabled={busy} onClick={() => void markCompleted()}>
                    Mark completed
                  </button>
                ) : null}
                {!creating ? (
                  <button type="button" className="button-secondary danger" disabled={busy} onClick={() => void removeTraining()}>
                    Delete
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="training-form-grid">
          <label>
            Title
            <input
              value={draft.title}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="e.g. Calibrating Measurement tools"
            />
          </label>
          <label>
            Status
            <select
              value={draft.status}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as TrainingStatus }))}
            >
              {TRAINING_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <select
              value={draft.reason}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value as EmployeeTrainingInput['reason'] }))}
            >
              <option value="">—</option>
              {TRAINING_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trainer
            <input
              value={draft.trainer_name}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, trainer_name: e.target.value }))}
            />
          </label>
          <label>
            Department(s)
            <input
              value={draft.departments}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, departments: e.target.value }))}
              placeholder="e.g. Machinists, SRV"
            />
          </label>
          <label>
            CAR / NCMR #
            <input
              value={draft.car_number}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, car_number: e.target.value }))}
              placeholder="N/A"
            />
          </label>
          <label>
            Scheduled date
            <input
              type="date"
              value={draft.scheduled_date ?? ''}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, scheduled_date: e.target.value || null }))}
            />
          </label>
          <label>
            Completed date
            <input
              type="date"
              value={draft.completed_date ?? ''}
              disabled={!canWrite || busy}
              onChange={(e) => {
                const completed_date = e.target.value || null
                setDraft((d) => ({
                  ...d,
                  completed_date,
                  recert_due_date: computeRecertDueDate(completed_date, d.recert_interval),
                }))
              }}
            />
          </label>
          <label>
            Recert interval
            <select
              value={draft.recert_interval}
              disabled={!canWrite || busy}
              onChange={(e) => {
                const recert_interval = e.target.value as TrainingRecertInterval
                setDraft((d) => ({
                  ...d,
                  recert_interval,
                  recert_due_date: computeRecertDueDate(d.completed_date, recert_interval),
                }))
              }}
            >
              {TRAINING_RECERT_INTERVALS.map((interval) => (
                <option key={interval.value || 'none'} value={interval.value}>
                  {interval.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Expiration date
            <input
              type="date"
              value={draft.recert_due_date ?? ''}
              disabled={!canWrite || busy || !draft.recert_interval}
              onChange={(e) => setDraft((d) => ({ ...d, recert_due_date: e.target.value || null }))}
            />
          </label>
          <label className="training-form-full">
            Notes
            <textarea
              rows={3}
              value={draft.notes}
              disabled={!canWrite || busy}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>
        </div>

        <div className="training-subsection">
          <div className="training-subsection-head">
            <h5>Attendees</h5>
            {canWrite ? (
              <div className="training-inline-add">
                <select value={attendeePickId} disabled={busy} onChange={(e) => setAttendeePickId(e.target.value)}>
                  <option value="">Add employee…</option>
                  {availableAttendeeEmployees.map((e: Employee) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </select>
                <button type="button" className="button-secondary" disabled={busy || !attendeePickId} onClick={() => void addAttendee()}>
                  Add
                </button>
              </div>
            ) : null}
          </div>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Signed off</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {creating
                  ? draftAttendees.map((a) => (
                      <tr key={a.employeeId}>
                        <td>{a.employeeName}</td>
                        <td>{draft.status === 'completed' ? 'On create' : 'After create'}</td>
                        <td>—</td>
                        <td>
                          {canWrite ? (
                            <button
                              type="button"
                              className="button-secondary admin-list-btn danger"
                              disabled={busy}
                              onClick={() => removeDraftAttendee(a.employeeId)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  : attendees.map((a) => (
                      <tr key={a.id}>
                        <td>{a.employee_name}</td>
                        <td>
                          {canWrite ? (
                            <label className="training-check">
                              <input
                                type="checkbox"
                                checked={a.signed_off}
                                disabled={busy}
                                onChange={() => void toggleSignedOff(a)}
                              />
                              {a.signed_off ? 'Yes' : 'No'}
                            </label>
                          ) : a.signed_off ? (
                            'Yes'
                          ) : (
                            'No'
                          )}
                        </td>
                        <td>{formatTrainingDate(a.signed_off_at)}</td>
                        <td>
                          {canWrite ? (
                            <button
                              type="button"
                              className="button-secondary admin-list-btn danger"
                              disabled={busy}
                              onClick={() => void removeAttendee(a)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                {(creating ? draftAttendees.length === 0 : attendees.length === 0) ? (
                  <tr>
                    <td colSpan={4} className="table-empty-cell">
                      No attendees yet. Use the dropdown to add employees who attended.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {creating ? (
            <p className="placeholder-copy resources-hint" style={{ marginTop: '0.5rem' }}>
              Selected employees are saved with the training and will show on their Employee Records. A TR number is
              assigned when you create. Files can be uploaded after create.
            </p>
          ) : null}
        </div>

        {!creating && selectedId != null ? (
          <div className="training-subsection">
            <div className="training-subsection-head">
              <h5>Materials & tests</h5>
              {canWrite ? (
                <div className="training-inline-add">
                  <select value={fileKind} disabled={busy} onChange={(e) => setFileKind(e.target.value as TrainingFileKind)}>
                    {TRAINING_FILE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="button-secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                    Upload
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => void uploadDetailFile(e.target.files)}
                  />
                </div>
              ) : null}
            </div>
            <ul className="training-file-list">
              {files.map((f) => (
                <li key={f.id} className="training-file-row">
                  <span className="training-file-kind">{TRAINING_FILE_KINDS.find((k) => k.value === f.kind)?.label ?? f.kind}</span>
                  <a href={trainingFilePublicUrl(f.storage_path)} target="_blank" rel="noreferrer">
                    {f.title || f.file_name}
                  </a>
                  {canWrite ? (
                    <button type="button" className="button-secondary admin-list-btn danger" disabled={busy} onClick={() => void removeFile(f, 'detail')}>
                      Delete
                    </button>
                  ) : null}
                </li>
              ))}
              {files.length === 0 ? <li className="placeholder-copy">No files attached to this training.</li> : null}
            </ul>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <section className="dashboard-panel resources-panel training-panel">
      <div className="resources-module-header">
        <div>
          <h3 className="resources-module-title">Employee Training</h3>
          <p className="placeholder-copy resources-hint">
            Schedule sessions, document the training log with auto TR numbers, track employee qualifications, and store
            materials/tests.
          </p>
        </div>
        <button type="button" className="button-secondary resources-module-refresh" disabled={loading} onClick={() => void loadTrainings()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <nav className="training-tabs" aria-label="Employee training sections">
        {(
          [
            ['schedule', 'Schedule'],
            ['log', 'Training Log'],
            ['employees', 'Employee Records'],
            ['library', 'Library'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`training-tab${tab === id ? ' training-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'schedule' || tab === 'log' ? (
        <div className="training-split">
          <div className="training-list-pane">
            <div className="training-list-toolbar">
              <p className="status-breakdown-note">
                {tab === 'schedule'
                  ? `${scheduledRows.length} scheduled / in progress`
                  : `${logRows.length} completed / cancelled`}
              </p>
              {canWrite ? (
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    openCreate(tab === 'log' ? { status: 'completed', completed_date: todayIso(), scheduled_date: todayIso() } : undefined)
                    setTab(tab === 'log' ? 'log' : 'schedule')
                  }}
                >
                  {tab === 'schedule' ? '+ Schedule training' : '+ Add log entry'}
                </button>
              ) : null}
            </div>
            {loading ? <p className="placeholder-copy">Loading…</p> : null}
            {renderTrainingTable(
              tab === 'schedule' ? scheduledRows : logRows,
              tab === 'schedule' ? 'No scheduled trainings.' : 'No completed trainings yet.',
            )}
          </div>
          <div className="training-detail-pane">{renderDetail()}</div>
        </div>
      ) : null}

      {tab === 'employees' ? (
        <div className="training-split">
          <div className="training-list-pane">
            <div className="training-list-toolbar">
              <p className="placeholder-copy" style={{ margin: 0 }}>
                {activeEmployees.length} employee{activeEmployees.length === 1 ? '' : 's'}
              </p>
              <label className="training-employee-pick" style={{ minWidth: '12rem' }}>
                Search
                <input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Filter by name…"
                />
              </label>
            </div>
            <div className="dashboard-table-wrap training-table-scroll">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Shop</th>
                    <th>Trainings</th>
                    <th>Next expires</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeRoster.map((row) => (
                    <tr
                      key={row.employee.id}
                      className={selectedEmployeeId === row.employee.id ? 'training-row--selected' : undefined}
                      onClick={() => setSelectedEmployeeId(row.employee.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong>{row.employee.full_name}</strong>
                      </td>
                      <td>{row.shop || '—'}</td>
                      <td>{row.trainingCount}</td>
                      <td className={isTrainingExpired(row.nextExpires) ? 'training-expired' : undefined}>
                        {formatTrainingDate(row.nextExpires)}
                      </td>
                    </tr>
                  ))}
                  {employeeRoster.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="table-empty-cell">
                        {activeEmployees.length === 0 ? 'No active employees found.' : 'No employees match this search.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {selectedEmployeeId ? (
              <>
                <div className="training-form-grid" style={{ marginTop: '0.75rem' }}>
                  <label>
                    Shop location
                    <input
                      value={shopLocation}
                      disabled={!canWrite || busy}
                      onChange={(e) => setShopLocation(e.target.value)}
                      placeholder="FF / WF"
                    />
                  </label>
                  {canWrite ? (
                    <div className="training-detail-actions" style={{ alignItems: 'end' }}>
                      <button type="button" className="button-secondary" disabled={busy} onClick={() => void saveShopLocation()}>
                        Save location
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="dashboard-table-wrap" style={{ marginTop: '0.75rem' }}>
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Skill</th>
                        <th>Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TRAINING_SKILL_KEYS.map((skill) => (
                        <tr key={skill.key}>
                          <td>{skill.label}</td>
                          <td>
                            {canWrite ? (
                              <select
                                value={skillLevelFor(skill.key)}
                                disabled={busy}
                                onChange={(e) => void saveSkill(skill.key, e.target.value as TrainingSkillLevel)}
                              >
                                {TRAINING_SKILL_LEVELS.map((level) => (
                                  <option key={level.value || 'blank'} value={level.value}>
                                    {level.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              TRAINING_SKILL_LEVELS.find((l) => l.value === skillLevelFor(skill.key))?.label ?? '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="placeholder-copy">Loading employees…</p>
            )}
          </div>
          <div className="training-detail-pane">
            <h4 className="training-detail-title">
              Training history
              {selectedEmployeeId
                ? ` — ${activeEmployees.find((e) => e.id === selectedEmployeeId)?.full_name ?? ''}`
                : ''}
            </h4>
            {!selectedEmployeeId ? (
              <p className="placeholder-copy">Select an employee from the list.</p>
            ) : (
              <>
                <input
                  ref={certFileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => void uploadEmployeeCertificate(e.target.files)}
                />
                <div className="dashboard-table-wrap">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Record #</th>
                        <th>Title</th>
                        <th>Completed</th>
                        <th>Expires</th>
                        <th>Interval</th>
                        <th>Certificate</th>
                        <th>Signed off</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeHistory.map((row) => {
                        const cert = certificateForTraining(row.training_id)
                        const expires = row.training?.recert_due_date ?? null
                        return (
                          <tr key={row.id}>
                            <td>{row.training?.record_no ?? '—'}</td>
                            <td>{row.training?.title ?? '—'}</td>
                            <td>{formatTrainingDate(row.training?.completed_date ?? null)}</td>
                            <td className={isTrainingExpired(expires) ? 'training-expired' : undefined}>
                              {formatTrainingDate(expires)}
                            </td>
                            <td>{trainingRecertIntervalLabel(row.training?.recert_interval)}</td>
                            <td>
                              <div className="training-cert-actions">
                                {cert ? (
                                  <>
                                    <a
                                      href={trainingFilePublicUrl(cert.storage_path)}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      View PDF
                                    </a>
                                    {canWrite ? (
                                      <button
                                        type="button"
                                        className="button-secondary admin-list-btn danger"
                                        disabled={busy}
                                        onClick={() => void removeEmployeeCertificate(cert)}
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                  </>
                                ) : canWrite && row.training_id ? (
                                  <button
                                    type="button"
                                    className="button-secondary admin-list-btn"
                                    disabled={busy}
                                    onClick={() => {
                                      setCertUploadTrainingId(row.training_id)
                                      certFileInputRef.current?.click()
                                    }}
                                  >
                                    Upload PDF
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </div>
                            </td>
                            <td>{row.signed_off ? formatTrainingDate(row.signed_off_at) : 'No'}</td>
                          </tr>
                        )
                      })}
                      {employeeHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="table-empty-cell">
                            No trainings on file for this employee. Expiration fills in when a training has a
                            completed date and recert interval.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'library' ? (
        <div>
          <div className="training-list-toolbar">
            <label>
              Filter
              <select value={libraryFilter} onChange={(e) => setLibraryFilter(e.target.value as LibraryFilter)}>
                <option value="all">All</option>
                {TRAINING_FILE_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            {canWrite ? (
              <div className="training-inline-add">
                <select value={libraryKind} disabled={busy} onChange={(e) => setLibraryKind(e.target.value as TrainingFileKind)}>
                  {TRAINING_FILE_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="button-primary" disabled={busy} onClick={() => libraryFileRef.current?.click()}>
                  Upload to library
                </button>
                <input
                  ref={libraryFileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => void uploadLibraryFile(e.target.files)}
                />
              </div>
            ) : null}
          </div>
          <p className="placeholder-copy resources-hint">
            General materials and blank tests not tied to a single session. Attach session-specific files from a training
            detail.
          </p>
          <ul className="training-file-list">
            {libraryFiles.map((f) => (
              <li key={f.id} className="training-file-row">
                <span className="training-file-kind">{TRAINING_FILE_KINDS.find((k) => k.value === f.kind)?.label ?? f.kind}</span>
                <a href={trainingFilePublicUrl(f.storage_path)} target="_blank" rel="noreferrer">
                  {f.title || f.file_name}
                </a>
                {canWrite ? (
                  <button type="button" className="button-secondary admin-list-btn danger" disabled={busy} onClick={() => void removeFile(f, 'library')}>
                    Delete
                  </button>
                ) : null}
              </li>
            ))}
            {libraryFiles.length === 0 ? <li className="placeholder-copy">Library is empty.</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
