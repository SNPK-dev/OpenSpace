const assert = require('node:assert/strict')
const test = require('node:test')
const imageSize = require('./index.js')

test('reads bounded PNG dimensions', () => {
  const input = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(input)
  input.writeUInt32BE(320, 16)
  input.writeUInt32BE(200, 20)
  assert.deepEqual(imageSize(input), { width: 320, height: 200, type: 'png' })
})

test('reads bounded GIF dimensions', () => {
  const input = Buffer.alloc(10)
  input.write('GIF89a')
  input.writeUInt16LE(64, 6)
  input.writeUInt16LE(48, 8)
  assert.deepEqual(imageSize(input), { width: 64, height: 48, type: 'gif' })
})

test('rejects truncated and unsupported data', () => {
  assert.throws(() => imageSize(Buffer.from([137, 80, 78, 71])), /truncated|Unsupported/)
  assert.throws(() => imageSize(Buffer.from('icns00000000')), /Unsupported/)
})
