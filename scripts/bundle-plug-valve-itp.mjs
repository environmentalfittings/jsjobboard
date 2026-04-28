import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const templatePath = join(root, 'plug-valve-itp.template.html')
const htmlPath = join(root, 'plug-valve-itp.html')
const bodyPath = join(__dirname, 'plug-valve-itp-body.html')
const jsPath = join(__dirname, 'plug-valve-itp-inline.js')

const sourcePath = existsSync(templatePath) ? templatePath : htmlPath
let html = readFileSync(sourcePath, 'utf8')
const body = readFileSync(bodyPath, 'utf8')
const js = readFileSync(jsPath, 'utf8')

if (!html.includes('<!--PLUG_BODY-->')) {
  console.error('Missing <!--PLUG_BODY--> in ' + sourcePath)
  process.exit(1)
}
if (!html.includes('<!--PLUG_SCRIPT-->')) {
  console.error('Missing <!--PLUG_SCRIPT--> in ' + sourcePath)
  process.exit(1)
}

html = html.replace('<!--PLUG_BODY-->', body)
html = html.replace('<!--PLUG_SCRIPT-->', `<script>\n${js}\n</script>`)
writeFileSync(htmlPath, html)
console.log('Wrote plug-valve-itp.html from ' + (existsSync(templatePath) ? 'template' : 'html (markers)'))
