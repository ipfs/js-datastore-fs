'use strict'

const fs = require('fs')
const glob = require('glob')
const mkdirp = require('mkdirp')
const promisify = require('util').promisify
const writeAtomic = promisify(require('fast-write-atomic'))
const path = require('path')

const filter = require('interface-datastore').utils.filter
const take = require('interface-datastore').utils.take
const map = require('interface-datastore').utils.map
const sortAll = require('interface-datastore').utils.sortAll
const IDatastore = require('interface-datastore')

const noop = () => {}
const asyncMkdirp = promisify(require('mkdirp'))
const fsAccess = promisify(fs.access || noop)
const fsReadFile = promisify(fs.readFile || noop)
const fsUnlink = promisify(fs.unlink || noop)

const Key = IDatastore.Key
const Errors = IDatastore.Errors

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
 */
class FsDatastore {
  constructor (location, opts) {
    this.path = path.resolve(location)
    this.opts = Object.assign({}, {
      createIfMissing: true,
      errorIfExists: false,
      extension: '.data'
    }, opts)

    if (this.opts.createIfMissing) {
      this._openOrCreate()
    } else {
      this._open()
    }
  }

  open () {
    this._openOrCreate()
  }

  /**
   * Check if the path actually exists.
   * @private
   * @returns {void}
   */
  _open () {
    if (!fs.existsSync(this.path)) {
      throw Errors.notFoundError(new Error(`Datastore directory: ${this.path} does not exist`))
    }

    if (this.opts.errorIfExists) {
      throw Errors.dbOpenFailedError(new Error(`Datastore directory: ${this.path} already exists`))
    }
  }

  /**
   * Create the directory to hold our data.
   *
   * @private
   * @returns {void}
   */
  _create () {
    mkdirp.sync(this.path, { fs: fs })
  }

  /**
   * Tries to open, and creates if the open fails.
   *
   * @private
   * @returns {void}
   */
  _openOrCreate () {
    try {
      this._open()
    } catch (err) {
      if (err.code === 'ERR_NOT_FOUND') {
        this._create()
        return
      }

      throw err
    }
  }

  /**
   * Calculate the directory and file name for a given key.
   *
   * @private
   * @param {Key} key
   * @returns {{string, string}}
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
   * @param {Buffer} val
   * @returns {Promise<void>}
   */
  async putRaw (key, val) {
    const parts = this._encode(key)
    const file = parts.file.slice(0, -this.opts.extension.length)
    await asyncMkdirp(parts.dir, { fs: fs })
    await writeFile(file, val)
  }

  /**
   * Store the given value under the key.
   *
   * @param {Key} key
   * @param {Buffer} val
   * @returns {Promise<void>}
   */
  async put (key, val) {
    const parts = this._encode(key)
    try {
      await asyncMkdirp(parts.dir, { fs: fs })
      await writeFile(parts.file, val)
    } catch (err) {
      throw Errors.dbWriteFailedError(err)
    }
  }

  /**
   * Read from the file system without extension.
   *
   * @param {Key} key
   * @returns {Promise<Buffer>}
   */
  async getRaw (key) {
    const parts = this._encode(key)
    let file = parts.file
    file = file.slice(0, -this.opts.extension.length)
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
   * @returns {Promise<Buffer>}
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
   * @returns {Promise<bool>}
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
   * Create a new batch object.
   *
   * @returns {Batch}
   */
  batch () {
    const puts = []
    const deletes = []
    return {
      put (key, value) {
        puts.push({ key: key, value: value })
      },
      delete (key) {
        deletes.push(key)
      },
      commit: () /* :  Promise<void> */ => {
        return Promise.all(
          puts
            .map((put) => this.put(put.key, put.value))
            .concat(
              deletes.map((del) => this.delete(del))
            )
        )
      }
    }
  }

  /**
   * Query the store.
   *
   * @param {Object} q
   * @returns {Iterable}
   */
  query (q) {
    // glob expects a POSIX path
    let prefix = q.prefix || '**'
    let pattern = path
      .join(this.path, prefix, '*' + this.opts.extension)
      .split(path.sep)
      .join('/')
    let files = glob.sync(pattern)
    let it
    if (!q.keysOnly) {
      it = map(files, async (f) => {
        const buf = await fsReadFile(f)
        return {
          key: this._decode(f),
          value: buf
        }
      })
    } else {
      it = map(files, f => ({ key: this._decode(f) }))
    }

    if (Array.isArray(q.filters)) {
      it = q.filters.reduce((it, f) => filter(it, f), it)
    }

    if (Array.isArray(q.orders)) {
      it = q.orders.reduce((it, f) => sortAll(it, f), it)
    }

    if (q.offset != null) {
      let i = 0
      it = filter(it, () => i++ >= q.offset)
    }

    if (q.limit != null) {
      it = take(it, q.limit)
    }

    return it
  }

  /**
   * Close the store.
   */
  close () { }
}

module.exports = FsDatastore
