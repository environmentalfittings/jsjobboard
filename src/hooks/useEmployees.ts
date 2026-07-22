import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { EmployeeInitialsLookupRow } from '../lib/employeeAuth'
import type { Employee, Profile } from '../types/employees'

type EmployeesSnapshot = {
  employees: Employee[]
  currentUserProfile: Profile | null
  error: string | null
}

let sharedSnapshot: EmployeesSnapshot | null = null
let sharedLoadPromise: Promise<EmployeesSnapshot> | null = null

async function loadEmployeesSnapshot(): Promise<EmployeesSnapshot> {
  const [employeesRes, userRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id,employee_no,first_name,last_name,full_name,username,initials,company,is_active,auth_user_id')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
    supabase.auth.getUser(),
  ])

  let error: string | null = employeesRes.error?.message ?? null
  const employees = employeesRes.error ? [] : ((employeesRes.data as Employee[]) ?? [])

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
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(sharedSnapshot?.currentUserProfile ?? null)
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

  return useMemo(
    () => ({
      employees,
      currentUserProfile,
      isAdmin,
      loading,
      error,
      lookupByInitials,
      reload: () => load(true),
    }),
    [employees, currentUserProfile, isAdmin, loading, error, lookupByInitials, load],
  )
}
