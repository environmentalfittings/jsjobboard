import { useSearchParams } from 'react-router-dom'
import { DailyPriorityWorksheet } from '../components/DailyPriorityWorksheet'
import { openShopDepartmentsParam } from '../constants/priorityDepartments'
import { departmentIdForShopStatus } from '../lib/statusPriorityQueue'

export function StatusPrioritiesPage() {
  const [searchParams] = useSearchParams()
  const legacyKind = searchParams.get('kind')
  const legacyKey = searchParams.get('key')?.trim()

  const cellParam =
    searchParams.get('cells') ||
    searchParams.get('cell') ||
    (legacyKind === 'cell' && legacyKey ? legacyKey : null)

  const explicitDepartments = searchParams.get('departments')
  const singleDepartment = searchParams.get('department')

  // Work-cell drill-in: preselect every department except Completed.
  const fromWorkCell =
    Boolean(cellParam?.trim()) &&
    (legacyKind === 'cell' || singleDepartment === 'finish-cell')

  const departmentParam = explicitDepartments
    ? explicitDepartments
    : fromWorkCell
      ? openShopDepartmentsParam()
      : singleDepartment ||
        (legacyKind === 'status' && legacyKey
          ? (departmentIdForShopStatus(legacyKey) ?? legacyKey)
          : legacyKey && !legacyKind
            ? (departmentIdForShopStatus(legacyKey) ?? legacyKey)
            : null)

  return (
    <DailyPriorityWorksheet
      initialDepartments={departmentParam}
      initialCells={cellParam}
      showBackLink
    />
  )
}
