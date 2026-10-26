const disabled = new Set()
const supportedTypes = ['gif', 'jpg', 'png', 'webp']

function ensure(input, offset, length) {
  if (offset < 0 || length < 0 || offset + length > input.length) throw new TypeError('Invalid or truncated image data')
}

function dimensions(width, height, type) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new TypeError('Invalid image dimensions')
  if (disabled.has(type)) throw new TypeError(`Image type disabled: ${type}`)
  return { width, height, type }
}

function readJpeg(input) {
  let offset = 2
  while (offset < input.length) {
    ensure(input, offset, 4)
    if (input[offset] !== 0xFF) throw new TypeError('Invalid JPEG marker')
    const marker = input[offset + 1]
    offset += 2
    if (marker === 0xD8 || marker === 0xD9) continue
    const segmentLength = input.readUInt16BE(offset)
    if (segmentLength < 2) throw new TypeError('Invalid JPEG segment length')
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
      ensure(input, offset, 7)
      return dimensions(input.readUInt16BE(offset + 5), input.readUInt16BE(offset + 3), 'jpg')
    }
    ensure(input, offset, segmentLength)
    offset += segmentLength
  }
  throw new TypeError('JPEG dimensions not found')
}

function readWebp(input) {
  ensure(input, 0, 30)
  const kind = input.toString('ascii', 12, 16)
  if (kind === 'VP8X') return dimensions(1 + input.readUIntLE(24, 3), 1 + input.readUIntLE(27, 3), 'webp')
  if (kind === 'VP8 ') return dimensions(input.readUInt16LE(26) & 0x3FFF, input.readUInt16LE(28) & 0x3FFF, 'webp')
  if (kind === 'VP8L') {
    const bits = input.readUInt32LE(21)
    return dimensions((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1, 'webp')
  }
  throw new TypeError('Unsupported WebP encoding')
}

function imageSize(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(value)
  ensure(input, 0, 4)
  if (input.length >= 24 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return dimensions(input.readUInt32BE(16), input.readUInt32BE(20), 'png')
  }
  const header = input.toString('ascii', 0, 6)
  if (header === 'GIF87a' || header === 'GIF89a') {
    ensure(input, 0, 10)
    return dimensions(input.readUInt16LE(6), input.readUInt16LE(8), 'gif')
  }
  if (input[0] === 0xFF && input[1] === 0xD8) return readJpeg(input)
  if (input.length >= 16 && input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP') return readWebp(input)
  throw new TypeError('Unsupported image type')
}

function disableTypes(types) {
  for (const type of types) disabled.add(type)
}

module.exports = imageSize
module.exports.default = imageSize
module.exports.imageSize = imageSize
module.exports.disableTypes = disableTypes
module.exports.types = supportedTypes
