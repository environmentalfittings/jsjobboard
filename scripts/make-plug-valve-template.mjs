import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundled = readFileSync(join(root, 'plug-valve-itp.html'), 'utf8')
const scriptStart = bundled.indexOf('\n\n  <script>\nfunction plugValveItpFactory')
const scriptEnd = bundled.indexOf('</script>', scriptStart) + '</script>'.length
const alpineLine = bundled.slice(scriptEnd).replace(/^\s+/, '')
const userStart = bundled.indexOf('    <div x-show="user" x-cloak class="pb-16">')
if (userStart < 0 || scriptStart < 0) throw new Error('parse failed')
const head = bundled.slice(0, userStart)
const tail = '\n\n  <!--PLUG_SCRIPT-->\n\n  ' + alpineLine
const out = head + '    <div x-show="user" x-cloak class="pb-16">\n      <!--PLUG_BODY-->\n    </div>\n  </div>' + tail
writeFileSync(join(root, 'plug-valve-itp.template.html'), out)
console.log('Wrote plug-valve-itp.template.html')
