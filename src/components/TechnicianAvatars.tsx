import { technicianInitials } from '../lib/technicianInitials'
import type { Technician } from '../types'

function avatarToneClass(id: number): string {
  return `tech-avatar tech-avatar--tone-${id % 6}`
}

export function TechnicianAvatars({
  ids,
  byId,
  max = 4,
}: {
  ids: number[]
  byId: Map<number, Technician>
  max?: number
}) {
  const shown = ids.slice(0, max)
  const extra = ids.length - shown.length

  if (shown.length === 0) return null

  return (
    <div className="tech-avatar-row" title={ids.map((id) => byId.get(id)?.name).filter(Boolean).join(', ')}>
      {shown.map((id) => {
        const t = byId.get(id)
        const label = t?.name?.trim() || `#${id}`
        return (
          <span key={id} className={avatarToneClass(id)} title={label}>
            {technicianInitials(label)}
          </span>
        )
      })}
      {extra > 0 ? <span className="tech-avatar tech-avatar--more">+{extra}</span> : null}
    </div>
  )
}
