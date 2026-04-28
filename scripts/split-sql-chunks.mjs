import fs from 'node:fs'
import path from 'node:path'

const [, , inputPathArg, outPrefixArg, maxBytesArg] = process.argv

if (!inputPathArg || !outPrefixArg) {
  console.error('Usage: node scripts/split-sql-chunks.mjs <input.sql> <output-prefix> [max-bytes]')
  process.exit(1)
}

const inputPath = path.resolve(inputPathArg)
const outPrefix = path.resolve(outPrefixArg)
const maxBytes = Number(maxBytesArg || 180000)

if (!Number.isFinite(maxBytes) || maxBytes < 5000) {
  console.error('max-bytes must be a number >= 5000')
  process.exit(1)
}

const text = fs.readFileSync(inputPath, 'utf8')
const lines = text.split(/\r?\n/)

let i = 0
let part = 1
let wrote = 0

while (i < lines.length) {
  const chunk = []
  if ((lines[i] ?? '').trim().toLowerCase() === 'begin;') i += 1

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim().toLowerCase() === 'commit;') {
      i += 1
      break
    }
    chunk.push(line)
    i += 1
    if (chunk.join('\n').length > maxBytes && line.trim().endsWith(';')) break
  }

  const body = chunk.join('\n').trim()
  if (!body) continue

  const out = `begin;\n\n${body}\n\ncommit;\n`
  const outPath = `${outPrefix}-${String(part).padStart(2, '0')}.sql`
  fs.writeFileSync(outPath, out, 'utf8')
  wrote += 1
  part += 1
}

console.log(`Wrote ${wrote} files using prefix: ${outPrefix}`)
