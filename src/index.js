import fs from 'fs'
import glob from 'it-glob'
import mkdirp from 'mkdirp'
import path from 'path'
import { promisify } from 'util'
import {
  Key
} from 'interface-datastore'
import {
  BaseDatastore, Errors
} from 'datastore-core'
import map from 'it-map'
import parallel from 'it-parallel-batch'
// @ts-ignore no types
import fwa from 'fast-write-atomic'

// @ts-ignore
const writeAtomic = promisify(fwa)

/**
 * @typedef {import('interface-datastore').Datastore} Datastore
 * @typedef {import('interface-datastore').Pair} Pair
 * @typedef {import('interface-datastore').Query} Query
 * @typedef {import('interface-datastore').KeyQuery} KeyQuery
 */

/**
 * @template TEntry
 * @typedef {import('interface-store').AwaitIterable<TEntry>} AwaitIterable
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
  } catch (/** @type {any} */ err) {
    if (err.code === 'EPERM' && err.syscall === 'rename') {
      // fast-write-atomic writes a file to a temp location before renaming it.
      // On Windows, if the final file already exists this error is thrown.
      // No such error is thrown on Linux/Mac
      // Make sure we can read & write to this file
      await fs.promises.access(path, fs.constants.F_OK | fs.constants.W_OK)

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
export class FsDatastore extends BaseDatastore {
  /**
   * @param {string} location
   * @param {{ createIfMissing?: boolean, errorIfExists?: boolean, extension?: string, putManyConcurrency?: number } | undefined} [opts]
   */
  constructor (location, opts) {
    super()

    this.path = path.resolve(location)
    this.opts = Object.assign({}, {
      createIfMissing: true,
      errorIfExists: false,
      extension: '.data',
      deleteManyConcurrency: 50,
      getManyConcurrency: 50,
      putManyConcurrency: 50
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
    } catch (/** @type {any} */ err) {
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
    } catch (/** @type {any} */ err) {
      throw Errors.dbWriteFailedError(err)
    }
  }

  /**
   * @param {AwaitIterable<Pair>} source
   * @returns {AsyncIterable<Pair>}
   */
  async * putMany (source) {
    yield * parallel(
      map(source, ({ key, value }) => {
        return async () => {
          await this.put(key, value)

          return { key, value }
        }
      }),
      this.opts.putManyConcurrency
    )
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
      data = await fs.promises.readFile(file)
    } catch (/** @type {any} */ err) {
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
      data = await fs.promises.readFile(parts.file)
    } catch (/** @type {any} */ err) {
      throw Errors.notFoundError(err)
    }
    return data
  }

  /**
   * @param {AwaitIterable<Key>} source
   * @returns {AsyncIterable<Uint8Array>}
   */
  async * getMany (source) {
    yield * parallel(
      map(source, key => {
        return async () => {
          return this.get(key)
        }
      }),
      this.opts.getManyConcurrency
    )
  }

  /**
   * @param {AwaitIterable<Key>} source
   * @returns {AsyncIterable<Key>}
   */
  async * deleteMany (source) {
    yield * parallel(
      map(source, key => {
        return async () => {
          await this.delete(key)

          return key
        }
      }),
      this.opts.deleteManyConcurrency
    )
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
      await fs.promises.access(parts.file)
    } catch (/** @type {any} */ err) {
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
      await fs.promises.unlink(parts.file)
    } catch (/** @type {any} */ err) {
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
        const buf = await fs.promises.readFile(file)

        /** @type {Pair} */
        const pair = {
          key: this._decode(file),
          value: buf
        }

        yield pair
      } catch (/** @type {any} */ err) {
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
