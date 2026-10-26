import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const targets = [
  { dir: 'apps/web-client/dist/assets', entry: 700_000, chunk: 1_100_000 },
  { dir: 'apps/desktop-win/out/renderer/assets', entry: 750_000, chunk: 1_100_000 },
]
for (const target of targets) {
  const scripts = (await readdir(target.dir)).filter(file => file.endsWith('.js'))
  if (!scripts.length) throw new Error(`No JavaScript bundles found in ${target.dir}`)
  for (const file of scripts) {
    const path = join(target.dir, file)
    const size = (await stat(path)).size
    const limit = /index-|main-/.test(file) ? target.entry : target.chunk
    if (size > limit) throw new Error(`${path} is ${size} bytes; budget is ${limit}`)
    if (/[\u0400-\u04ff]|Ã.|Â.|â€|Ð.|Ñ.|Р.|С.|вЂ/u.test(await readFile(path, 'utf8'))) throw new Error(`${path} contains non-English or mojibake text`)
  }
}
console.log('Supported client bundles satisfy V1 size and encoding budgets')
