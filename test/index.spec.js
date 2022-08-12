/* eslint-env mocha */
import { expect } from 'aegir/chai'
import path from 'path'
import { promisify } from 'util'
import mkdirp from 'mkdirp'
import rmrf from 'rimraf'
import fs from 'fs'
import { Key } from 'interface-datastore'
import { ShardingDatastore, shard } from 'datastore-core'
import { isNode, isElectronMain } from 'ipfs-utils/src/env.js'
import { interfaceDatastoreTests } from 'interface-datastore-tests'
import { FsDatastore } from '../src/index.js'
import tempdir from 'ipfs-utils/src/temp-dir.js'

const rimraf = promisify(rmrf)
const utf8Encoder = new TextEncoder()

describe('FsDatastore', () => {
  if (!(isNode || isElectronMain)) {
    it('only supports node.js and electron main', () => {

    })

    return
  }

  describe('construction', () => {
    it('defaults - folder missing', () => {
      const dir = tempdir()
      expect(
        () => new FsDatastore(dir)
      ).to.not.throw()
    })

    it('defaults - folder exists', () => {
      const dir = tempdir()
      mkdirp.sync(dir)
      expect(
        () => new FsDatastore(dir)
      ).to.not.throw()
    })
  })

  describe('open', () => {
    it('createIfMissing: false - folder missing', () => {
      const dir = tempdir()
      const store = new FsDatastore(dir, { createIfMissing: false })
      expect(
        () => store.open()
      ).to.throw()
    })

    it('errorIfExists: true - folder exists', () => {
      const dir = tempdir()
      mkdirp.sync(dir)
      const store = new FsDatastore(dir, { errorIfExists: true })
      expect(
        () => store.open()
      ).to.throw()
    })
  })

  it('_encode and _decode', () => {
    const dir = tempdir()
    const fs = new FsDatastore(dir)

    expect(
      // @ts-ignore
      fs._encode(new Key('hello/world'))
    ).to.eql({
      dir: path.join(dir, 'hello'),
      file: path.join(dir, 'hello', 'world.data')
    })

    expect(
      // @ts-ignore
      fs._decode(fs._encode(new Key('hello/world/test:other')).file)
    ).to.eql(
      new Key('hello/world/test:other')
    )
  })

  it('deleting files', async () => {
    const dir = tempdir()
    const fs = new FsDatastore(dir)
    const key = new Key('1234')

    await fs.put(key, Uint8Array.from([0, 1, 2, 3]))
    await fs.delete(key)

    try {
      await fs.get(key)
      throw new Error('Should have errored')
    } catch (/** @type {any} */ err) {
      expect(err.code).to.equal('ERR_NOT_FOUND')
    }
  })

  it('deleting non-existent files', async () => {
    const dir = tempdir()
    const fs = new FsDatastore(dir)
    const key = new Key('5678')

    await fs.delete(key)

    try {
      await fs.get(key)
      throw new Error('Should have errored')
    } catch (/** @type {any} */ err) {
      expect(err.code).to.equal('ERR_NOT_FOUND')
    }
  })

  it('sharding files', async () => {
    const dir = tempdir()
    const fstore = new FsDatastore(dir)
    await ShardingDatastore.create(fstore, new shard.NextToLast(2))

    const file = await fs.promises.readFile(path.join(dir, shard.SHARDING_FN))
    expect(file.toString()).to.be.eql('/repo/flatfs/shard/v1/next-to-last/2\n')

    const readme = await fs.promises.readFile(path.join(dir, shard.README_FN))
    expect(readme.toString()).to.be.eql(shard.readme)
    await rimraf(dir)
  })

  it('query', async () => {
    const fs = new FsDatastore(path.join(process.cwd(), '/test/test-repo/blocks'))
    const res = []
    for await (const q of fs.query({})) {
      res.push(q)
    }
    expect(res).to.have.length(23)
  })

  it('interop with go', async () => {
    const repodir = path.join(process.cwd(), '/test/test-repo/blocks')
    const fstore = new FsDatastore(repodir)
    const key = new Key('CIQGFTQ7FSI2COUXWWLOQ45VUM2GUZCGAXLWCTOKKPGTUWPXHBNIVOY')
    const expected = fs.readFileSync(path.join(repodir, 'VO', key.toString() + '.data'))
    const flatfs = await ShardingDatastore.open(fstore)
    const res = await flatfs.get(key)
    const queryResult = flatfs.query({})
    const results = []
    for await (const result of queryResult) results.push(result)
    expect(results).to.have.length(23)
    expect(res).to.be.eql(expected)
  })

  describe('interface-datastore', () => {
    const dir = tempdir()

    interfaceDatastoreTests({
      setup: () => {
        return new FsDatastore(dir)
      },
      teardown: () => {
        return rimraf(dir)
      }
    })
  })

  describe('interface-datastore (sharding(fs))', () => {
    const dir = tempdir()

    interfaceDatastoreTests({
      setup: () => {
        return new ShardingDatastore(new FsDatastore(dir), new shard.NextToLast(2))
      },
      teardown: () => {
        return rimraf(dir)
      }
    })
  })

  it('can survive concurrent writes', async () => {
    const dir = tempdir()
    const fstore = new FsDatastore(dir)
    const key = new Key('CIQGFTQ7FSI2COUXWWLOQ45VUM2GUZCGAXLWCTOKKPGTUWPXHBNIVOY')
    const value = utf8Encoder.encode('Hello world')

    await Promise.all(
      new Array(100).fill(0).map(() => fstore.put(key, value))
    )

    const res = await fstore.get(key)

    expect(res).to.deep.equal(value)
  })

  it('can survive putRaw and getRaw with an empty extension', async () => {
    const dir = tempdir()
    const fstore = new FsDatastore(dir, {
      extension: ''
    })
    const key = new Key('CIQGFTQ7FSI2COUXWWLOQ45VUM2GUZCGAXLWCTOKKPGTUWPXHBNIVOY')
    const value = utf8Encoder.encode('Hello world')

    await fstore.putRaw(key, value)

    const res = await fstore.getRaw(key)

    expect(res).to.deep.equal(value)
  })
})
