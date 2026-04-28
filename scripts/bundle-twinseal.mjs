import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { TORQUE_TABLES } from './twinseal-torque-data.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const templatePath = join(root, 'twinseal-itp.template.html')
const htmlPath = join(root, 'twinseal-itp.html')
const appLogicPath = join(__dirname, 'twinseal-app-inline.js')

const sourceHtml = existsSync(templatePath)
  ? readFileSync(templatePath, 'utf8')
  : readFileSync(htmlPath, 'utf8')

let html = sourceHtml
if (!html.includes('<!--TWINSEAL_BUNDLE-->')) {
  console.error(
    'Missing <!--TWINSEAL_BUNDLE-->. Add twinseal-itp.template.html or restore the marker in the HTML source.',
  )
  process.exit(1)
}

const appLogic = readFileSync(appLogicPath, 'utf8')
const torqueJson = JSON.stringify(TORQUE_TABLES)

const bundle = `<script>
const TORQUE_TABLES = ${torqueJson};
document.addEventListener('alpine:init', () => {
  Alpine.data('twinsealItpApp', twinsealItpAppFactory);
});
${appLogic}
</script>
`

html = html.replace('<!--TWINSEAL_BUNDLE-->', bundle)
writeFileSync(htmlPath, html)
console.log('Updated twinseal-itp.html with embedded torque + app logic.')
