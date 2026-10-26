import { access, readFile } from 'node:fs/promises'

const required = [
  'LICENSE', 'NOTICE', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md',
  'SUPPORT.md', 'CHANGELOG.md', 'docs/support-matrix.md', 'docs/known-limitations.md',
  'docs/release-checklist.md', '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/feature.yml', '.github/ISSUE_TEMPLATE/config.yml',
  '.github/pull_request_template.md',
]
for (const path of required) await access(path)

const license = await readFile('LICENSE', 'utf8')
if (!license.includes('Apache License') || !license.includes('END OF TERMS AND CONDITIONS')) throw new Error('LICENSE is not a complete Apache-2.0 license')

const readme = await readFile('README.md', 'utf8')
for (const link of ['SECURITY.md', 'CONTRIBUTING.md', 'SUPPORT.md', 'docs/known-limitations.md', 'docs/release-checklist.md']) {
  if (!readme.includes(link)) throw new Error(`README.md must link ${link}`)
}
if (/100% production-ready|fully production-ready/i.test(readme)) throw new Error('README contains an unqualified production-ready claim')

console.log('Public repository readiness baseline passed')
