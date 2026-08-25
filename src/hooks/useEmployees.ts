import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { EmployeeInitialsLookupRow } from '../lib/employeeAuth'
import {
  normalizeQualityTeamLevel,
  type Employee,
  type Profile,
} from '../types/employees'

type EmployeesSnapshot = {
  employees: Employee[]
  currentUserProfile: Profile | null
  error: string | null
}

let sharedSnapshot: EmployeesSnapshot | null = null
let sharedLoadPromise: Promise<EmployeesSnapshot> | null = null

const EMPLOYEE_SELECT_FULL =
  'id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,is_tester,is_salesman,quality_team_level,auth_user_id'
const EMPLOYEE_SELECT_NO_SALESMAN =
  'id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,is_tester,quality_team_level,auth_user_id'
const EMPLOYEE_SELECT_WITH_TESTER =
  'id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,is_tester,auth_user_id'
const EMPLOYEE_SELECT_BASE =
  'id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,auth_user_id'

function isMissingColumn(message: string | null | undefined, column: string) {
  return (
    new RegExp(column, 'i').test(String(message ?? '')) &&
    /column|schema|does not exist/i.test(String(message ?? ''))
  )
}

function mapEmployeeRow(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id),
    employee_no: String(row.employee_no ?? ''),
    first_name: String(row.first_name ?? ''),
    last_name: String(row.last_name ?? ''),
    full_name: String(row.full_name ?? ''),
    username: String(row.username ?? ''),
    initials: String(row.initials ?? ''),
    company: String(row.company ?? ''),
    is_active: Boolean(row.is_active),
    is_tester: Boolean(row.is_tester),
    is_salesman: Boolean(row.is_salesman),
    quality_team_level: normalizeQualityTeamLevel(row.quality_team_level),
    auth_user_id: row.auth_user_id == null ? null : String(row.auth_user_id),
  }
}

async function loadEmployeesSnapshot(): Promise<EmployeesSnapshot> {
  const [employeesResPrimary, userRes] = await Promise.all([
    supabase
      .from('employees')
      .select(EMPLOYEE_SELECT_FULL)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
    supabase.auth.getUser(),
  ])

  let rows: Employee[] = []
  let error: string | null = employeesResPrimary.error?.message ?? null

  if (employeesResPrimary.error && isMissingColumn(employeesResPrimary.error.message, 'is_salesman')) {
    const withoutSalesman = await supabase
      .from('employees')
      .select(EMPLOYEE_SELECT_NO_SALESMAN)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (withoutSalesman.error && isMissingColumn(withoutSalesman.error.message, 'quality_team_level')) {
      const withTester = await supabase
        .from('employees')
        .select(EMPLOYEE_SELECT_WITH_TESTER)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })

      if (withTester.error && isMissingColumn(withTester.error.message, 'is_tester')) {
        const fallback = await supabase
          .from('employees')
          .select(EMPLOYEE_SELECT_BASE)
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true })

        if (fallback.error) {
          error = fallback.error.message
        } else {
          error =
            'Run migration-employee-is-tester.sql, migration-employee-quality-team.sql, and migration-employee-is-salesman.sql in Supabase'
          rows = ((fallback.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
        }
      } else if (withTester.error) {
        error = withTester.error.message
      } else {
        error =
          'Run migration-employee-quality-team.sql and migration-employee-is-salesman.sql in Supabase SQL Editor. Then click Refresh.'
        rows = ((withTester.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
      }
    } else if (withoutSalesman.error && isMissingColumn(withoutSalesman.error.message, 'is_tester')) {
      const fallback = await supabase
        .from('employees')
        .select(EMPLOYEE_SELECT_BASE)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })

      if (fallback.error) {
        error = fallback.error.message
      } else {
        error =
          'Run migration-employee-is-tester.sql, migration-employee-quality-team.sql, and migration-employee-is-salesman.sql in Supabase'
        rows = ((fallback.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
      }
    } else if (withoutSalesman.error) {
      error = withoutSalesman.error.message
    } else {
      error =
        'Run migration-employee-is-salesman.sql in Supabase SQL Editor to enable salesman designation. Then click Refresh.'
      rows = ((withoutSalesman.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
    }
  } else if (
    employeesResPrimary.error &&
    isMissingColumn(employeesResPrimary.error.message, 'quality_team_level')
  ) {
    const withTester = await supabase
      .from('employees')
      .select(EMPLOYEE_SELECT_WITH_TESTER)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (withTester.error && isMissingColumn(withTester.error.message, 'is_tester')) {
      const fallback = await supabase
        .from('employees')
        .select(EMPLOYEE_SELECT_BASE)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })

      if (fallback.error) {
        error = fallback.error.message
      } else {
        error =
          'Run migration-employee-is-tester.sql and migration-employee-quality-team.sql in Supabase'
        rows = ((fallback.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
      }
    } else if (withTester.error) {
      error = withTester.error.message
    } else {
      error =
        'Run migration-employee-quality-team.sql in Supabase SQL Editor (Tester migration is separate). Then click Refresh.'
      rows = ((withTester.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
    }
  } else if (employeesResPrimary.error && isMissingColumn(employeesResPrimary.error.message, 'is_tester')) {
    const fallback = await supabase
      .from('employees')
      .select(EMPLOYEE_SELECT_BASE)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (fallback.error) {
      error = fallback.error.message
    } else {
      error =
        'Run migration-employee-is-tester.sql and migration-employee-quality-team.sql in Supabase'
      rows = ((fallback.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
    }
  } else if (!employeesResPrimary.error) {
    error = null
    rows = ((employeesResPrimary.data as Record<string, unknown>[] | null) ?? []).map(mapEmployeeRow)
  }

  const employees = rows

  let currentUserProfile: Profile | null = null
  const userId = userRes.data.user?.id
  if (userId) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,employee_id,role,full_name')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      error = error ?? profileError.message
    } else {
      currentUserProfile = (profile as Profile | null) ?? null
    }
  }

  return { employees, currentUserProfile, error }
}

async function getEmployeesSnapshot(force = false): Promise<EmployeesSnapshot> {
  if (!force && sharedSnapshot) return sharedSnapshot
  if (!force && sharedLoadPromise) return sharedLoadPromise

  sharedLoadPromise = loadEmployeesSnapshot().then((snapshot) => {
    sharedSnapshot = snapshot
    sharedLoadPromise = null
    return snapshot
  })

  return sharedLoadPromise
}

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>(sharedSnapshot?.employees ?? [])
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(
    sharedSnapshot?.currentUserProfile ?? null,
  )
  const [loading, setLoading] = useState(!sharedSnapshot)
  const [error, setError] = useState<string | null>(sharedSnapshot?.error ?? null)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    if (force) {
      sharedSnapshot = null
    }
    const snapshot = await getEmployeesSnapshot(force)
    setEmployees(snapshot.employees)
    setCurrentUserProfile(snapshot.currentUserProfile)
    setError(snapshot.error)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const lookupByInitials = useCallback(
    async (initials: string): Promise<Employee | null> => {
      const trimmed = initials.trim().toUpperCase()
      if (trimmed.length < 2) return null

      const local = employees.find((row) => row.initials.toUpperCase() === trimmed && row.is_active)
      if (local) return local

      const { data, error: rpcError } = await supabase.rpc('lookup_employee_by_initials', {
        p_initials: trimmed,
      })

      if (rpcError || !data) return null

      const rpcRow = (Array.isArray(data) ? data[0] : data) as EmployeeInitialsLookupRow | undefined
      if (!rpcRow) return null

      return (
        employees.find(
          (row) =>
            row.employee_no === rpcRow.employee_no ||
            row.initials.toUpperCase() === rpcRow.initials.toUpperCase(),
        ) ?? null
      )
    },
    [employees],
  )

  const isAdmin = currentUserProfile?.role === 'admin'

  const reload = useCallback(() => load(true), [load])

  return useMemo(
    () => ({
      employees,
      currentUserProfile,
      isAdmin,
      loading,
      error,
      lookupByInitials,
      reload,
    }),
    [employees, currentUserProfile, isAdmin, loading, error, lookupByInitials, reload],
  )
}
