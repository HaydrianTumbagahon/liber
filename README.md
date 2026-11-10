# Liber

Liber is an offline-first EPUB reader for light novels. Books and reading progress stay on your device; there is no account or application backend.

Maintainer: [HaydrianTumbagahon](https://github.com/HaydrianTumbagahon)

## Features

- Import one or more EPUB files; import a folder in browsers that expose the File System Access API
- Extract EPUB metadata, reading order, and cover images locally in a Web Worker
- Browse a local library in grid or list view, sort it, group volumes, and replace covers
- Track progress by EPUB identity; re-adding a matching volume can restore its saved progress
- Read in continuous, paginated LTR, or paginated RTL modes, with adjustable text settings
- Read aloud with device-provided voices, adjustable speed, sentence highlighting, and saved speech position
- Install as a PWA; Workbox precaches the app shell and static assets, while book files remain in IndexedDB
- View storage estimates, request persistent storage where supported, and resync tracked folders

## Privacy and storage

EPUB parsing happens in the browser. The app does not upload book files or reading progress to a server. Imported EPUB file data, covers, settings, and progress are stored in the browser's IndexedDB. Clearing site data, uninstalling the browser, or browser storage eviction may remove that data; use the browser's persistent-storage option when available and keep separate backups of source EPUBs.

## Stack

- React 19, TypeScript, and Vite
- Tailwind CSS, Framer Motion, and Lucide
- Dexie over IndexedDB for books, covers, settings, and progress
- `@zip.js/zip.js` and browser workers for EPUB processing
- `vite-plugin-pwa` and Workbox for the service worker and precache

## Local setup

Requires Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Build and preview the production app:

```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

The PWA install and service-worker features require HTTPS in deployment; localhost is treated as a secure context for local development. Folder import availability depends on the browser and secure context.

## Quality checks

```bash
npx tsc --noEmit
npm run lint
npm run format:check
npm run build
```

## Platform limits and current gaps

- EPUB is the only supported book format. DRM-protected or malformed files cannot be read and are rejected during import.
- Text-to-speech uses the browser's Web Speech API and installed voices. Voice availability varies; iOS Safari can suspend speech when locked or backgrounded, and Android background behavior varies by device.
- Browser storage is quota-limited and may be evicted. The app reports an estimate, but cannot guarantee persistence or recovery if the browser removes local data.
- Folder selection and persistent-storage requests are browser-dependent and may be unavailable or denied.
- EPUB import and reader behavior still need broad validation against a varied real-world EPUB collection. Lighthouse installability has not been verified in this environment because no Chrome/Chromium installation was available.
- Progress export/import and cloud synchronization are not implemented.

## Project status

This is an actively developed client-side application. See [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md) for the product roadmap and [docs/BUILD_STATE.md](docs/BUILD_STATE.md) for implementation status and verification notes.
