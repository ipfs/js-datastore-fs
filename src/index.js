'use strict'

const fs = require('fs')
const glob = require('it-glob')
// @ts-ignore
const mkdirp = require('mkdirp')
const promisify = require('util').promisify
// @ts-ignore
const writeAtomic = promisify(require('fast-write-atomic'))
const path = require('path')
const {
  Adapter, Key, Errors
} = require('interface-datastore')
const map = require('it-map')

const noop = () => {}
const fsAccess = promisify(fs.access || noop)
const fsReadFile = promisify(fs.readFile || noop)
const fsUnlink = promisify(fs.unlink || noop)

/**
 * @typedef {import('interface-datastore').Datastore} Datastore
 * @typedef {import('interface-datastore').Pair} Pair
 * @typedef {import('interface-datastore').Query} Query
 * @typedef {import('interface-datastore').KeyQuery} KeyQuery
 */

/**
 * Write a file atomically
 *
 * @param {string} path
 * @param {Uint8Array} contents
 */
async function writeFile (path, contents) {
  try {
    await writeAtomic(path, contents)
  } catch (err) {
    if (err.code === 'EPERM' && err.syscall === 'rename') {
      // fast-write-atomic writes a file to a temp location before renaming it.
      // On Windows, if the final file already exists this error is thrown.
      // No such error is thrown on Linux/Mac
      // Make sure we can read & write to this file
      await fsAccess(path, fs.constants.F_OK | fs.constants.W_OK)

      // The file was created by another context - this means there were
      // attempts to write the same block by two different function calls
      return
    }

    throw err
  }
}

/**
 * A datastore backed by the file system.
 *
 * Keys need to be sanitized before use, as they are written
 * to the file system as is.
 *
 * @implements {Datastore}
 */
class FsDatastore extends Adapter {
  /**
   * @param {string} location
   * @param {{ createIfMissing?: boolean; errorIfExists?: boolean; extension?: string; } | undefined} [opts]
   */
  constructor (location, opts) {
    super()

    this.path = path.resolve(location)
    this.opts = Object.assign({}, {
      createIfMissing: true,
      errorIfExists: false,
      extension: '.data'
    }, opts)
  }

  open () {
    try {
      if (!fs.existsSync(this.path)) {
        throw Errors.notFoundError(new Error(`Datastore directory: ${this.path} does not exist`))
      }

      if (this.opts.errorIfExists) {
        throw Errors.dbOpenFailedError(new Error(`Datastore directory: ${this.path} already exists`))
      }
      return Promise.resolve()
    } catch (err) {
      if (err.code === 'ERR_NOT_FOUND' && this.opts.createIfMissing) {
        mkdirp.sync(this.path, { fs: fs })
        return Promise.resolve()
      }

      throw err
    }
  }

  close () {
    return Promise.resolve()
  }

  /**
   * Calculate the directory and file name for a given key.
   *
   * @private
   * @param {Key} key
   * @returns {{dir:string, file:string}}
   */
  _encode (key) {
    const parent = key.parent().toString()
    const dir = path.join(this.path, parent)
    const name = key.toString().slice(parent.length)
    const file = path.join(dir, name + this.opts.extension)

    return {
      dir: dir,
      file: file
    }
  }

  /**
   * Calculate the original key, given the file name.
   *
   * @private
   * @param {string} file
   * @returns {Key}
   */
  _decode (file) {
    const ext = this.opts.extension
    if (path.extname(file) !== ext) {
      throw new Error(`Invalid extension: ${path.extname(file)}`)
    }

    const keyname = file
      .slice(this.path.length, -ext.length)
      .split(path.sep)
      .join('/')
    return new Key(keyname)
  }

  /**
   * Write to the file system without extension.
   *
   * @param {Key} key
   * @param {Uint8Array} val
   * @returns {Promise<void>}
   */
  async putRaw (key, val) {
    const parts = this._encode(key)
    let file = parts.file

    if (this.opts.extension.length) {
      file = parts.file.slice(0, -this.opts.extension.length)
    }

    await mkdirp(parts.dir, { fs: fs })
    await writeFile(file, val)
  }

  /**
   * Store the given value under the key
   *
   * @param {Key} key
   * @param {Uint8Array} val
   * @returns {Promise<void>}
   */
  async put (key, val) {
    const parts = this._encode(key)

    try {
      await mkdirp(parts.dir, { fs: fs })
      await writeFile(parts.file, val)
    } catch (err) {
      throw Errors.dbWriteFailedError(err)
    }
  }

  /**
   * Read from the file system without extension.
   *
   * @param {Key} key
   * @returns {Promise<Uint8Array>}
   */
  async getRaw (key) {
    const parts = this._encode(key)
    let file = parts.file

    if (this.opts.extension.length) {
      file = file.slice(0, -this.opts.extension.length)
    }

    let data
    try {
      data = await fsReadFile(file)
    } catch (err) {
      throw Errors.notFoundError(err)
    }
    return data
  }

  /**
   * Read from the file system.
   *
   * @param {Key} key
   * @returns {Promise<Uint8Array>}
   */
  async get (key) {
    const parts = this._encode(key)
    let data
    try {
      data = await fsReadFile(parts.file)
    } catch (err) {
      throw Errors.notFoundError(err)
    }
    return data
  }

  /**
   * Check for the existence of the given key.
   *
   * @param {Key} key
   * @returns {Promise<boolean>}
   */
  async has (key) {
    const parts = this._encode(key)
    try {
      await fsAccess(parts.file)
    } catch (err) {
      return false
    }
    return true
  }

  /**
   * Delete the record under the given key.
   *
   * @param {Key} key
   * @returns {Promise<void>}
   */
  async delete (key) {
    const parts = this._encode(key)
    try {
      await fsUnlink(parts.file)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return
      }

      throw Errors.dbDeleteFailedError(err)
    }
  }

  /**
   * @param {Query} q
   */
  async * _all (q) {
    let prefix = q.prefix || '**'

    // strip leading slashes
    prefix = prefix.replace(/^\/+/, '')

    const pattern = `${prefix}/*${this.opts.extension}`
      .split(path.sep)
      .join('/')
    const files = glob(this.path, pattern, {
      absolute: true
    })

    for await (const file of files) {
      try {
        const buf = await fsReadFile(file)

        /** @type {Pair} */
        const pair = {
          key: this._decode(file),
          value: buf
        }

        yield pair
      } catch (err) {
        // if keys are removed from the datastore while the query is
        // running, we may encounter missing files.
        if (err.code !== 'ENOENT') {
          throw err
        }
      }
    }
  }

  /**
   * @param {KeyQuery} q
   */
  async * _allKeys (q) {
    let prefix = q.prefix || '**'

    // strip leading slashes
    prefix = prefix.replace(/^\/+/, '')

    const pattern = `${prefix}/*${this.opts.extension}`
      .split(path.sep)
      .join('/')
    const files = glob(this.path, pattern, {
      absolute: true
    })

    yield * map(files, f => this._decode(f))
  }
}

module.exports = FsDatastore
