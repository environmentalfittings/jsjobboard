import { statusToneForAnyCompany } from '../constants/companyWorkflows'

export function StatusBadge({ status }: { status: string }) {
  const tone = statusToneForAnyCompany(status)
  return <span className={`status-badge ${tone}`}>{status}</span>
}
