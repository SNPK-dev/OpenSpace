const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const extract = require('./index.js')

test('path containment accepts only the extraction root and its descendants', () => {
  const root = path.resolve('safe-root')
  assert.equal(extract._isInside(root, root), true)
  assert.equal(extract._isInside(root, path.join(root, 'nested', 'file')), true)
  assert.equal(extract._isInside(root, path.resolve(root, '..', 'outside')), false)
  assert.equal(extract._isInside(root, `${root}-lookalike`), false)
})

test('an extraction target must be absolute', async () => {
  await assert.rejects(extract('unused.zip', { dir: 'relative' }), /expected to be absolute/)
})
