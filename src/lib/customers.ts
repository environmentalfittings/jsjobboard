import { supabase } from './supabase'

export type CustomerSalesRepRow = {
  id: number
  name: string
  sales_rep_employee_id: string | null
}

function isMissingSalesRepColumn(message: string | null | undefined) {
  return /sales_rep_employee_id/i.test(String(message ?? '')) && /column|schema|does not exist/i.test(String(message ?? ''))
}

export async function loadCustomersWithSalesRep(): Promise<{
  data: CustomerSalesRepRow[]
  error: string | null
  salesRepColumnMissing: boolean
}> {
  const withRep = await supabase
    .from('customers')
    .select('id,name,sales_rep_employee_id')
    .order('name')
    .limit(5000)

  if (!withRep.error) {
    return {
      data: ((withRep.data ?? []) as CustomerSalesRepRow[]).map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        sales_rep_employee_id: row.sales_rep_employee_id ? String(row.sales_rep_employee_id) : null,
      })),
      error: null,
      salesRepColumnMissing: false,
    }
  }

  if (isMissingSalesRepColumn(withRep.error.message)) {
    const fallback = await supabase.from('customers').select('id,name').order('name').limit(5000)
    if (fallback.error) {
      return { data: [], error: fallback.error.message, salesRepColumnMissing: true }
    }
    return {
      data: ((fallback.data ?? []) as { id: number; name: string }[]).map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        sales_rep_employee_id: null,
      })),
      error: null,
      salesRepColumnMissing: true,
    }
  }

  return { data: [], error: withRep.error.message, salesRepColumnMissing: false }
}

export async function updateCustomerSalesRep(
  customerId: number,
  salesRepEmployeeId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('customers')
    .update({ sales_rep_employee_id: salesRepEmployeeId })
    .eq('id', customerId)

  if (!error) return { error: null }
  if (isMissingSalesRepColumn(error.message)) {
    return { error: 'Run migration-customers-sales-rep.sql in Supabase, then try again' }
  }
  return { error: error.message }
}

export function findCustomerByName(
  customers: CustomerSalesRepRow[],
  customerName: string,
): CustomerSalesRepRow | null {
  const needle = customerName.trim().toLowerCase()
  if (!needle) return null
  return customers.find((row) => row.name.trim().toLowerCase() === needle) ?? null
}
