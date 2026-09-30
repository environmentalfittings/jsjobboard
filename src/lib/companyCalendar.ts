import { TERMINAL_STATUSES } from '../constants/statuses'
import type { Organization } from '../types/organizations'
import type { CompanyWorkflowKey } from '../constants/companyWorkflows'
import { filterTrainingsForCompany, filterValvesForCompany } from './companyDataScope'
import { listEmployeeTrainings, type EmployeeTraining } from './employeeTraining'
import { fetchAllValves } from './fetchAllValves'
import { supabase } from './supabase'
import type { Valve } from '../types'

const LOCAL_EVENTS_KEY = 'js-job-board-company-calendar-events-v1'

export type CalendarItemKind = 'event' | 'training' | 'due'

export type CompanyCalendarEvent = {
  id: string
  company_key: string
  organization_id: string | null
  event_date: string
  end_date: string | null
  title: string
  details: string
  all_day: boolean
  created_by_name: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
  /** True when stored only in this browser (migration not applied yet). */
  localOnly?: boolean
}

export type CalendarDayItem = {
  id: string
  kind: CalendarItemKind
  date: string
  title: string
  subtitle?: string
  href?: string
  event?: CompanyCalendarEvent
  valveId?: string
  valveRowId?: number
  trainingId?: number
}

export type CalendarEventInput = {
  event_date: string
  end_date?: string | null
  title: string
  details?: string
  all_day?: boolean
  created_by_name?: string | null
  created_by_user_id?: string | null
}

function todayIso() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function companyKeyForCalendar(options: {
  workflowKey: CompanyWorkflowKey
  activeOrganization: Organization | null
}): string {
  if (options.activeOrganization?.slug) return options.activeOrganization.slug
  return options.workflowKey === 'vsi' ? 'vsi' : 'js-valve'
}

function readLocalEvents(): CompanyCalendarEvent[] {
  try {
    const raw = localStorage.getItem(LOCAL_EVENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CompanyCalendarEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLocalEvents(events: CompanyCalendarEvent[]) {
  localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events))
}

function mapEventRow(row: Record<string, unknown>, localOnly = false): CompanyCalendarEvent {
  return {
    id: String(row.id),
    company_key: String(row.company_key ?? 'js-valve'),
    organization_id: row.organization_id == null ? null : String(row.organization_id),
    event_date: String(row.event_date ?? '').slice(0, 10),
    end_date: row.end_date == null ? null : String(row.end_date).slice(0, 10),
    title: String(row.title ?? '').trim(),
    details: String(row.details ?? ''),
    all_day: row.all_day !== false,
    created_by_name: row.created_by_name == null ? null : String(row.created_by_name),
    created_by_user_id: row.created_by_user_id == null ? null : String(row.created_by_user_id),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    localOnly,
  }
}

function isMissingCalendarTable(message: string) {
  return /company_calendar_events|schema cache|does not exist/i.test(message)
}

export async function listCompanyCalendarEvents(options: {
  companyKey: string
  organizationId?: string | null
  startDate: string
  endDate: string
}): Promise<{ events: CompanyCalendarEvent[]; usedLocal: boolean }> {
  // Fetch a slightly wider window so multi-day events that started earlier still appear.
  const { data, error } = await supabase
    .from('company_calendar_events')
    .select('*')
    .eq('company_key', options.companyKey)
    .lte('event_date', options.endDate)
    .order('event_date', { ascending: true })
    .limit(2000)

  if (!error) {
    const events = ((data ?? []) as Record<string, unknown>[])
      .map((row) => mapEventRow(row))
      .filter((event) => {
        const end = event.end_date || event.event_date
        return end >= options.startDate && event.event_date <= options.endDate
      })
    return { events, usedLocal: false }
  }

  if (!isMissingCalendarTable(error.message)) {
    throw new Error(error.message)
  }

  const local = readLocalEvents().filter((event) => {
    if (event.company_key !== options.companyKey) return false
    const start = event.event_date
    const end = event.end_date || event.event_date
    return end >= options.startDate && start <= options.endDate
  })
  return { events: local.map((e) => ({ ...e, localOnly: true })), usedLocal: true }
}

export async function createCompanyCalendarEvent(
  options: {
    companyKey: string
    organizationId?: string | null
  } & CalendarEventInput,
): Promise<{ event: CompanyCalendarEvent; usedLocal: boolean }> {
  const title = options.title.trim()
  if (!title) throw new Error('Title is required')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.event_date)) throw new Error('Event date is required')

  const payload = {
    company_key: options.companyKey,
    organization_id: options.organizationId ?? null,
    event_date: options.event_date,
    end_date: options.end_date || null,
    title,
    details: (options.details ?? '').trim(),
    all_day: options.all_day !== false,
    created_by_name: options.created_by_name ?? null,
    created_by_user_id: options.created_by_user_id ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase.from('company_calendar_events').insert(payload).select('*').single()
  if (!error && data) {
    return { event: mapEventRow(data as Record<string, unknown>), usedLocal: false }
  }
  if (error && !isMissingCalendarTable(error.message)) {
    throw new Error(error.message)
  }

  const localEvent: CompanyCalendarEvent = {
    id: crypto.randomUUID(),
    company_key: options.companyKey,
    organization_id: options.organizationId ?? null,
    event_date: options.event_date,
    end_date: options.end_date || null,
    title,
    details: (options.details ?? '').trim(),
    all_day: options.all_day !== false,
    created_by_name: options.created_by_name ?? null,
    created_by_user_id: options.created_by_user_id ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    localOnly: true,
  }
  writeLocalEvents([...readLocalEvents(), localEvent])
  return { event: localEvent, usedLocal: true }
}

export async function updateCompanyCalendarEvent(
  id: string,
  patch: CalendarEventInput,
): Promise<{ event: CompanyCalendarEvent; usedLocal: boolean }> {
  const title = patch.title.trim()
  if (!title) throw new Error('Title is required')

  const payload = {
    event_date: patch.event_date,
    end_date: patch.end_date || null,
    title,
    details: (patch.details ?? '').trim(),
    all_day: patch.all_day !== false,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('company_calendar_events')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (!error && data) {
    return { event: mapEventRow(data as Record<string, unknown>), usedLocal: false }
  }
  if (error && !isMissingCalendarTable(error.message)) {
    throw new Error(error.message)
  }

  const next = readLocalEvents().map((event) =>
    event.id === id
      ? {
          ...event,
          ...payload,
          end_date: payload.end_date,
          localOnly: true,
        }
      : event,
  )
  writeLocalEvents(next)
  const updated = next.find((event) => event.id === id)
  if (!updated) throw new Error('Event not found')
  return { event: updated, usedLocal: true }
}

export async function deleteCompanyCalendarEvent(id: string): Promise<{ usedLocal: boolean }> {
  const { error } = await supabase.from('company_calendar_events').delete().eq('id', id)
  if (!error) return { usedLocal: false }
  if (!isMissingCalendarTable(error.message)) throw new Error(error.message)

  writeLocalEvents(readLocalEvents().filter((event) => event.id !== id))
  return { usedLocal: true }
}

function eachDateInclusive(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${start}T12:00:00`)
  const last = new Date(`${end}T12:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return dates
  while (cursor.getTime() <= last.getTime()) {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function eventItems(events: CompanyCalendarEvent[]): CalendarDayItem[] {
  const items: CalendarDayItem[] = []
  for (const event of events) {
    const dates = eachDateInclusive(event.event_date, event.end_date || event.event_date)
    for (const date of dates) {
      items.push({
        id: `event:${event.id}:${date}`,
        kind: 'event',
        date,
        title: event.title,
        subtitle: event.details.trim() || undefined,
        event,
      })
    }
  }
  return items
}

function trainingItems(trainings: EmployeeTraining[], startDate: string, endDate: string): CalendarDayItem[] {
  const items: CalendarDayItem[] = []
  for (const training of trainings) {
    if (training.status === 'cancelled') continue
    const date = (training.scheduled_date || training.completed_date || '').slice(0, 10)
    if (!date || date < startDate || date > endDate) continue
    const label =
      training.status === 'completed'
        ? `Training done: ${training.title}`
        : `Training: ${training.title}`
    items.push({
      id: `training:${training.id}:${date}`,
      kind: 'training',
      date,
      title: label,
      subtitle: training.record_no + (training.departments ? ` · ${training.departments}` : ''),
      trainingId: training.id,
      href: '/resources',
    })
  }
  return items
}

function dueDateItems(valves: Valve[], startDate: string, endDate: string): CalendarDayItem[] {
  const items: CalendarDayItem[] = []
  const today = todayIso()
  for (const valve of valves) {
    if (TERMINAL_STATUSES.has(valve.status)) continue
    const due = (valve.due_date ?? '').slice(0, 10)
    if (!due || due < startDate || due > endDate) continue
    const overdue = due < today
    items.push({
      id: `due:${valve.id}:${due}`,
      kind: 'due',
      date: due,
      title: `${overdue ? 'Overdue' : 'Due'}: ${valve.valve_id}`,
      subtitle: [valve.customer, valve.cell, valve.status].filter(Boolean).join(' · ') || undefined,
      valveId: valve.valve_id,
      valveRowId: valve.id,
      href: `/job-board?open=${valve.id}`,
    })
  }
  return items
}

export async function loadCompanyCalendarMonth(options: {
  workflowKey: CompanyWorkflowKey
  activeOrganization: Organization | null
  year: number
  monthIndex: number // 0-based
}): Promise<{
  items: CalendarDayItem[]
  events: CompanyCalendarEvent[]
  usedLocalEvents: boolean
  startDate: string
  endDate: string
}> {
  const start = new Date(options.year, options.monthIndex, 1)
  const end = new Date(options.year, options.monthIndex + 1, 0)
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  const companyKey = companyKeyForCalendar(options)
  const companyScope = {
    workflowKey: options.workflowKey,
    activeOrganization: options.activeOrganization,
  }

  const [eventsResult, valvesResult, trainings] = await Promise.all([
    listCompanyCalendarEvents({
      companyKey,
      organizationId: options.activeOrganization?.id ?? null,
      startDate,
      endDate,
    }),
    fetchAllValves({ column: 'due_date', ascending: true }),
    listEmployeeTrainings().catch(() => [] as EmployeeTraining[]),
  ])

  const valves = filterValvesForCompany(valvesResult.data ?? [], companyScope)
  const scopedTrainings = filterTrainingsForCompany(trainings, companyScope)

  const items = [
    ...eventItems(eventsResult.events),
    ...trainingItems(scopedTrainings, startDate, endDate),
    ...dueDateItems(valves, startDate, endDate),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))

  return {
    items,
    events: eventsResult.events,
    usedLocalEvents: eventsResult.usedLocal,
    startDate,
    endDate,
  }
}

export const CALENDAR_KIND_LABEL: Record<CalendarItemKind, string> = {
  event: 'Event',
  training: 'Training',
  due: 'Job due',
}
