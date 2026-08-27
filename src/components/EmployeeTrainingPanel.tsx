import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from './ToastNotification'
import { useEmployees } from '../hooks/useEmployees'
import {
  TRAINING_FILE_KINDS,
  TRAINING_COURSE_SECTION_KINDS,
  TRAINING_REASONS,
  TRAINING_RECERT_INTERVALS,
  TRAINING_SKILL_KEYS,
  TRAINING_SKILL_LEVELS,
  TRAINING_STATUSES,
  computeRecertDueDate,
  createEmployeeTraining,
  createTrainingCourse,
  createTrainingHourEntry,
  createTrainingLibraryLink,
  deleteEmployeeTraining,
  deleteTrainingAttendee,
  deleteTrainingCourse,
  deleteTrainingFile,
  deleteTrainingHourEntry,
  emptyTrainingInput,
  formatTrainingDate,
  formatTrainingHours,
  groupTrainingFilesBySection,
  inputFromTraining,
  isTrainingExpired,
  isTrainingFileLink,
  daysUntilTrainingExpiration,
  listAllAttendeeTrainings,
  listAttendeeTrainingsForEmployee,
  listEmployeeSkills,
  listEmployeeTrainings,
  listTrainingAttendees,
  listTrainingCourses,
  listTrainingHourEntries,
  listTrainingFiles,
  trainingExpirationStatusLabel,
  trainingFileHref,
  trainingFileLabel,
  trainingHoursByAttendeeId,
  trainingRecertIntervalLabel,
  trainingStatusLabel,
  sumTrainingHours,
  updateEmployeeTraining,
  updateTrainingAttendee,
  updateTrainingCourse,
  updateTrainingFileMeta,
  uploadTrainingFile,
  upsertEmployeeSkill,
  upsertTrainingAttendee,
  type EmployeeTraining,
  type EmployeeTrainingAttendee,
  type EmployeeTrainingCourse,
  type EmployeeTrainingFile,
  type EmployeeTrainingHourEntry,
  type EmployeeTrainingInput,
  type EmployeeTrainingSkill,
  type TrainingFileKind,
  type TrainingRecertInterval,
  type TrainingSkillLevel,
  type TrainingStatus,
} from '../lib/employeeTraining'
import type { Employee } from '../types/employees'

type Tab = 'schedule' | 'log' | 'employees' | 'expiring' | 'library'
type LibraryFilter = 'all' | TrainingFileKind
type ExpiringWindow = 'overdue' | '30' | '60' | '90' | '180' | 'all'

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
  return /relation .* does not exist|Could not find the table|function .* does not exist|allocate_training_record_no|row-level security|employee_training|recert_interval|recert_due_date|certificate|external_url|library-links|employee_training_courses|course_id|employee_training_hour_entries/i.test(
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
  const [hourEntries, setHourEntries] = useState<EmployeeTrainingHourEntry[]>([])
  const [linkedCourseFiles, setLinkedCourseFiles] = useState<EmployeeTrainingFile[]>([])
  const [hourLogAttendeeId, setHourLogAttendeeId] = useState<number | null>(null)
  const [hourLogDate, setHourLogDate] = useState(() => todayIso())
  const [hourLogHours, setHourLogHours] = useState('')
  const [hourLogNotes, setHourLogNotes] = useState('')
  const [employeeHourEntries, setEmployeeHourEntries] = useState<EmployeeTrainingHourEntry[]>([])
  const [draftAttendees, setDraftAttendees] = useState<Array<{ employeeId: string; employeeName: string }>>([])
  const [files, setFiles] = useState<EmployeeTrainingFile[]>([])
  const [attendeePickId, setAttendeePickId] = useState('')
  const [fileKind, setFileKind] = useState<TrainingFileKind>('material')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [libraryFiles, setLibraryFiles] = useState<EmployeeTrainingFile[]>([])
  const [courses, setCourses] = useState<EmployeeTrainingCourse[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [newCourseTitle, setNewCourseTitle] = useState('')
  const [newCourseDescription, setNewCourseDescription] = useState('')
  const [editCourseTitle, setEditCourseTitle] = useState('')
  const [editCourseDescription, setEditCourseDescription] = useState('')
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all')
  const [libraryKind, setLibraryKind] = useState<TrainingFileKind>('material')
  const [librarySource, setLibrarySource] = useState<'file' | 'url'>('file')
  const [libraryTitle, setLibraryTitle] = useState('')
  const [libraryDescription, setLibraryDescription] = useState('')
  const [libraryUrl, setLibraryUrl] = useState('')
  const [editingLibraryId, setEditingLibraryId] = useState<number | null>(null)
  const [editLibraryTitle, setEditLibraryTitle] = useState('')
  const [editLibraryDescription, setEditLibraryDescription] = useState('')
  const [editLibraryUrl, setEditLibraryUrl] = useState('')
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
  const [expiringWindow, setExpiringWindow] = useState<ExpiringWindow>('90')
  const [expiringSearch, setExpiringSearch] = useState('')

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  )

  const courseFileCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const file of libraryFiles) {
      if (file.course_id == null) continue
      counts.set(file.course_id, (counts.get(file.course_id) ?? 0) + 1)
    }
    return counts
  }, [libraryFiles])

  const selectedCourseFiles = useMemo(
    () => (selectedCourseId == null ? [] : libraryFiles.filter((file) => file.course_id === selectedCourseId)),
    [libraryFiles, selectedCourseId],
  )

  const generalLibraryFiles = useMemo(
    () => libraryFiles.filter((file) => file.course_id == null),
    [libraryFiles],
  )

  const filteredGeneralLibraryFiles = useMemo(() => {
    if (libraryFilter === 'all') return generalLibraryFiles
    return generalLibraryFiles.filter((file) => file.kind === libraryFilter)
  }, [generalLibraryFiles, libraryFilter])

  const selectedCourseSections = useMemo(
    () => groupTrainingFilesBySection(selectedCourseFiles),
    [selectedCourseFiles],
  )

  const linkedCourse = useMemo(
    () => (draft.course_id ? courses.find((course) => course.id === draft.course_id) ?? null : null),
    [courses, draft.course_id],
  )

  const linkedCourseSections = useMemo(
    () => groupTrainingFilesBySection(linkedCourseFiles),
    [linkedCourseFiles],
  )

  const attendeeHoursById = useMemo(() => trainingHoursByAttendeeId(hourEntries), [hourEntries])

  const totalTrainingHours = useMemo(() => sumTrainingHours(hourEntries), [hourEntries])

  const employeeHoursByAttendeeId = useMemo(
    () => trainingHoursByAttendeeId(employeeHourEntries),
    [employeeHourEntries],
  )

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

  const expiringReportRows = useMemo(() => {
    const q = expiringSearch.trim().toLowerCase()
    const windowDays =
      expiringWindow === 'overdue' || expiringWindow === 'all' ? null : Number(expiringWindow)

    const rows = allAttendeeRows
      .map((row) => {
        const training = row.training
        const expires = training?.recert_due_date ?? null
        if (!training || !expires) return null
        if (training.status === 'cancelled') return null
        const daysUntil = daysUntilTrainingExpiration(expires)
        if (daysUntil == null) return null

        if (expiringWindow === 'overdue' && daysUntil >= 0) return null
        if (windowDays != null && (daysUntil < 0 || daysUntil > windowDays)) return null

        const employeeName = row.employee_name || activeEmployees.find((e) => e.id === row.employee_id)?.full_name || '—'
        if (
          q &&
          !employeeName.toLowerCase().includes(q) &&
          !training.title.toLowerCase().includes(q) &&
          !training.record_no.toLowerCase().includes(q) &&
          !(training.departments || '').toLowerCase().includes(q)
        ) {
          return null
        }

        return {
          attendeeId: row.id,
          employeeId: row.employee_id,
          employeeName,
          training,
          expires,
          daysUntil,
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => {
        if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil
        return a.employeeName.localeCompare(b.employeeName)
      })

    return rows
  }, [activeEmployees, allAttendeeRows, expiringSearch, expiringWindow])

  const expiringSummary = useMemo(() => {
    let overdue = 0
    let due30 = 0
    let due90 = 0
    for (const row of allAttendeeRows) {
      const expires = row.training?.recert_due_date
      if (!expires || row.training?.status === 'cancelled') continue
      const daysUntil = daysUntilTrainingExpiration(expires)
      if (daysUntil == null) continue
      if (daysUntil < 0) overdue += 1
      if (daysUntil >= 0 && daysUntil <= 30) due30 += 1
      if (daysUntil >= 0 && daysUntil <= 90) due90 += 1
    }
    return { overdue, due30, due90 }
  }, [allAttendeeRows])

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
        const [a, f] = await Promise.all([
          listTrainingAttendees(trainingId),
          listTrainingFiles({ trainingId }),
        ])
        setAttendees(a)
        setFiles(f)
        try {
          setHourEntries(await listTrainingHourEntries({ trainingId }))
        } catch (error) {
          setHourEntries([])
          const message = errorMessage(error, 'Could not load hour log')
          if (migrationHint(message)) showToast(message)
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not load training details')
        setAttendees([])
        setFiles([])
        setHourEntries([])
      }
    },
    [showToast],
  )

  const loadLibrary = useCallback(async () => {
    try {
      const [courseList, list] = await Promise.all([
        listTrainingCourses(),
        listTrainingFiles({
          libraryOnly: true,
        }),
      ])
      setCourses(courseList)
      setLibraryFiles(list)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load library'
      setCourses([])
      setLibraryFiles([])
      if (migrationHint(message)) {
        showToast(message.includes('courses') ? message : 'Run training migrations in Supabase, then refresh')
      } else {
        showToast(message)
      }
    }
  }, [showToast])

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
        setEmployeeHourEntries([])
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
        try {
          setEmployeeHourEntries(await listTrainingHourEntries({ employeeId }))
        } catch {
          setEmployeeHourEntries([])
        }
        setShopLocation(skillRows.find((s) => s.shop_location)?.shop_location ?? '')
      } catch (error) {
        showToast(errorMessage(error, 'Could not load employee training record'))
        setSkills([])
        setEmployeeHistory([])
        setEmployeeCertificates([])
        setEmployeeHourEntries([])
      }
    },
    [showToast],
  )

  useEffect(() => {
    void listTrainingCourses()
      .then(setCourses)
      .catch(() => setCourses([]))
  }, [])

  useEffect(() => {
    if (!draft.course_id) {
      setLinkedCourseFiles([])
      return
    }
    void listTrainingFiles({ courseId: draft.course_id })
      .then(setLinkedCourseFiles)
      .catch(() => setLinkedCourseFiles([]))
  }, [draft.course_id])

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
    if (tab === 'employees' || tab === 'expiring') void loadEmployeeRoster()
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
    cancelHourLog()
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

  const startHourLog = (attendee: EmployeeTrainingAttendee) => {
    setHourLogAttendeeId(attendee.id)
    setHourLogDate(todayIso())
    setHourLogHours('')
    setHourLogNotes('')
  }

  const cancelHourLog = () => {
    setHourLogAttendeeId(null)
    setHourLogDate(todayIso())
    setHourLogHours('')
    setHourLogNotes('')
  }

  const saveHourLog = async () => {
    if (!canWrite || busy || selectedId == null || hourLogAttendeeId == null) return
    const attendee = attendees.find((row) => row.id === hourLogAttendeeId)
    if (!attendee) return
    setBusy(true)
    try {
      await createTrainingHourEntry({
        attendeeId: attendee.id,
        trainingId: selectedId,
        employeeId: attendee.employee_id,
        sessionDate: hourLogDate,
        hours: hourLogHours,
        notes: hourLogNotes,
      })
      showToast(`Logged ${hourLogHours.trim()} hour${Number(hourLogHours) === 1 ? '' : 's'} for ${attendee.employee_name}`)
      cancelHourLog()
      await loadDetail(selectedId)
    } catch (error) {
      showToast(errorMessage(error, 'Could not log training hours'))
    } finally {
      setBusy(false)
    }
  }

  const removeHourEntry = async (entry: EmployeeTrainingHourEntry) => {
    if (!canWrite || busy || selectedId == null) return
    if (!window.confirm(`Remove ${formatTrainingHours(entry.hours)} hour log from ${formatTrainingDate(entry.session_date)}?`)) return
    setBusy(true)
    try {
      await deleteTrainingHourEntry(entry.id)
      await loadDetail(selectedId)
    } catch (error) {
      showToast(errorMessage(error, 'Could not remove hour log'))
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
        await uploadTrainingFile({
          file,
          kind: libraryKind,
          title: libraryTitle.trim() || undefined,
          notes: libraryDescription.trim() || undefined,
          trainingId: null,
          courseId: selectedCourseId,
        })
      }
      showToast(fileList.length > 1 ? 'Files uploaded' : 'File uploaded')
      setLibraryTitle('')
      setLibraryDescription('')
      await loadLibrary()
    } catch (error) {
      showToast(errorMessage(error, 'Upload failed'))
    } finally {
      setBusy(false)
      if (libraryFileRef.current) libraryFileRef.current.value = ''
    }
  }

  const addLibraryLink = async () => {
    if (!canWrite || busy) return
    setBusy(true)
    try {
      await createTrainingLibraryLink({
        url: libraryUrl,
        kind: libraryKind,
        title: libraryTitle,
        notes: libraryDescription,
        trainingId: null,
        courseId: selectedCourseId,
      })
      showToast('Link added to library')
      setLibraryUrl('')
      setLibraryTitle('')
      setLibraryDescription('')
      await loadLibrary()
    } catch (error) {
      const message = errorMessage(error, 'Could not add link')
      showToast(migrationHint(message) ? message : message)
    } finally {
      setBusy(false)
    }
  }

  const createCourse = async () => {
    if (!canWrite || busy) return
    setBusy(true)
    try {
      const created = await createTrainingCourse({
        title: newCourseTitle,
        description: newCourseDescription,
      })
      showToast(`Course created: ${created.title}`)
      setNewCourseTitle('')
      setNewCourseDescription('')
      await loadLibrary()
      setSelectedCourseId(created.id)
      setEditCourseTitle(created.title)
      setEditCourseDescription(created.description)
      cancelEditLibrary()
      setLibrarySource('file')
      setLibraryKind('material')
    } catch (error) {
      showToast(errorMessage(error, 'Could not create course'))
    } finally {
      setBusy(false)
    }
  }

  const openCourse = (courseId: number) => {
    const course = courses.find((row) => row.id === courseId)
    setSelectedCourseId(courseId)
    setEditCourseTitle(course?.title ?? '')
    setEditCourseDescription(course?.description ?? '')
    cancelEditLibrary()
    setLibrarySource('file')
    setLibraryKind('material')
  }

  const closeCourse = () => {
    setSelectedCourseId(null)
    setEditCourseTitle('')
    setEditCourseDescription('')
    cancelEditLibrary()
  }

  const saveCourseMeta = async () => {
    if (!canWrite || busy || selectedCourseId == null) return
    setBusy(true)
    try {
      await updateTrainingCourse(selectedCourseId, {
        title: editCourseTitle,
        description: editCourseDescription,
      })
      showToast('Course updated')
      await loadLibrary()
    } catch (error) {
      showToast(errorMessage(error, 'Could not update course'))
    } finally {
      setBusy(false)
    }
  }

  const removeCourse = async (course: EmployeeTrainingCourse) => {
    if (!canWrite || busy) return
    if (!window.confirm(`Delete course “${course.title}” and all of its materials?`)) return
    setBusy(true)
    try {
      await deleteTrainingCourse(course.id)
      if (selectedCourseId === course.id) closeCourse()
      showToast('Course deleted')
      await loadLibrary()
    } catch (error) {
      showToast(errorMessage(error, 'Could not delete course'))
    } finally {
      setBusy(false)
    }
  }

  const startEditLibrary = (row: EmployeeTrainingFile) => {
    setEditingLibraryId(row.id)
    setEditLibraryTitle(row.title || row.file_name)
    setEditLibraryDescription(row.notes || '')
    setEditLibraryUrl(row.external_url || '')
  }

  const cancelEditLibrary = () => {
    setEditingLibraryId(null)
    setEditLibraryTitle('')
    setEditLibraryDescription('')
    setEditLibraryUrl('')
  }

  const saveLibraryMeta = async (row: EmployeeTrainingFile) => {
    if (!canWrite || busy) return
    setBusy(true)
    try {
      await updateTrainingFileMeta(row.id, {
        title: editLibraryTitle,
        notes: editLibraryDescription,
        ...(isTrainingFileLink(row) ? { external_url: editLibraryUrl } : {}),
      })
      showToast('Resource updated')
      cancelEditLibrary()
      await loadLibrary()
    } catch (error) {
      showToast(errorMessage(error, 'Could not update resource'))
    } finally {
      setBusy(false)
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
    if (!window.confirm(`Remove “${trainingFileLabel(row)}”?`)) return
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

  const exportExpiringCsv = () => {
    const header = [
      'Employee',
      'Record #',
      'Title',
      'Completed',
      'Expires',
      'Days until / overdue',
      'Status',
      'Interval',
      'Department(s)',
      'Trainer',
    ]
    const lines = expiringReportRows.map((row) =>
      [
        row.employeeName,
        row.training.record_no,
        row.training.title,
        row.training.completed_date ?? '',
        row.expires,
        String(row.daysUntil),
        trainingExpirationStatusLabel(row.daysUntil),
        trainingRecertIntervalLabel(row.training.recert_interval),
        row.training.departments || '',
        row.training.trainer_name || '',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `training-recert-expiring-${todayIso()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`Exported ${expiringReportRows.length} row${expiringReportRows.length === 1 ? '' : 's'}`)
  }

  const librarySectionKinds = selectedCourseId ? TRAINING_COURSE_SECTION_KINDS : TRAINING_FILE_KINDS

  const renderLibraryFileRow = (f: EmployeeTrainingFile) => (
    <li key={f.id} className="training-file-row training-library-row">
      {editingLibraryId === f.id ? (
        <div className="training-library-edit">
          <label>
            Title
            <input
              type="text"
              value={editLibraryTitle}
              disabled={busy}
              onChange={(e) => setEditLibraryTitle(e.target.value)}
            />
          </label>
          <label>
            Description
            <input
              type="text"
              value={editLibraryDescription}
              disabled={busy}
              onChange={(e) => setEditLibraryDescription(e.target.value)}
            />
          </label>
          {isTrainingFileLink(f) ? (
            <label>
              URL
              <input
                type="url"
                value={editLibraryUrl}
                disabled={busy}
                onChange={(e) => setEditLibraryUrl(e.target.value)}
              />
            </label>
          ) : null}
          <div className="training-library-edit-actions">
            <button type="button" className="button-primary" disabled={busy} onClick={() => void saveLibraryMeta(f)}>
              Save
            </button>
            <button type="button" className="button-secondary" disabled={busy} onClick={cancelEditLibrary}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <span className="training-file-kind">
            {isTrainingFileLink(f) ? 'Link · ' : ''}
            {TRAINING_FILE_KINDS.find((k) => k.value === f.kind)?.label ?? f.kind}
          </span>
          <div className="training-file-main">
            <a href={trainingFileHref(f)} target="_blank" rel="noreferrer">
              {trainingFileLabel(f)}
            </a>
            {f.notes.trim() ? <p className="training-file-desc">{f.notes}</p> : null}
          </div>
          {canWrite ? (
            <div className="training-file-actions">
              <button
                type="button"
                className="button-secondary admin-list-btn"
                disabled={busy}
                onClick={() => startEditLibrary(f)}
              >
                Edit
              </button>
              <button
                type="button"
                className="button-secondary admin-list-btn danger"
                disabled={busy}
                onClick={() => void removeFile(f, 'library')}
              >
                Delete
              </button>
            </div>
          ) : null}
        </>
      )}
    </li>
  )

  const renderLibraryAddForm = (heading: string) =>
    canWrite ? (
      <div className="training-library-add">
        <h5 className="training-library-add-title">{heading}</h5>
        <div className="training-library-add-mode" role="group" aria-label="Add library item type">
          <button
            type="button"
            className={`button-secondary${librarySource === 'file' ? ' is-active' : ''}`}
            disabled={busy}
            onClick={() => setLibrarySource('file')}
          >
            Upload file
          </button>
          <button
            type="button"
            className={`button-secondary${librarySource === 'url' ? ' is-active' : ''}`}
            disabled={busy}
            onClick={() => setLibrarySource('url')}
          >
            Add URL link
          </button>
        </div>
        <div className="training-library-add-grid">
          <label>
            Section
            <select
              value={libraryKind}
              disabled={busy}
              onChange={(e) => setLibraryKind(e.target.value as TrainingFileKind)}
            >
              {librarySectionKinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              type="text"
              value={libraryTitle}
              disabled={busy}
              placeholder={
                librarySource === 'url' ? 'Optional — defaults to site name' : 'Optional — defaults to file name'
              }
              onChange={(e) => setLibraryTitle(e.target.value)}
            />
          </label>
          <label className="training-form-full">
            Description
            <input
              type="text"
              value={libraryDescription}
              disabled={busy}
              placeholder="What this resource is for"
              onChange={(e) => setLibraryDescription(e.target.value)}
            />
          </label>
          {librarySource === 'url' ? (
            <label className="training-form-full">
              URL
              <input
                type="url"
                value={libraryUrl}
                disabled={busy}
                placeholder="https://…"
                onChange={(e) => setLibraryUrl(e.target.value)}
              />
            </label>
          ) : null}
        </div>
        <div className="training-library-add-actions">
          {librarySource === 'file' ? (
            <>
              <button
                type="button"
                className="button-primary"
                disabled={busy}
                onClick={() => libraryFileRef.current?.click()}
              >
                {selectedCourseId ? 'Add file to course' : 'Upload to library'}
              </button>
              <input
                ref={libraryFileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => void uploadLibraryFile(e.target.files)}
              />
            </>
          ) : (
            <button
              type="button"
              className="button-primary"
              disabled={busy || !libraryUrl.trim()}
              onClick={() => void addLibraryLink()}
            >
              {selectedCourseId ? 'Add link to course' : 'Add link to library'}
            </button>
          )}
        </div>
      </div>
    ) : null

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
            Library course
            <select
              value={draft.course_id ?? ''}
              disabled={!canWrite || busy}
              onChange={(e) => {
                const nextCourseId = e.target.value ? Number(e.target.value) : null
                setDraft((d) => ({
                  ...d,
                  course_id: nextCourseId,
                  title:
                    d.title.trim() || !nextCourseId
                      ? d.title
                      : (courses.find((course) => course.id === nextCourseId)?.title ?? d.title),
                }))
              }}
            >
              <option value="">— No library course —</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
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
            <div>
              <h5>Attendees</h5>
              {!creating && attendees.length > 0 ? (
                <p className="placeholder-copy training-hours-summary">
                  Total logged on this training: {formatTrainingHours(totalTrainingHours)} hour
                  {totalTrainingHours === 1 ? '' : 's'}
                </p>
              ) : null}
            </div>
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
                  <th>Hours logged</th>
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
                        <td>—</td>
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
                        <td className="training-hours-cell">
                          <strong>{formatTrainingHours(attendeeHoursById.get(a.id) ?? 0)}</strong>
                          {canWrite ? (
                            <button
                              type="button"
                              className="button-secondary admin-list-btn"
                              disabled={busy}
                              onClick={() => startHourLog(a)}
                            >
                              Log hours
                            </button>
                          ) : null}
                        </td>
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
                    <td colSpan={5} className="table-empty-cell">
                      No attendees yet. Use the dropdown to add employees who attended.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {!creating && hourLogAttendeeId != null ? (
            <div className="training-hour-log-form">
              <h6>
                Log hours for {attendees.find((row) => row.id === hourLogAttendeeId)?.employee_name ?? 'attendee'}
              </h6>
              <div className="training-library-add-grid">
                <label>
                  Session date
                  <input type="date" value={hourLogDate} disabled={busy} onChange={(e) => setHourLogDate(e.target.value)} />
                </label>
                <label>
                  Hours
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={hourLogHours}
                    disabled={busy}
                    placeholder="2"
                    onChange={(e) => setHourLogHours(e.target.value)}
                  />
                </label>
                <label className="training-form-full">
                  Notes
                  <input
                    type="text"
                    value={hourLogNotes}
                    disabled={busy}
                    placeholder="Optional — what was covered"
                    onChange={(e) => setHourLogNotes(e.target.value)}
                  />
                </label>
              </div>
              <div className="training-library-edit-actions">
                <button type="button" className="button-primary" disabled={busy || !hourLogHours.trim()} onClick={() => void saveHourLog()}>
                  Save hours
                </button>
                <button type="button" className="button-secondary" disabled={busy} onClick={cancelHourLog}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {!creating && hourEntries.length > 0 ? (
            <div className="training-hour-log-history">
              <h6>Hour log</h6>
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Employee</th>
                      <th>Hours</th>
                      <th>Notes</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {hourEntries.map((entry) => {
                      const attendee = attendees.find((row) => row.id === entry.attendee_id)
                      return (
                        <tr key={entry.id}>
                          <td>{formatTrainingDate(entry.session_date)}</td>
                          <td>{attendee?.employee_name ?? '—'}</td>
                          <td>{formatTrainingHours(entry.hours)}</td>
                          <td>{entry.notes.trim() || '—'}</td>
                          <td>
                            {canWrite ? (
                              <button
                                type="button"
                                className="button-secondary admin-list-btn danger"
                                disabled={busy}
                                onClick={() => void removeHourEntry(entry)}
                              >
                                Delete
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {creating ? (
            <p className="placeholder-copy resources-hint" style={{ marginTop: '0.5rem' }}>
              Selected employees are saved with the training and will show on their Employee Records. A TR number is
              assigned when you create. Files can be uploaded after create.
            </p>
          ) : null}
        </div>

        {!creating && draft.course_id ? (
          <div className="training-subsection">
            <div className="training-subsection-head">
              <div>
                <h5>Course package materials</h5>
                <p className="placeholder-copy">
                  From Library course {linkedCourse ? `“${linkedCourse.title}”` : ''}. Update the master package under
                  the Library tab.
                </p>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => {
                    setTab('library')
                    openCourse(draft.course_id!)
                  }}
                >
                  Open in Library
                </button>
              ) : null}
            </div>
            {linkedCourseSections.some((section) => section.files.length > 0) ? (
              <div className="training-library-sections">
                {linkedCourseSections.map((section) =>
                  section.files.length > 0 ? (
                    <section key={section.kind} className="training-library-section">
                      <h5>{section.label}</h5>
                      <ul className="training-file-list">
                        {section.files.map((file) => (
                          <li key={file.id} className="training-file-row">
                            <span className="training-file-kind">
                              {isTrainingFileLink(file) ? 'Link · ' : ''}
                              {TRAINING_FILE_KINDS.find((k) => k.value === file.kind)?.label ?? file.kind}
                            </span>
                            <div className="training-file-main">
                              <a href={trainingFileHref(file)} target="_blank" rel="noreferrer">
                                {trainingFileLabel(file)}
                              </a>
                              {file.notes.trim() ? <p className="training-file-desc">{file.notes}</p> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="placeholder-copy">
                This course does not have any materials in the Library yet. Use Open in Library to add agenda, tests,
                PDFs, and links.
              </p>
            )}
          </div>
        ) : null}

        {!creating && selectedId != null ? (
          <div className="training-subsection">
            <div className="training-subsection-head">
              <h5>Session files</h5>
              <p className="placeholder-copy">Uploads tied to this TR record only (completed tests, sign-offs, etc.).</p>
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
                  <a href={trainingFileHref(f)} target="_blank" rel="noreferrer">
                    {trainingFileLabel(f)}
                  </a>
                  {f.notes.trim() ? <span className="training-file-desc">{f.notes}</span> : null}
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
            ['expiring', 'Expiring'],
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
            {id === 'expiring' && expiringSummary.overdue > 0 ? (
              <span className="training-tab-badge">{expiringSummary.overdue}</span>
            ) : null}
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

      {tab === 'expiring' ? (
        <div className="training-detail">
          <div className="training-list-toolbar">
            <div className="training-expiring-summary">
              <span className="training-expiring-stat training-expiring-stat--overdue">
                {expiringSummary.overdue} overdue
              </span>
              <span className="training-expiring-stat">{expiringSummary.due30} due in 30 days</span>
              <span className="training-expiring-stat">{expiringSummary.due90} due in 90 days</span>
            </div>
            <div className="training-inline-add">
              <label>
                Window
                <select value={expiringWindow} onChange={(e) => setExpiringWindow(e.target.value as ExpiringWindow)}>
                  <option value="overdue">Overdue only</option>
                  <option value="30">Next 30 days</option>
                  <option value="60">Next 60 days</option>
                  <option value="90">Next 90 days</option>
                  <option value="180">Next 180 days</option>
                  <option value="all">All with expiration</option>
                </select>
              </label>
              <label>
                Search
                <input
                  value={expiringSearch}
                  onChange={(e) => setExpiringSearch(e.target.value)}
                  placeholder="Employee, TR#, title…"
                />
              </label>
              <button
                type="button"
                className="button-secondary"
                disabled={expiringReportRows.length === 0}
                onClick={exportExpiringCsv}
              >
                Export CSV
              </button>
            </div>
          </div>
          <p className="placeholder-copy resources-hint" style={{ marginTop: '0.35rem' }}>
            Shows each employee on a completed training with an expiration date. Sorted soonest first — overdue at the
            top.
          </p>
          <div className="dashboard-table-wrap training-table-scroll" style={{ marginTop: '0.75rem' }}>
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Record #</th>
                  <th>Title</th>
                  <th>Completed</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Interval</th>
                  <th>Department(s)</th>
                </tr>
              </thead>
              <tbody>
                {expiringReportRows.map((row) => (
                  <tr
                    key={row.attendeeId}
                    className={row.daysUntil < 0 ? 'training-row--expired' : undefined}
                    onClick={() => {
                      openTraining(row.training)
                      setTab('log')
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{row.employeeName}</strong>
                    </td>
                    <td>{row.training.record_no}</td>
                    <td>{row.training.title}</td>
                    <td>{formatTrainingDate(row.training.completed_date)}</td>
                    <td className={row.daysUntil < 0 ? 'training-expired' : undefined}>
                      {formatTrainingDate(row.expires)}
                    </td>
                    <td className={row.daysUntil < 0 ? 'training-expired' : undefined}>
                      {trainingExpirationStatusLabel(row.daysUntil)}
                    </td>
                    <td>{trainingRecertIntervalLabel(row.training.recert_interval)}</td>
                    <td>{row.training.departments || '—'}</td>
                  </tr>
                ))}
                {expiringReportRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty-cell">
                      No trainings match this window. Add a recert interval on completed trainings so expiration dates
                      populate.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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
                        <th>Hours</th>
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
                        const hoursLogged = employeeHoursByAttendeeId.get(row.id) ?? 0
                        return (
                          <tr key={row.id}>
                            <td>{row.training?.record_no ?? '—'}</td>
                            <td>{row.training?.title ?? '—'}</td>
                            <td>{formatTrainingHours(hoursLogged)}</td>
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
                                      href={trainingFileHref(cert)}
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
                          <td colSpan={8} className="table-empty-cell">
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
        <div className="training-library-page">
          {selectedCourseId && selectedCourse ? (
            <>
              <div className="training-library-course-head">
                <button type="button" className="button-secondary" disabled={busy} onClick={closeCourse}>
                  ← All courses
                </button>
                <div className="training-library-course-meta">
                  <h4 className="training-detail-title">{selectedCourse.title}</h4>
                  {selectedCourse.description.trim() ? (
                    <p className="placeholder-copy">{selectedCourse.description}</p>
                  ) : null}
                  <p className="training-library-course-count">
                    {selectedCourseFiles.length} resource{selectedCourseFiles.length === 1 ? '' : 's'}
                  </p>
                </div>
                {canWrite ? (
                  <div className="training-library-course-edit">
                    <label>
                      Course title
                      <input
                        type="text"
                        value={editCourseTitle}
                        disabled={busy}
                        onChange={(e) => setEditCourseTitle(e.target.value)}
                      />
                    </label>
                    <label>
                      Course description
                      <input
                        type="text"
                        value={editCourseDescription}
                        disabled={busy}
                        placeholder="What this class covers"
                        onChange={(e) => setEditCourseDescription(e.target.value)}
                      />
                    </label>
                    <div className="training-library-edit-actions">
                      <button type="button" className="button-secondary" disabled={busy} onClick={() => void saveCourseMeta()}>
                        Save course
                      </button>
                      <button
                        type="button"
                        className="button-secondary admin-list-btn danger"
                        disabled={busy}
                        onClick={() => void removeCourse(selectedCourse)}
                      >
                        Delete course
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              {renderLibraryAddForm('Add to this course')}
              <div className="training-library-sections">
                {selectedCourseSections.map((section) => (
                  <section key={section.kind} className="training-library-section">
                    <h5>{section.label}</h5>
                    {section.files.length > 0 ? (
                      <ul className="training-file-list">{section.files.map((file) => renderLibraryFileRow(file))}</ul>
                    ) : (
                      <p className="placeholder-copy">No {section.label.toLowerCase()} yet.</p>
                    )}
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="training-list-toolbar">
                <label>
                  Filter resources
                  <select value={libraryFilter} onChange={(e) => setLibraryFilter(e.target.value as LibraryFilter)}>
                    <option value="all">All types</option>
                    {TRAINING_FILE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="placeholder-copy resources-hint">
                Create a course package to hold materials, agenda, tests, and links for a class like Gate Valve
                Training. Session-specific completed tests and sign-offs still attach from Schedule / Training Log.
              </p>
              {canWrite ? (
                <div className="training-library-create-course">
                  <h5>New course</h5>
                  <div className="training-library-add-grid">
                    <label>
                      Course title
                      <input
                        type="text"
                        value={newCourseTitle}
                        disabled={busy}
                        placeholder="Gate Valve Training"
                        onChange={(e) => setNewCourseTitle(e.target.value)}
                      />
                    </label>
                    <label>
                      Description
                      <input
                        type="text"
                        value={newCourseDescription}
                        disabled={busy}
                        placeholder="What this class covers"
                        onChange={(e) => setNewCourseDescription(e.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={busy || !newCourseTitle.trim()}
                    onClick={() => void createCourse()}
                  >
                    Create course
                  </button>
                </div>
              ) : null}
              <div className="training-library-course-grid">
                {courses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    className="training-library-course-card"
                    disabled={busy}
                    onClick={() => openCourse(course.id)}
                  >
                    <strong>{course.title}</strong>
                    {course.description.trim() ? <span>{course.description}</span> : null}
                    <em>
                      {courseFileCounts.get(course.id) ?? 0} resource
                      {(courseFileCounts.get(course.id) ?? 0) === 1 ? '' : 's'}
                    </em>
                  </button>
                ))}
                {courses.length === 0 ? (
                  <p className="placeholder-copy training-library-empty-courses">
                    No courses yet. Create one to start building a class material package.
                  </p>
                ) : null}
              </div>
              <div className="training-library-general">
                <div className="training-subsection-head">
                  <h5>General library</h5>
                  <p className="placeholder-copy">Resources not assigned to a course.</p>
                </div>
                {renderLibraryAddForm('Add general resource')}
                <ul className="training-file-list">
                  {filteredGeneralLibraryFiles.map((file) => renderLibraryFileRow(file))}
                  {filteredGeneralLibraryFiles.length === 0 ? (
                    <li className="placeholder-copy">No general library resources yet.</li>
                  ) : null}
                </ul>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
