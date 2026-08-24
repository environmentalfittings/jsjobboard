import { BIXOLON_SPP_R200III } from '../constants/bixolonSppR200III'

/** ESC @ — initialize printer */
const ESC_INIT = [0x1b, 0x40] as const

/**
 * BS L R — select receipt mode (continuous roll).
 * Hex: 08 4C 52
 * Required when the printer was left in black-mark/label mode; otherwise it
 * feeds looking for marks and can waste several feet of paper.
 */
const SELECT_RECEIPT_MODE = [0x08, 0x4c, 0x52] as const

/** ESC d n — print and feed n lines (small advance after the label). */
function feedLines(n: number): number[] {
  return [0x1b, 0x64, Math.max(0, Math.min(255, n))]
}

function concatBytes(chunks: ArrayLike<number>[]): Uint8Array {
  let total = 0
  for (const chunk of chunks) total += chunk.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Convert a canvas to ESC/POS GS v 0 raster bytes (1-bit, MSB left).
 * Width must be a multiple of 8; we target {@link BIXOLON_SPP_R200III.printableWidthDots} (384).
 */
export function canvasToGsV0Raster(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not read label image')

  const srcW = canvas.width
  const srcH = canvas.height
  const targetW = BIXOLON_SPP_R200III.printableWidthDots
  const widthDots = Math.min(srcW, targetW)
  const widthBytes = Math.ceil(widthDots / 8)
  const heightDots = srcH

  if (heightDots < 1 || widthBytes < 1) {
    throw new Error('Label image is empty')
  }

  const imageData = ctx.getImageData(0, 0, srcW, srcH)
  const pixels = imageData.data
  const body = new Uint8Array(widthBytes * heightDots)

  for (let y = 0; y < heightDots; y += 1) {
    for (let byteIndex = 0; byteIndex < widthBytes; byteIndex += 1) {
      let byte = 0
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteIndex * 8 + bit
        if (x >= widthDots || x >= srcW) continue
        const i = (y * srcW + x) * 4
        const lum = pixels[i] + pixels[i + 1] + pixels[i + 2]
        // Dark pixels print (thermal black)
        if (lum < 500) byte |= 0x80 >> bit
      }
      body[y * widthBytes + byteIndex] = byte
    }
  }

  // GS v 0 m xL xH yL yH d…
  // m=0 normal; x = width in BYTES; y = height in DOTS
  const header = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    heightDots & 0xff,
    (heightDots >> 8) & 0xff,
  ])

  return concatBytes([header, body])
}

/** Full print job: init → receipt mode → raster → short feed. */
export function buildBixolonLabelEscPos(canvas: HTMLCanvasElement): Uint8Array {
  const raster = canvasToGsV0Raster(canvas)
  return concatBytes([ESC_INIT, SELECT_RECEIPT_MODE, raster, feedLines(3)])
}

type UsbEndpointLike = { direction: string; type: string; endpointNumber: number }
type UsbAlternateLike = {
  alternateSetting: number
  endpoints: UsbEndpointLike[]
}
type UsbInterfaceLike = {
  interfaceNumber: number
  alternates: UsbAlternateLike[]
}
type UsbConfigurationLike = { interfaces: UsbInterfaceLike[] }
type UsbDeviceLike = {
  configuration: UsbConfigurationLike | null
  open: () => Promise<void>
  close: () => Promise<void>
  selectConfiguration: (value: number) => Promise<void>
  claimInterface: (interfaceNumber: number) => Promise<void>
  selectAlternateInterface: (interfaceNumber: number, alternateSetting: number) => Promise<void>
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<unknown>
}

type UsbNavigator = Navigator & {
  usb: {
    requestDevice: (options: { filters: Array<{ vendorId: number }> }) => Promise<UsbDeviceLike>
  }
}

export async function sendEscPosOverWebUsb(data: Uint8Array): Promise<void> {
  if (!('usb' in navigator)) {
    throw new Error('WebUSB is not available in this browser')
  }

  const usb = (navigator as UsbNavigator).usb
  const device = await usb.requestDevice({
    filters: [
      { vendorId: 0x1504 }, // BIXOLON
      { vendorId: 0x0419 }, // Samsung/BIXOLON legacy
    ],
  })

  await device.open()
  try {
    if (device.configuration === null) {
      await device.selectConfiguration(1)
    }

    const configuration = device.configuration
    if (!configuration) throw new Error('Could not select USB configuration')

    let claimedInterface = -1
    let outEndpoint = -1

    for (const iface of configuration.interfaces) {
      for (const alternate of iface.alternates) {
        const bulkOut = alternate.endpoints.find(
          (endpoint) => endpoint.direction === 'out' && endpoint.type === 'bulk',
        )
        if (!bulkOut) continue
        try {
          await device.claimInterface(iface.interfaceNumber)
          if (alternate.alternateSetting !== 0) {
            await device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting)
          }
          claimedInterface = iface.interfaceNumber
          outEndpoint = bulkOut.endpointNumber
          break
        } catch {
          /* try next interface — Windows driver may hold some */
        }
      }
      if (outEndpoint >= 0) break
    }

    if (claimedInterface < 0 || outEndpoint < 0) {
      throw new Error(
        'Could not claim the Bixolon USB interface. Close other apps using the printer, or use Download .prn / Web Serial.',
      )
    }

    const chunkSize = 512
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.subarray(offset, Math.min(offset + chunkSize, data.length))
      await device.transferOut(outEndpoint, chunk as unknown as BufferSource)
    }
  } finally {
    try {
      await device.close()
    } catch {
      /* ignore */
    }
  }
}

type SerialPortLike = {
  open: (options: { baudRate: number; bufferSize?: number }) => Promise<void>
  close: () => Promise<void>
  writable: WritableStream<Uint8Array> | null
  getInfo?: () => { bluetoothServiceClassId?: number | string; usbVendorId?: number }
}

type SerialRequestOptions = {
  filters?: Array<{ usbVendorId?: number; bluetoothServiceClassId?: number | string }>
  allowedBluetoothServiceClassIds?: Array<number | string>
}

type SerialNavigator = Navigator & {
  serial: {
    requestPort: (options?: SerialRequestOptions) => Promise<SerialPortLike>
    getPorts?: () => Promise<SerialPortLike[]>
  }
}

export type SerialSendOptions = {
  /**
   * Prefer Bluetooth / wireless serial.
   * On Windows, open the picker with no USB-only filters so mapped COM ports
   * (Standard Serial over Bluetooth link) appear — strict BT filters often show nothing.
   */
  bluetoothOnly?: boolean
}

/** Bluetooth Classic Serial Port Profile (SPP) service class. */
const BLUETOOTH_SPP_SERVICE = 0x1101

async function writeSerialChunks(
  writable: WritableStream<Uint8Array>,
  data: Uint8Array,
  chunkSize: number,
) {
  const writer = writable.getWriter()
  try {
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.subarray(offset, Math.min(offset + chunkSize, data.length))
      await writer.write(chunk)
    }
  } finally {
    writer.releaseLock()
  }
}

async function requestSerialPort(
  serial: SerialNavigator['serial'],
  bluetoothOnly: boolean,
): Promise<SerialPortLike> {
  // No filters: Windows often exposes the paired Bixolon as a COM port
  // ("Standard Serial over Bluetooth link"). Filtering to bluetoothServiceClassId
  // alone frequently shows an empty Chrome picker.
  const openPicker = () =>
    serial.requestPort(
      bluetoothOnly
        ? { allowedBluetoothServiceClassIds: [BLUETOOTH_SPP_SERVICE] }
        : {
            allowedBluetoothServiceClassIds: [BLUETOOTH_SPP_SERVICE],
            filters: [
              { usbVendorId: 0x1504 },
              { usbVendorId: 0x0419 },
              { bluetoothServiceClassId: BLUETOOTH_SPP_SERVICE },
            ],
          },
    )

  try {
    return await openPicker()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel|denied|No port selected/i.test(message)) throw error
    // Last resort: every serial port Chrome can see
    return serial.requestPort()
  }
}

/**
 * Send ESC/POS over Web Serial.
 * Use `bluetoothOnly: true` for a paired Bixolon SPP-R200III over Bluetooth Classic (Chrome desktop).
 *
 * Must be called from the main page (not an about:blank popup) so Chrome shows the port picker.
 */
export async function sendEscPosOverWebSerial(
  data: Uint8Array,
  options: SerialSendOptions = {},
): Promise<void> {
  if (!('serial' in navigator)) {
    throw new Error('Web Serial is not available in this browser — use Google Chrome on Windows/Mac')
  }

  const serial = (navigator as SerialNavigator).serial
  const bluetoothOnly = Boolean(options.bluetoothOnly)

  // Prefer a completely unfiltered picker so Windows COM3/COM4 Bluetooth links always appear.
  let port: SerialPortLike
  try {
    if (bluetoothOnly) {
      try {
        port = await serial.requestPort({
          allowedBluetoothServiceClassIds: [BLUETOOTH_SPP_SERVICE],
        })
      } catch (firstErr) {
        const message = firstErr instanceof Error ? firstErr.message : String(firstErr)
        if (/cancel|denied|No port selected/i.test(message)) throw firstErr
        port = await serial.requestPort()
      }
    } else {
      port = await requestSerialPort(serial, false)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel|denied|No port selected/i.test(message)) throw error
    port = await serial.requestPort()
  }

  // Baud is ignored for Bluetooth RFCOMM but required by the API.
  await port.open({ baudRate: 115200, bufferSize: 16 * 1024 })
  try {
    if (!port.writable) throw new Error('Serial port is not writable')
    // Smaller chunks are more reliable over Bluetooth RFCOMM.
    await writeSerialChunks(port.writable, data, bluetoothOnly ? 128 : 512)
  } finally {
    try {
      await port.close()
    } catch {
      /* ignore */
    }
  }
}

/** Alias: print one-label ESC/POS job to a paired Bluetooth Classic printer via Web Serial. */
export async function sendEscPosOverBluetooth(data: Uint8Array): Promise<void> {
  return sendEscPosOverWebSerial(data, { bluetoothOnly: true })
}
