import { readFile } from 'node:fs/promises'

const path = process.argv[2]
if (!path) throw new Error('Usage: node scripts/validate-client-performance-evidence.mjs <evidence.json>')
const evidence = JSON.parse(await readFile(path, 'utf8'))
if (evidence.schema_version !== 1 || !evidence.completed_at || !evidence.environment) throw new Error('Invalid client performance evidence metadata')
if (evidence.result !== 'pass' || evidence.blocking_findings !== 0) throw new Error('Client performance evidence does not pass')
const metrics = evidence.measurements?.heap_growth_mb !== undefined
  ? ['heap_growth_mb', 'dom_node_growth']
  : ['cold_start_ms', 'initial_rss_mb']
for (const metric of metrics) {
  if (!Number.isFinite(evidence.measurements?.[metric]) || !Number.isFinite(evidence.budgets?.[metric])) throw new Error(`Missing ${metric}`)
  if (evidence.measurements[metric] > evidence.budgets[metric]) throw new Error(`${metric} exceeds its budget`)
}
console.log(metrics.includes('heap_growth_mb') ? 'Voice lifecycle memory evidence passed' : 'Electron cold-start and initial-memory evidence passed')
