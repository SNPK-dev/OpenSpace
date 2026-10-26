import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { _electron as electron } from '@playwright/test'

const output = resolve(process.env.CLIENT_PERFORMANCE_OUTPUT ?? 'test-results/client-performance.json')
const coldStartBudgetMs = Number(process.env.ELECTRON_COLD_START_BUDGET_MS ?? 5_000)
const initialRssBudgetMb = Number(process.env.ELECTRON_INITIAL_RSS_BUDGET_MB ?? 500)
const started = performance.now()
const app = await electron.launch({
  args: [resolve('out/main/index.js')],
  env: { ...process.env, OPENSPACE_ELECTRON_TEST_PACKAGED: '1' },
})

try {
  const window = await app.firstWindow({ timeout: coldStartBudgetMs })
  await window.waitForLoadState('domcontentloaded')
  await window.locator('#root').waitFor({ state: 'visible' })
  const coldStartMs = Math.round(performance.now() - started)
  const memory = await app.evaluate(() => process.memoryUsage())
  const initialRssMb = Math.round(memory.rss / 1024 / 1024 * 10) / 10
  const evidence = {
    schema_version: 1,
    completed_at: new Date().toISOString(),
    environment: `${process.platform}-${process.arch} Node ${process.version}`,
    measurements: { cold_start_ms: coldStartMs, initial_rss_mb: initialRssMb },
    budgets: { cold_start_ms: coldStartBudgetMs, initial_rss_mb: initialRssBudgetMb },
    blocking_findings: Number(coldStartMs > coldStartBudgetMs) + Number(initialRssMb > initialRssBudgetMb),
    result: coldStartMs <= coldStartBudgetMs && initialRssMb <= initialRssBudgetMb ? 'pass' : 'fail',
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(evidence, null, 2))
  if (evidence.result !== 'pass') process.exitCode = 1
} finally {
  await app.close()
}
