import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateLibraryDiff,
  resolveApplicationDirectory,
} from '../src/lib/storage/storageUtils.ts'

test('library scan diff detects added, removed, and changed EPUB paths', () => {
  const previous = {
    'Series/Volume 1.epub': {
      size: 100,
      lastModified: 10,
      sha256: 'old-hash',
    },
    'Series/Volume 2.epub': {
      size: 200,
      lastModified: 20,
      sha256: 'second-hash',
    },
  }
  const current = {
    'Series/Volume 1.epub': {
      size: 101,
      lastModified: 11,
      sha256: 'new-hash',
    },
    'Loose Novel.epub': {
      size: 300,
      lastModified: 30,
      sha256: 'loose-hash',
    },
  }

  assert.deepEqual(calculateLibraryDiff(previous, current), {
    added: ['Loose Novel.epub'],
    removed: ['Series/Volume 2.epub'],
    changed: ['Series/Volume 1.epub'],
  })
})

test('restore resolution reuses an existing liber directory in the picked folder', async () => {
  const appDirectory = { name: 'liber' }
  const calls = []
  const pickedParent = {
    name: 'Books',
    async getDirectoryHandle(name, options) {
      calls.push({ name, options })
      if (name === 'liber' && options?.create === false) return appDirectory
      throw new globalThis.DOMException('Missing directory', 'NotFoundError')
    },
  }

  const resolved = await resolveApplicationDirectory(pickedParent)

  assert.equal(resolved, appDirectory)
  assert.deepEqual(calls, [{ name: 'liber', options: { create: false } }])
})

test('restore resolution accepts the earlier capitalized app folder', async () => {
  const legacyAppDirectory = { name: 'Liber' }
  const pickedParent = {
    name: 'Books',
    async getDirectoryHandle(name, options) {
      if (name === 'Liber' && options?.create === false) return legacyAppDirectory
      throw new globalThis.DOMException('Missing directory', 'NotFoundError')
    },
  }

  assert.equal(await resolveApplicationDirectory(pickedParent), legacyAppDirectory)
})

test('a picked liber directory is used directly', async () => {
  const pickedAppDirectory = { name: 'liber' }
  assert.equal(await resolveApplicationDirectory(pickedAppDirectory), pickedAppDirectory)
})