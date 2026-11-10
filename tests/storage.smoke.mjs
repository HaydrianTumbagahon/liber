import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectInputFiles,
  createImportGroups,
} from '../src/features/library/importFileUtils.ts'
import {
  assessFolderAccess,
  calculateLibraryDiff,
  parseBookFolderName,
  parseVolumeNumber,
  resolveApplicationDirectory,
} from '../src/lib/storage/storageUtils.ts'

test('book folder parser strips only trailing source-tag groups', () => {
  assert.deepEqual(
    parseBookFolderName('Re:Zero [Arc 2] Vol Collection [Translator X] (Platform Y)'),
    {
      title: 'Re:Zero [Arc 2] Vol Collection',
      sourceTags: ['Translator X', 'Platform Y'],
    },
  )
})

test('volume number parser recognizes common and Japanese filename forms', () => {
  assert.equal(parseVolumeNumber('Series Vol. 3.epub'), 3)
  assert.equal(parseVolumeNumber('v03.epub'), 3)
  assert.equal(parseVolumeNumber('Volume 12.epub'), 12)
  assert.equal(parseVolumeNumber('Series #3.epub'), 3)
  assert.equal(parseVolumeNumber('ReZero 第3巻.epub'), 3)
  assert.equal(parseVolumeNumber('Special Edition.epub'), null)
})

test('folder access is supported only with the API, a secure context, and top-level page', () => {
  assert.deepEqual(
    assessFolderAccess({
      pickerPropertyPresent: true,
      pickerCallable: true,
      secureContext: true,
      topLevel: true,
    }),
    {
      supported: true,
      reason: '',
      checks: {
        pickerPropertyPresent: true,
        pickerCallable: true,
        secureContext: true,
        topLevel: true,
      },
    },
  )
})

test('folder access reports missing API, insecure context, and embedded frame reasons', () => {
  assert.match(
    assessFolderAccess({
      pickerPropertyPresent: false,
      pickerCallable: false,
      secureContext: true,
      topLevel: true,
    }).reason,
    /does not provide the folder picker/,
  )
  assert.match(
    assessFolderAccess({
      pickerPropertyPresent: true,
      pickerCallable: true,
      secureContext: false,
      topLevel: true,
    }).reason,
    /requires HTTPS/,
  )
  assert.match(
    assessFolderAccess({
      pickerPropertyPresent: true,
      pickerCallable: true,
      secureContext: true,
      topLevel: false,
    }).reason,
    /embedded frames/,
  )
})

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

test('a folder with direct EPUBs forms one sorted book group and captures its cover', () => {
  const groups = createImportGroups([
    {
      file: new globalThis.File(['2'], 'Vol. 2.epub'),
      path: 'Vol. 2.epub',
      rootFolderName: 'Series [Team]',
    },
    {
      file: new globalThis.File(['cover'], 'cover.webp'),
      path: 'cover.webp',
      rootFolderName: 'Series [Team]',
    },
    {
      file: new globalThis.File(['1'], 'Vol. 1.epub'),
      path: 'Vol. 1.epub',
      rootFolderName: 'Series [Team]',
    },
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].bookFolderName, 'Series [Team]')
  assert.deepEqual(groups[0].files.map((file) => file.name), [
    'Vol. 1.epub',
    'Vol. 2.epub',
  ])
  assert.equal(groups[0].coverFile?.name, 'cover.webp')
})

test('one 13-volume folder stays one book and volumes are ordered numerically', () => {
  const entries = Array.from({ length: 13 }, (_, index) => {
    const volumeNumber = index + 1
    const fileName = `Vol. ${volumeNumber}.epub`
    return {
      file: new globalThis.File([String(volumeNumber)], fileName),
      path: fileName,
      rootFolderName: 'ReZero Volume Collection [Translator X]',
    }
  })
  const groups = createImportGroups(entries)

  assert.equal(groups.length, 1)
  assert.equal(groups[0].files.length, 13)
  assert.deepEqual(
    groups[0].files.map((file) => file.name),
    Array.from({ length: 13 }, (_, index) => `Vol. ${index + 1}.epub`),
  )
  assert.equal(
    groups[0].bookFolderName,
    'ReZero Volume Collection [Translator X]',
  )
})

test('a parent folder without root EPUBs imports each EPUB-bearing subfolder separately', () => {
  const groups = createImportGroups([
    {
      file: new globalThis.File(['1'], 'v01.epub'),
      path: 'Series A/v01.epub',
      rootFolderName: 'Collection',
    },
    {
      file: new globalThis.File(['cover'], 'folder.jpg'),
      path: 'Series A/folder.jpg',
      rootFolderName: 'Collection',
    },
    {
      file: new globalThis.File(['1'], 'Volume 1.epub'),
      path: 'Series B/Volume 1.epub',
      rootFolderName: 'Collection',
    },
    {
      file: new globalThis.File(['1'], '第1巻.epub'),
      path: 'Series C/第1巻.epub',
      rootFolderName: 'Collection',
    },
    {
      file: new globalThis.File(['text'], 'readme.txt'),
      path: 'readme.txt',
      rootFolderName: 'Collection',
    },
  ])

  assert.deepEqual(groups.map((group) => group.bookFolderName), [
    'Series A',
    'Series B',
    'Series C',
  ])
  assert.equal(groups[0].coverFile?.name, 'folder.jpg')
  assert.deepEqual(groups.map((group) => group.files.length), [1, 1, 1])
})

test('webkitRelativePath input groups a selected directory and keeps loose EPUBs separate', () => {
  const groups = collectInputFiles([
    Object.assign(new globalThis.File(['1'], 'v1.epub'), {
      webkitRelativePath: 'Series/v1.epub',
    }),
    new globalThis.File(['loose'], 'Standalone.epub'),
  ])

  assert.equal(groups.length, 2)
  assert.equal(groups[0].bookFolderName, 'Series')
  assert.equal(groups[1].bookFolderName, null)
})