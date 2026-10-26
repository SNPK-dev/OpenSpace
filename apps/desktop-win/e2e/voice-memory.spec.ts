import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { AUTH_STATE_PATH, API_URL, ADMIN_TOKEN } from './shared'

test.use({ storageState: AUTH_STATE_PATH })

const cycles = Number(process.env.VOICE_MEMORY_CYCLES ?? 5)
const heapGrowthBudgetMb = Number(process.env.VOICE_HEAP_GROWTH_BUDGET_MB ?? 32)
const nodeGrowthBudget = Number(process.env.VOICE_DOM_NODE_GROWTH_BUDGET ?? 500)
const output = resolve(process.env.VOICE_MEMORY_OUTPUT ?? 'test-results/client-performance/voice-memory.json')

async function joinAndLeave(page: Page, channelId: string, navigate = false): Promise<void> {
  if (navigate) await page.goto(`/#/channels/${channelId}`)
  const join = page.locator('.voice-btn-toggle', { hasText: /Join Voice/ })
  await expect(join).toBeVisible({ timeout: 10_000 })
  await join.click()
  const leave = page.locator('.voice-btn-leave')
  await expect(leave).toBeVisible({ timeout: 15_000 })
  await leave.click()
  await expect(join).toBeVisible({ timeout: 10_000 })
}

test('voice join/leave cycles stay within heap and DOM growth budgets', async ({ page, context }) => {
  const roomResponse = await fetch(`${API_URL}/api/v1/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: `Voice memory ${Date.now()}` }),
  })
  expect(roomResponse.ok).toBeTruthy()
  const room = await roomResponse.json() as { id: string }
  const channelResponse = await fetch(`${API_URL}/api/v1/rooms/${room.id}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ name: 'voice-memory', type: 'voice' }),
  })
  expect(channelResponse.ok).toBeTruthy()
  const channel = await channelResponse.json() as { id: string }

  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    const [{ metrics }, dom] = await Promise.all([
      cdp.send('Performance.getMetrics'),
      cdp.send('Memory.getDOMCounters'),
    ])
    const heapBytes = metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? 0
    if (heapBytes <= 0 || dom.nodes <= 0) throw new Error('Chromium did not expose usable memory metrics')
    return { heap_mb: heapBytes / 1024 / 1024, dom_nodes: dom.nodes }
  }

  try {
    // Warm LiveKit, media permissions, and lazy chunks before taking the baseline.
    await joinAndLeave(page, channel.id, true)
    const before = await sample()
    for (let cycle = 0; cycle < cycles; cycle += 1) await joinAndLeave(page, channel.id)
    const after = await sample()
    const heapGrowthMb = Math.round((after.heap_mb - before.heap_mb) * 10) / 10
    const domNodeGrowth = after.dom_nodes - before.dom_nodes
    const pass = heapGrowthMb <= heapGrowthBudgetMb && domNodeGrowth <= nodeGrowthBudget
    const evidence = {
      schema_version: 1,
      completed_at: new Date().toISOString(),
      environment: `${process.platform}-${process.arch} Chromium voice lifecycle`,
      cycles,
      measurements: {
        initial_heap_mb: Math.round(before.heap_mb * 10) / 10,
        final_heap_mb: Math.round(after.heap_mb * 10) / 10,
        heap_growth_mb: heapGrowthMb,
        initial_dom_nodes: before.dom_nodes,
        final_dom_nodes: after.dom_nodes,
        dom_node_growth: domNodeGrowth,
      },
      budgets: { heap_growth_mb: heapGrowthBudgetMb, dom_node_growth: nodeGrowthBudget },
      blocking_findings: pass ? 0 : 1,
      result: pass ? 'pass' : 'fail',
    }
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    expect(evidence, JSON.stringify(evidence, null, 2)).toMatchObject({ result: 'pass', blocking_findings: 0 })
  } finally {
    await fetch(`${API_URL}/api/v1/rooms/${room.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    })
  }
})
