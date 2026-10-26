import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const roots = ['apps/web-client/src', 'apps/desktop-win/src/renderer/src', 'apps/admin-web/src']
const sourceExtensions = /\.(?:ts|tsx|js|jsx|css|html)$/
const badText = /[\u0400-\u04ff]|(?:Ã.|Â.|â€|â€”|Ð.|Ñ.|Р.|С.|вЂ|Г—)/u
const failures = []

async function filesIn(dir) {
  const result = []
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry)
    if ((await stat(path)).isDirectory()) result.push(...await filesIn(path))
    else if (sourceExtensions.test(entry)) result.push(path)
  }
  return result
}

for (const root of roots) {
  for (const file of await filesIn(root)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file))
    text.split(/\r?\n/).forEach((line, index) => {
      if (badText.test(line)) failures.push(`${relative('.', file)}:${index + 1}`)
    })
  }
}
if (failures.length) {
  console.error(`Supported v1 client sources contain non-English or mojibake text:\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('Client quality source gate passed: UTF-8 English-only UI')
await import('./validate-client-performance.mjs')
