import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = join(root, 'plug-valve-itp.html')
let h = readFileSync(p, 'utf8')
const alpineNeedle = '<script defer src="https://cdn.jsdelivr.net/npm/alpinejs'
const a = h.indexOf(alpineNeedle)
if (a < 0) throw new Error('no alpine')
const b = h.slice(0, a)
const dupMarker = '</script>\n\n  <script>\nfunction plugValveItpFactory'
const d = b.indexOf(dupMarker)
if (d < 0) {
  console.log('No duplicate found')
  process.exit(0)
}
const fixed = b.slice(0, d + '</script>'.length) + '\n\n  ' + h.slice(a)
writeFileSync(p, fixed)
console.log('Removed duplicate script block')
