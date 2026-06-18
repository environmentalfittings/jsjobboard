import type { FlangeFaceState, ItpItemState } from '../types/itp'

export function emptyFlangeFaceState(): FlangeFaceState {
  return {
    facingType: '',
    facingTypeOther: '',
    buttWeldSchedule: '',
    condition: '',
    conditionOther: '',
    measure1: '',
    measure2: '',
    measureAfterMachining: '',
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
    nptThreadInspection: '',
    seatCondition: '',
    seatLapResult: '',
    stemRunout: '',
    stemDiameter: '',
    stemDiameterMin: '',
    discWedgeCondition: '',
    discWedgeThickness: '',
    discWedgeThicknessMin: '',
    packingCondition: '',
    packingType: '',
    springSetPressure: '',
    springSetPressureSpec: '',
    blowdownPressure: '',
    actuatorStrokeMeasured: '',
    actuatorStrokeSpec: '',
    torqueMeasured: '',
    torqueSpec: '',
    sealTestResult: '',
    faceToFaceMeasurement: '',
    faceToFaceAfterMachining: '',
    flangeB: { ...f },
    flangeC: { ...f },
    flangeD: { ...f },
  }
}
