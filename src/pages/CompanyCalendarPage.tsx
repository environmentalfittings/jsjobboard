import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { useOrganization } from '../contexts/OrganizationContext'
import { useCompanyWorkflow } from '../hooks/useCompanyWorkflow'
import { canWriteShop } from '../lib/roles'
import {
  CALENDAR_KIND_LABEL,
  companyKeyForCalendar,
  createCompanyCalendarEvent,
  deleteCompanyCalendarEvent,
  loadCompanyCalendarMonth,
  updateCompanyCalendarEvent,
  type CalendarDayItem,
  type CalendarItemKind,
  type CompanyCalendarEvent,
} from '../lib/companyCalendar'
import { printCompanyCalendarMonth } from '../lib/companyCalendarPrint'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type KindFilter = Record<CalendarItemKind, boolean>

const DEFAULT_FILTERS: KindFilter = {
  event: true,
  training: true,
  due: true,
}

function monthLabel(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function CompanyCalendarPage() {
  const { showToast } = useToast()
  const { role, username, user } = useAuth()
  const canWrite = canWriteShop(role)
  const { activeOrganization } = useOrganization()
  const workflow = useCompanyWorkflow()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [monthIndex, setMonthIndex] = useState(now.getMonth())
  const [items, setItems] = useState<CalendarDayItem[]>([])
  const [usedLocalEvents, setUsedLocalEvents] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<KindFilter>(DEFAULT_FILTERS)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [editing, setEditing] = useState<CompanyCalendarEvent | null>(null)
  const [showEventForm, setShowEventForm] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDetails, setDraftDetails] = useState('')
  const [draftDate, setDraftDate] = useState('')
  const [draftEndDate, setDraftEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  const companyName = activeOrganization?.name?.trim() || (workflow.key === 'vsi' ? 'VSI' : 'JS Valve')
  const companyKey = companyKeyForCalendar({
    workflowKey: workflow.key,
    activeOrganization,
  })

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await loadCompanyCalendarMonth({
        workflowKey: workflow.key,
        activeOrganization,
        year,
        monthIndex,
      })
      setItems(result.items)
      setUsedLocalEvents(result.usedLocalEvents)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load calendar')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [activeOrganization, monthIndex, showToast, workflow.key, year])

  useEffect(() => {
    void reload()
  }, [reload])

  const visibleItems = useMemo(
    () => items.filter((item) => filters[item.kind]),
    [filters, items],
  )

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarDayItem[]>()
    for (const item of visibleItems) {
      const list = map.get(item.date) ?? []
      list.push(item)
      map.set(item.date, list)
    }
    return map
  }, [visibleItems])

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const startPad = new Date(year, monthIndex, 1).getDay()

  const shiftMonth = (delta: number) => {
    const next = new Date(year, monthIndex + delta, 1)
    setYear(next.getFullYear())
    setMonthIndex(next.getMonth())
    setSelectedDate(null)
  }

  const openNewEvent = (date: string) => {
    if (!canWrite) {
      showToast('Ask an Admin or Manager to post calendar events')
      return
    }
    setEditing(null)
    setDraftDate(date)
    setDraftEndDate('')
    setDraftTitle('')
    setDraftDetails('')
    setSelectedDate(date)
    setShowEventForm(true)
  }

  const openEditEvent = (event: CompanyCalendarEvent) => {
    if (!canWrite) {
      showToast('Ask an Admin or Manager to edit calendar events')
      return
    }
    setEditing(event)
    setDraftDate(event.event_date)
    setDraftEndDate(event.end_date ?? '')
    setDraftTitle(event.title)
    setDraftDetails(event.details)
    setSelectedDate(event.event_date)
    setShowEventForm(true)
  }

  const saveEvent = async () => {
    if (!canWrite) return
    setSaving(true)
    try {
      if (editing) {
        const { usedLocal } = await updateCompanyCalendarEvent(editing.id, {
          event_date: draftDate,
          end_date: draftEndDate || null,
          title: draftTitle,
          details: draftDetails,
        })
        showToast(usedLocal ? 'Event saved in this browser (run calendar migration to share)' : 'Event updated')
      } else {
        const { usedLocal } = await createCompanyCalendarEvent({
          companyKey,
          organizationId: activeOrganization?.id ?? null,
          event_date: draftDate,
          end_date: draftEndDate || null,
          title: draftTitle,
          details: draftDetails,
          created_by_name: username || null,
          created_by_user_id: user?.id ?? null,
        })
        showToast(usedLocal ? 'Event saved in this browser (run calendar migration to share)' : 'Event added')
      }
      setEditing(null)
      setShowEventForm(false)
      setDraftTitle('')
      setDraftDetails('')
      await reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save event')
    } finally {
      setSaving(false)
    }
  }

  const removeEvent = async (event: CompanyCalendarEvent) => {
    if (!canWrite) return
    if (!window.confirm(`Delete event “${event.title}”?`)) return
    setSaving(true)
    try {
      await deleteCompanyCalendarEvent(event.id)
      showToast('Event deleted')
      if (editing?.id === event.id) setEditing(null)
      await reload()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete event')
    } finally {
      setSaving(false)
    }
  }

  const printMonth = () => {
    const { error } = printCompanyCalendarMonth({
      companyName,
      year,
      monthIndex,
      items: visibleItems,
    })
    if (error) showToast(error)
  }

  const selectedDayItems = selectedDate ? (itemsByDate.get(selectedDate) ?? []) : []

  const counts = useMemo(() => {
    const next = { event: 0, training: 0, due: 0 }
    for (const item of items) next[item.kind] += 1
    return next
  }, [items])

  return (
    <section className="dashboard-page company-calendar-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Calendar · {companyName}</h2>
        <div className="admin-employees-title-actions">
          <button type="button" className="button-secondary" onClick={() => void reload()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="button-primary" onClick={printMonth} disabled={loading}>
            Print month
          </button>
        </div>
      </div>

      <p className="placeholder-copy">
        Printable company calendar for posted events, scheduled training, and upcoming job due dates
        {usedLocalEvents
          ? '. Posted events are stored in this browser until you run supabase/migration-company-calendar-events.sql.'
          : '.'}
      </p>

      <div className="report-filters company-calendar-toolbar">
        <button type="button" className="button-secondary" onClick={() => shiftMonth(-1)}>
          ← Prev
        </button>
        <strong className="company-calendar-month-label">{monthLabel(year, monthIndex)}</strong>
        <button type="button" className="button-secondary" onClick={() => shiftMonth(1)}>
          Next →
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            const d = new Date()
            setYear(d.getFullYear())
            setMonthIndex(d.getMonth())
          }}
        >
          Today
        </button>
        {canWrite ? (
          <button
            type="button"
            className="button-primary"
            onClick={() => openNewEvent(selectedDate ?? toIsoDate(year, monthIndex, Math.min(now.getDate(), daysInMonth)))}
          >
            Add event
          </button>
        ) : null}
      </div>

      <div className="company-calendar-filters">
        {(Object.keys(DEFAULT_FILTERS) as CalendarItemKind[]).map((kind) => (
          <label key={kind} className={`company-calendar-filter company-calendar-filter--${kind}`}>
            <input
              type="checkbox"
              checked={filters[kind]}
              onChange={(e) => setFilters((prev) => ({ ...prev, [kind]: e.target.checked }))}
            />
            <span>
              {CALENDAR_KIND_LABEL[kind]} ({counts[kind]})
            </span>
          </label>
        ))}
      </div>

      <div className="company-calendar-layout">
        <div className="company-calendar-grid-wrap">
          <div className="company-calendar-weekdays">
            {WEEKDAYS.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="company-calendar-grid">
            {Array.from({ length: startPad }, (_, i) => (
              <div key={`pad-${i}`} className="company-calendar-day is-empty" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const date = toIsoDate(year, monthIndex, day)
              const dayItems = itemsByDate.get(date) ?? []
              const isToday =
                date ===
                `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
              const isSelected = selectedDate === date
              return (
                <button
                  key={date}
                  type="button"
                  className={`company-calendar-day${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedDate(date)}
                  onDoubleClick={() => openNewEvent(date)}
                >
                  <div className="company-calendar-day-num">{day}</div>
                  <div className="company-calendar-day-chips">
                    {dayItems.slice(0, 4).map((item) => (
                      <span key={item.id} className={`company-calendar-chip company-calendar-chip--${item.kind}`}>
                        {item.title}
                      </span>
                    ))}
                    {dayItems.length > 4 ? (
                      <span className="company-calendar-more">+{dayItems.length - 4} more</span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <aside className="company-calendar-side">
          <h3>{selectedDate ? selectedDate : 'Select a day'}</h3>
          {selectedDate ? (
            <>
              <div className="company-calendar-side-actions">
                {canWrite ? (
                  <button type="button" className="button-primary" onClick={() => openNewEvent(selectedDate)}>
                    Add event on this day
                  </button>
                ) : null}
              </div>
              {selectedDayItems.length === 0 ? (
                <p className="placeholder-copy">Nothing scheduled.</p>
              ) : (
                <ul className="company-calendar-day-list">
                  {selectedDayItems.map((item) => (
                    <li key={item.id} className={`company-calendar-day-list-item kind-${item.kind}`}>
                      <div className="company-calendar-day-list-head">
                        <strong>{item.title}</strong>
                        <span>{CALENDAR_KIND_LABEL[item.kind]}</span>
                      </div>
                      {item.subtitle ? <p>{item.subtitle}</p> : null}
                      <div className="company-calendar-day-list-actions">
                        {item.href ? (
                          <Link className="button-secondary" to={item.href}>
                            Open
                          </Link>
                        ) : null}
                        {item.event && canWrite ? (
                          <>
                            <button type="button" className="button-secondary" onClick={() => openEditEvent(item.event!)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={saving}
                              onClick={() => void removeEvent(item.event!)}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="placeholder-copy">Click a day to see events, training, and job due dates. Double-click to add an event.</p>
          )}

          {canWrite && showEventForm ? (
            <div className="company-calendar-event-form">
              <h4>{editing ? 'Edit event' : 'Post event'}</h4>
              <label>
                Title
                <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="e.g. Safety meeting" />
              </label>
              <label>
                Date
                <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
              </label>
              <label>
                End date (optional)
                <input type="date" value={draftEndDate} onChange={(e) => setDraftEndDate(e.target.value)} />
              </label>
              <label>
                Details
                <textarea
                  rows={3}
                  value={draftDetails}
                  onChange={(e) => setDraftDetails(e.target.value)}
                  placeholder="Location, notes…"
                />
              </label>
              <div className="company-calendar-side-actions">
                <button
                  type="button"
                  className="button-primary"
                  disabled={saving || !draftTitle.trim() || !draftDate}
                  onClick={() => void saveEvent()}
                >
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Post event'}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setEditing(null)
                    setShowEventForm(false)
                    setDraftTitle('')
                    setDraftDetails('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
