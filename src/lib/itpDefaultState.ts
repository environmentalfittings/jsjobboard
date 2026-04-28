import type { FlangeFaceState, ItpItemState } from '../types/itp'

export function emptyFlangeFaceState(): FlangeFaceState {
  return {
    facingType: '',
    facingTypeOther: '',
    condition: '',
    conditionOther: '',
    measure1: '',
    measure2: '',
    measurementNote: '',
    repairAction: '',
    repairActionOther: '',
    notes: '',
  }
}

export function emptyItemState(): ItpItemState {
  const f = emptyFlangeFaceState()
  return {
    ...f,
    valvePortConfig: '',
    valvePortConfigOther: '',
    flangeB: { ...f },
    flangeC: { ...f },
    flangeD: { ...f },
  }
}
