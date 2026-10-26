const debug = require('debug')('extract-zip')
const { createWriteStream, promises: fs } = require('fs')
const getStream = require('get-stream')
const path = require('path')
const { promisify } = require('util')
const stream = require('stream')
const yauzl = require('yauzl')

const openZip = promisify(yauzl.open)
const pipeline = promisify(stream.pipeline)

function isInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

class Extractor {
  constructor(zipPath, opts) {
    this.zipPath = zipPath
    this.opts = opts
  }

  async extract() {
    debug('opening', this.zipPath, 'with opts', this.opts)
    this.zipfile = await openZip(this.zipPath, { lazyEntries: true })
    this.canceled = false

    return new Promise((resolve, reject) => {
      this.zipfile.on('error', (error) => {
        this.canceled = true
        reject(error)
      })
      this.zipfile.on('close', () => {
        if (!this.canceled) resolve()
      })
      this.zipfile.on('entry', async (entry) => {
        if (this.canceled) return
        if (entry.fileName.startsWith('__MACOSX/')) {
          this.zipfile.readEntry()
          return
        }

        try {
          const destination = path.join(this.opts.dir, entry.fileName)
          const destinationDirectory = path.dirname(destination)
          await fs.mkdir(destinationDirectory, { recursive: true })
          const realDestinationDirectory = await fs.realpath(destinationDirectory)
          if (!isInside(this.opts.dir, realDestinationDirectory)) {
            throw new Error(`Archive entry escapes extraction root: ${entry.fileName}`)
          }
          await this.extractEntry(entry, destination)
          this.zipfile.readEntry()
        } catch (error) {
          this.canceled = true
          this.zipfile.close()
          reject(error)
        }
      })
      this.zipfile.readEntry()
    })
  }

  async extractEntry(entry, destination) {
    if (this.opts.onEntry) this.opts.onEntry(entry, this.zipfile)

    const mode = (entry.externalFileAttributes >> 16) & 0xFFFF
    const typeMask = 61440
    const directoryType = 16384
    const symlinkType = 40960
    const isSymlink = (mode & typeMask) === symlinkType
    let isDirectory = (mode & typeMask) === directoryType || entry.fileName.endsWith('/')
    const madeBy = entry.versionMadeBy >> 8
    if (!isDirectory) isDirectory = madeBy === 0 && entry.externalFileAttributes === 16

    const extractedMode = this.getExtractedMode(mode, isDirectory) & 0o777
    const destinationDirectory = isDirectory ? destination : path.dirname(destination)
    await fs.mkdir(destinationDirectory, { recursive: true, mode: isDirectory ? extractedMode : undefined })
    if (isDirectory) return

    const readStream = await promisify(this.zipfile.openReadStream.bind(this.zipfile))(entry)
    if (!isSymlink) {
      await pipeline(readStream, createWriteStream(destination, { mode: extractedMode }))
      return
    }

    const link = await getStream(readStream)
    if (path.isAbsolute(link)) throw new Error(`Absolute symbolic link rejected: ${entry.fileName}`)
    const proposedTarget = path.resolve(path.dirname(destination), link)
    if (!isInside(this.opts.dir, proposedTarget)) throw new Error(`Symbolic link escapes extraction root: ${entry.fileName}`)

    let realTarget
    try {
      realTarget = await fs.realpath(proposedTarget)
    } catch {
      throw new Error(`Dangling symbolic link rejected: ${entry.fileName}`)
    }
    if (!isInside(this.opts.dir, realTarget)) throw new Error(`Symbolic link target escapes extraction root: ${entry.fileName}`)
    await fs.symlink(link, destination)
  }

  getExtractedMode(entryMode, isDirectory) {
    if (entryMode !== 0) return entryMode
    if (isDirectory) return Number.parseInt(this.opts.defaultDirMode, 10) || 0o755
    return Number.parseInt(this.opts.defaultFileMode, 10) || 0o644
  }
}

async function extract(zipPath, opts) {
  if (!path.isAbsolute(opts.dir)) throw new Error('Target directory is expected to be absolute')
  await fs.mkdir(opts.dir, { recursive: true })
  opts.dir = await fs.realpath(opts.dir)
  return new Extractor(zipPath, opts).extract()
}

module.exports = extract
module.exports._isInside = isInside
