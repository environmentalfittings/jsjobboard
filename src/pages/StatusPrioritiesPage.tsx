import { useSearchParams } from 'react-router-dom'
import { DailyPriorityWorksheet } from '../components/DailyPriorityWorksheet'
import { departmentIdForShopStatus } from '../lib/statusPriorityQueue'

export function StatusPrioritiesPage() {
  const [searchParams] = useSearchParams()
  const legacyKind = searchParams.get('kind')
  const legacyKey = searchParams.get('key')?.trim()

  const departmentParam =
    searchParams.get('department') ||
    (legacyKind === 'cell'
      ? 'finish-cell'
      : legacyKind === 'status' && legacyKey
        ? (departmentIdForShopStatus(legacyKey) ?? legacyKey)
        : legacyKey && !legacyKind
          ? (departmentIdForShopStatus(legacyKey) ?? legacyKey)
          : searchParams.get('departments'))

  const cellParam =
    searchParams.get('cells') ||
    searchParams.get('cell') ||
    (legacyKind === 'cell' && legacyKey ? legacyKey : null)

  return (
    <DailyPriorityWorksheet
      initialDepartments={departmentParam}
      initialCells={cellParam}
      showBackLink
    />
  )
}
