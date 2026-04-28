import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { JOB_TYPES, normalizeJobType } from '../constants/jobTypes'
import { LOOKUP_CATEGORY_DEFS, type LookupCategory } from '../constants/lookupCategories'
import {
  buildSeedLookupValueRows,
  SPREADSHEET_CUSTOMER_NAMES,
} from '../constants/seedSpreadsheetDefaults'
import type { LookupValueRow } from '../lib/lookupValues'
import { supabase } from '../lib/supabase'

type Tab = 'lookups' | 'customers' | 'itpTemplates'

type CustomerRow = { id: number; name: string }
type ItpTemplateRow = {
  id: number
  job_type: string
  valve_type: string | null
  step_order: number
  step_name: string
  required: boolean
}

export function AdminListsPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('lookups')
  const [lookupRows, setLookupRows] = useState<LookupValueRow[]>([])
  const [lookupLoading, setLookupLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<LookupCategory>('test_type')
  const [newLookupValue, setNewLookupValue] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingLookup, setSavingLookup] = useState(false)

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [customersLoading, setCustomersLoading] = useState(true)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null)
  const [customerDraft, setCustomerDraft] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [seedingDefaults, setSeedingDefaults] = useState(false)
  const [itpRows, setItpRows] = useState<ItpTemplateRow[]>([])
  const [itpLoading, setItpLoading] = useState(true)
  const [itpJobType, setItpJobType] = useState<string>('Valve Repair')
  const [itpValveType, setItpValveType] = useState<string>('')
  const [itpNewStep, setItpNewStep] = useState('')
  const [itpNewRequired, setItpNewRequired] = useState(true)
  const [itpEditingId, setItpEditingId] = useState<number | null>(null)
  const [itpEditDraft, setItpEditDraft] = useState('')
  const [itpEditRequired, setItpEditRequired] = useState(true)
  const [itpSaving, setItpSaving] = useState(false)

  const loadLookups = useCallback(async () => {
    setLookupLoading(true)
    const { data, error } = await supabase
      .from('lookup_values')
      .select('id,category,value,sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    setLookupLoading(false)
    if (error) {
      showToast('Could not load dropdown lists')
      return
    }
    setLookupRows((data ?? []) as LookupValueRow[])
  }, [showToast])

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true)
    const { data, error } = await supabase.from('customers').select('id,name').order('name')
    setCustomersLoading(false)
    if (error) {
      showToast('Could not load customers')
      return
    }
    setCustomers((data ?? []) as CustomerRow[])
  }, [showToast])

  useEffect(() => {
    loadLookups()
    loadCustomers()
  }, [loadLookups, loadCustomers])

  const loadItpTemplates = useCallback(async () => {
    setItpLoading(true)
    const { data, error } = await supabase
      .from('itp_templates')
      .select('id,job_type,valve_type,step_order,step_name,required')
      .order('step_order', { ascending: true })
      .order('id', { ascending: true })
    setItpLoading(false)
    if (error) {
      showToast('Could not load ITP templates')
      return
    }
    setItpRows((data ?? []) as ItpTemplateRow[])
  }, [showToast])

  useEffect(() => {
    loadItpTemplates()
  }, [loadItpTemplates])

  const categoryItems = useMemo(
    () => lookupRows.filter((r) => r.category === activeCategory),
    [lookupRows, activeCategory],
  )

  const activeLabel = LOOKUP_CATEGORY_DEFS.find((d) => d.key === activeCategory)?.label ?? activeCategory
  const valveTypeOptions = useMemo(
    () => lookupRows.filter((r) => r.category === 'valve_type').map((r) => r.value),
    [lookupRows],
  )
  const filteredItpRows = useMemo(() => {
    return itpRows.filter((row) => {
      if (normalizeJobType(row.job_type) !== normalizeJobType(itpJobType)) return false
      const targetValve = itpValveType.trim()
      return targetValve ? (row.valve_type ?? '') === targetValve : row.valve_type === null
    })
  }, [itpRows, itpJobType, itpValveType])

  const addLookup = async () => {
    const v = newLookupValue.trim()
    if (!v) {
      showToast('Enter a value')
      return
    }
    const maxOrder = categoryItems.reduce((m, r) => Math.max(m, r.sort_order), -1)
    setSavingLookup(true)
    const { error } = await supabase
      .from('lookup_values')
      .insert({ category: activeCategory, value: v, sort_order: maxOrder + 1 })
    setSavingLookup(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('That value already exists in this list')
      } else {
        showToast('Could not add value')
      }
      return
    }
    showToast('Added')
    setNewLookupValue('')
    loadLookups()
  }

  const saveLookupEdit = async (id: number) => {
    const v = editDraft.trim()
    if (!v) {
      showToast('Value cannot be empty')
      return
    }
    setSavingLookup(true)
    const { error } = await supabase.from('lookup_values').update({ value: v }).eq('id', id)
    setSavingLookup(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('Another row already uses that value')
      } else {
        showToast('Could not save')
      }
      return
    }
    setEditingId(null)
    showToast('Saved')
    loadLookups()
  }

  const deleteLookup = async (id: number) => {
    if (!window.confirm('Remove this option from the list?')) return
    const { error } = await supabase.from('lookup_values').delete().eq('id', id)
    if (error) {
      showToast('Could not delete')
      return
    }
    showToast('Removed')
    loadLookups()
  }

  const moveLookup = async (row: LookupValueRow, direction: -1 | 1) => {
    const sorted = [...categoryItems].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    const i = sorted.findIndex((r) => r.id === row.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= sorted.length) return
    const a = sorted[i]
    const b = sorted[j]
    const soA = a.sort_order
    const soB = b.sort_order
    setSavingLookup(true)
    const e1 = await supabase.from('lookup_values').update({ sort_order: soB }).eq('id', a.id)
    const e2 = await supabase.from('lookup_values').update({ sort_order: soA }).eq('id', b.id)
    setSavingLookup(false)
    if (e1.error || e2.error) {
      showToast('Could not reorder')
      return
    }
    loadLookups()
  }

  const addCustomer = async () => {
    const n = newCustomerName.trim()
    if (!n) {
      showToast('Enter a customer name')
      return
    }
    setSavingCustomer(true)
    const { error } = await supabase.from('customers').insert({ name: n })
    setSavingCustomer(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('That customer already exists')
      } else {
        showToast('Could not add customer')
      }
      return
    }
    showToast('Customer added')
    setNewCustomerName('')
    loadCustomers()
  }

  const saveCustomerEdit = async (id: number) => {
    const n = customerDraft.trim()
    if (!n) {
      showToast('Name cannot be empty')
      return
    }
    setSavingCustomer(true)
    const { error } = await supabase.from('customers').update({ name: n }).eq('id', id)
    setSavingCustomer(false)
    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate')) {
        showToast('That name is already used')
      } else {
        showToast('Could not save')
      }
      return
    }
    setEditingCustomerId(null)
    showToast('Saved')
    loadCustomers()
  }

  const deleteCustomer = async (id: number) => {
    if (!window.confirm('Remove this customer from the list? Existing jobs keep their stored name.')) return
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      showToast('Could not delete')
      return
    }
    showToast('Removed')
    loadCustomers()
  }

  const seedSpreadsheetDefaults = async () => {
    if (
      !window.confirm(
        'Add any missing job dropdown options and customers from the Excel Lists sheet? Existing rows are left unchanged. Safe to run more than once.',
      )
    ) {
      return
    }
    setSeedingDefaults(true)
    const lookupRows = buildSeedLookupValueRows()
    const customerRows = SPREADSHEET_CUSTOMER_NAMES.map((name) => ({ name }))

    const { error: lookupError } = await supabase.from('lookup_values').upsert(lookupRows, {
      onConflict: 'category,value',
      ignoreDuplicates: true,
    })
    if (lookupError) {
      setSeedingDefaults(false)
      showToast('Could not seed job lists: ' + (lookupError.message || 'unknown error'))
      return
    }

    const { error: customerError } = await supabase.from('customers').upsert(customerRows, {
      onConflict: 'name',
      ignoreDuplicates: true,
    })
    setSeedingDefaults(false)
    if (customerError) {
      showToast('Job lists updated; customers failed: ' + (customerError.message || 'unknown error'))
      await loadLookups()
      return
    }

    showToast('Spreadsheet defaults loaded')
    await Promise.all([loadLookups(), loadCustomers()])
  }

  const addItpStep = async () => {
    const stepName = itpNewStep.trim()
    if (!stepName) {
      showToast('Enter a step name')
      return
    }
    const maxOrder = filteredItpRows.reduce((m, row) => Math.max(m, row.step_order), -1)
    setItpSaving(true)
    const { error } = await supabase.from('itp_templates').insert({
      job_type: normalizeJobType(itpJobType),
      valve_type: itpValveType.trim() || null,
      step_order: maxOrder + 1,
      step_name: stepName,
      required: itpNewRequired,
    })
    setItpSaving(false)
    if (error) {
      showToast('Could not add ITP step')
      return
    }
    setItpNewStep('')
    setItpNewRequired(true)
    showToast('ITP step added')
    loadItpTemplates()
  }

  const saveItpEdit = async (id: number) => {
    const stepName = itpEditDraft.trim()
    if (!stepName) {
      showToast('Step name cannot be empty')
      return
    }
    setItpSaving(true)
    const { error } = await supabase
      .from('itp_templates')
      .update({ step_name: stepName, required: itpEditRequired })
      .eq('id', id)
    setItpSaving(false)
    if (error) {
      showToast('Could not save step')
      return
    }
    setItpEditingId(null)
    showToast('ITP step saved')
    loadItpTemplates()
  }

  const deleteItpStep = async (id: number) => {
    if (!window.confirm('Delete this ITP step?')) return
    const { error } = await supabase.from('itp_templates').delete().eq('id', id)
    if (error) {
      showToast('Could not delete step')
      return
    }
    showToast('ITP step deleted')
    loadItpTemplates()
  }

  const moveItpStep = async (row: ItpTemplateRow, direction: -1 | 1) => {
    const sorted = [...filteredItpRows].sort((a, b) => a.step_order - b.step_order || a.id - b.id)
    const i = sorted.findIndex((r) => r.id === row.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= sorted.length) return
    const current = sorted[i]
    const neighbor = sorted[j]
    setItpSaving(true)
    const e1 = await supabase.from('itp_templates').update({ step_order: neighbor.step_order }).eq('id', current.id)
    const e2 = await supabase.from('itp_templates').update({ step_order: current.step_order }).eq('id', neighbor.id)
    setItpSaving(false)
    if (e1.error || e2.error) {
      showToast('Could not reorder steps')
      return
    }
    loadItpTemplates()
  }

  return (
    <section className="dashboard-page">
      <div className="dashboard-title-row admin-page-heading">
        <h2 className="dashboard-title">Manage lists</h2>
        <Link to="/dashboard" className="button-secondary">
          Back
        </Link>
      </div>

      <p className="placeholder-copy admin-lists-intro">
        Admin only. Changes apply to New job dropdowns for everyone. Use the button below to load the same options as
        the Excel Lists sheet (or run <code>seed-lookup-values.sql</code> / <code>seed-customers-from-spreadsheet.sql</code>{' '}
        in Supabase if you prefer SQL).
      </p>

      <div className="admin-seed-row">
        <button
          type="button"
          className="button-primary"
          disabled={seedingDefaults || lookupLoading || customersLoading}
          onClick={() => void seedSpreadsheetDefaults()}
        >
          {seedingDefaults ? 'Loading…' : 'Load spreadsheet defaults'}
        </button>
      </div>

      <div className="admin-lists-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'lookups'}
          className={`admin-lists-tab ${tab === 'lookups' ? 'active' : ''}`}
          onClick={() => setTab('lookups')}
        >
          Job field lists
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'itpTemplates'}
          className={`admin-lists-tab ${tab === 'itpTemplates' ? 'active' : ''}`}
          onClick={() => setTab('itpTemplates')}
        >
          ITP Templates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'customers'}
          className={`admin-lists-tab ${tab === 'customers' ? 'active' : ''}`}
          onClick={() => setTab('customers')}
        >
          Customers
        </button>
      </div>

      {tab === 'lookups' ? (
        <section className="dashboard-panel admin-lists-panel">
          <h3>Dropdown options</h3>
          <div className="admin-category-tabs">
            {LOOKUP_CATEGORY_DEFS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`admin-category-tab ${activeCategory === d.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(d.key)
                  setEditingId(null)
                  setNewLookupValue('')
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          {lookupLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : (
            <>
              <ul className="admin-list-rows">
                {categoryItems.map((row) => (
                  <li key={row.id} className="admin-list-row">
                    {editingId === row.id ? (
                      <>
                        <input
                          className="admin-list-input"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          aria-label="Edit value"
                        />
                        <button
                          type="button"
                          className="button-primary admin-list-btn"
                          disabled={savingLookup}
                          onClick={() => saveLookupEdit(row.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="admin-list-value">{row.value}</span>
                        <div className="admin-list-actions">
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move up"
                            disabled={savingLookup}
                            onClick={() => moveLookup(row, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move down"
                            disabled={savingLookup}
                            onClick={() => moveLookup(row, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            onClick={() => {
                              setEditingId(row.id)
                              setEditDraft(row.value)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn danger"
                            onClick={() => deleteLookup(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              <div className="admin-add-row">
                <span className="admin-add-label">Add to {activeLabel}</span>
                <div className="admin-add-controls">
                  <input
                    type="text"
                    value={newLookupValue}
                    onChange={(e) => setNewLookupValue(e.target.value)}
                    placeholder="New option"
                    aria-label={`New ${activeLabel} option`}
                  />
                  <button type="button" className="button-primary" disabled={savingLookup} onClick={addLookup}>
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      ) : tab === 'itpTemplates' ? (
        <section className="dashboard-panel admin-lists-panel">
          <h3>ITP Templates</h3>
          <div className="itp-admin-filters">
            <label>
              Job type
              <select value={itpJobType} onChange={(e) => setItpJobType(e.target.value)}>
                {JOB_TYPES.map((jt) => (
                  <option key={jt} value={jt}>
                    {jt}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Valve type (optional)
              <select
                value={itpValveType}
                onChange={(e) => setItpValveType(e.target.value)}
                disabled={normalizeJobType(itpJobType) !== 'Valve Repair'}
              >
                <option value="">Generic for this job type</option>
                {valveTypeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {itpLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : (
            <>
              <ul className="admin-list-rows">
                {filteredItpRows.map((row) => (
                  <li key={row.id} className="admin-list-row">
                    {itpEditingId === row.id ? (
                      <>
                        <input
                          className="admin-list-input"
                          value={itpEditDraft}
                          onChange={(e) => setItpEditDraft(e.target.value)}
                          aria-label="Edit ITP step"
                        />
                        <label className="itp-admin-required-toggle">
                          <input
                            type="checkbox"
                            checked={itpEditRequired}
                            onChange={(e) => setItpEditRequired(e.target.checked)}
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          className="button-primary admin-list-btn"
                          disabled={itpSaving}
                          onClick={() => saveItpEdit(row.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn"
                          onClick={() => setItpEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="admin-list-value">
                          {row.step_name} {row.required ? <em className="itp-required-chip">Required</em> : null}
                        </span>
                        <div className="admin-list-actions">
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move up"
                            disabled={itpSaving}
                            onClick={() => moveItpStep(row, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            title="Move down"
                            disabled={itpSaving}
                            onClick={() => moveItpStep(row, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            onClick={() => {
                              setItpEditingId(row.id)
                              setItpEditDraft(row.step_name)
                              setItpEditRequired(row.required)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn danger"
                            onClick={() => deleteItpStep(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="admin-add-row">
                <span className="admin-add-label">Add ITP step</span>
                <div className="admin-add-controls itp-admin-add-controls">
                  <input
                    type="text"
                    value={itpNewStep}
                    onChange={(e) => setItpNewStep(e.target.value)}
                    placeholder="Step name"
                    aria-label="New ITP step"
                  />
                  <label className="itp-admin-required-toggle">
                    <input
                      type="checkbox"
                      checked={itpNewRequired}
                      onChange={(e) => setItpNewRequired(e.target.checked)}
                    />
                    Required
                  </label>
                  <button type="button" className="button-primary" disabled={itpSaving} onClick={addItpStep}>
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="dashboard-panel admin-lists-panel">
          <h3>Customers</h3>
          {customersLoading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : (
            <>
              <ul className="admin-list-rows">
                {customers.map((c) => (
                  <li key={c.id} className="admin-list-row">
                    {editingCustomerId === c.id ? (
                      <>
                        <input
                          className="admin-list-input"
                          value={customerDraft}
                          onChange={(e) => setCustomerDraft(e.target.value)}
                          aria-label="Edit customer name"
                        />
                        <button
                          type="button"
                          className="button-primary admin-list-btn"
                          disabled={savingCustomer}
                          onClick={() => saveCustomerEdit(c.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary admin-list-btn"
                          onClick={() => setEditingCustomerId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="admin-list-value">{c.name}</span>
                        <div className="admin-list-actions">
                          <button
                            type="button"
                            className="button-secondary admin-list-btn"
                            onClick={() => {
                              setEditingCustomerId(c.id)
                              setCustomerDraft(c.name)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary admin-list-btn danger"
                            onClick={() => deleteCustomer(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="admin-add-row">
                <span className="admin-add-label">Add customer</span>
                <div className="admin-add-controls">
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Customer name"
                    aria-label="New customer name"
                  />
                  <button type="button" className="button-primary" disabled={savingCustomer} onClick={addCustomer}>
                    Add
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </section>
  )
}
