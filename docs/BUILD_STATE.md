# Light Novel Audio Reader: Build State

## Status

- Phase 0, Scaffold: complete. Vite + React + TypeScript application shell builds from `src/main.tsx` and the app boots in the browser.
- Phase 1, Design system and primitives: complete. Theme tokens, shared UI primitives, reduced-motion styles, and the core styling system are in place.
- Phase 2, App shell and navigation: complete. Router setup, app-level layout, and page transitions are active.
- Phase 3, Library UI: complete. The library reads real Dexie-backed data, supports sort and layout state, and exposes selection flows and add/import interactions.
- Phase 4, Book Detail UI: complete. The detail page reads the real library model and renders volume progress.
- Phase 5, Reader UI: complete as presentation + control scaffolding. Reader chrome, chapter navigation, and settings are in place and wired to real chapter segments.
- Phase 6, Settings UI: complete as persistence-backed UI. Theme, reading preferences, and default speech settings persist via Dexie.
- Phase 7, Add-books / Edit-cover / Delete UI: complete in the app shell. Book import, cover replacement, and deletion flows are implemented and stored in Dexie.
- Phase 8, Storage layer: the current implementation uses Dexie/IndexedDB as its persistence layer. This is legacy relative to the newly locked target: user-selected folder files are to become the source of truth; R5 will implement that engine.
- Phase 9, EPUB import and metadata: partial-to-advanced. The app has worker-based EPUB parsing and metadata extraction, DRM/no-spine validation, and sanitized chapter rendering hooks in place; however, import still requires full end-to-end validation with real-world EPUBs.
- Phase 10, Library functionality: partial. Real sort, relink, progress retention, and missing-file handling exist. R5/R6 supersede Phase 10's storage and resync/reconciliation work; unrelated sorting, layout, and selection work remains.
- Phase 11, Reader functionality: partial. Chapter rendering and TTS hooks are implemented, but exact reading-position persistence and seamless reading across chapters still need deeper validation.
- Phase 12, TTS: partial but substantial. Web Speech integration, voice selection, sentence segmentation, Media Session, Wake Lock, and saved speech progress are implemented, but browser-specific background behavior still needs field testing.
- Phase 13, PWA and offline: app-shell implementation is present with a generated Web App Manifest, Workbox precache, install entry point, persistent-storage request, and update handling. Full offline behavior and Lighthouse installability remain unverified across browsers/devices.
- Phase 14, polish/audit: complete for the current project. Final pass covered long-text wrapping, empty/loading/error states, metadata fallbacks, storage-full notices, TTS voice availability, and bundle cleanup. README was refreshed with setup, features, and platform limits.
- Phase R0, Documentation: complete. Locked storage, library, UI, theme, install, and R1-R6 roadmap decisions are documented. No source code was changed.
- Phase R1, Animation foundation: complete. Shared Framer Motion tokens/presets, reduced-motion handling, route and library transitions, responsive toast motion, interactive press/focus states, Lenis page scrolling with native inner scroll and modal locks, and a Styleguide motion gallery are in place.
- Phase R2, Custom components: complete. Custom Select/listbox, IconToggle/Tooltip, Slider, portal Modal, ConfirmDialog, ToastProvider/useToast, StatusBannerProvider/useStatusBanner, and both-theme Styleguide examples replace native selects/ranges/dialogs and local notifications.
- Phase R3, Library page changes: complete. Removed bottom install prompts, switched library sort/layout to custom controls, replaced the text Resync control with desktop icon action, and unified desktop/mobile resync feedback with future-compatible result formatting.
- Phase R4, Add Books modal: complete. The dialog uses the shared layout ID from both Library entry points, keeps the empty-state trigger mounted for the reverse transition, centers its heading, and retains per-file loading/success/error feedback. R6 connects file copies to canonical folder storage.
- Phase R5, Folder storage engine: complete for storage logic and settings/progress integration. The folder provider persists app-folder handles, versioned settings/progress/library-index JSON, scans EPUB metadata with a stat/hash cache, reads EPUBs from the canonical folder, and reports added/removed/changed paths. Unsupported browsers retain the Dexie fallback with JSON backup import/export. R6 still owns the folder-selection/onboarding UI and user-facing restore flow.
- Phase R6, Onboarding, scan, restore: implemented. First-run onboarding and reconnect states, in-app fallback selection/backups, automatic and manual provider scans, folder-aware empty state, and canonical Add Books copying are wired. Native File System Access behavior still needs physical-browser/device verification.
- Phase S0, Documentation and instructions: complete. S0-S5 triggers, locked hybrid import and Book Detail decisions, and the next roadmap are recorded. No source code changed.
- Phase S1, Deployed folder selection: complete. Removed persistent automatic fallback selection, gated provider operations on a real permission-granted folder or an explicit in-session fallback choice, added full feature detection/diagnostics and retryable picker errors, and configured Vercel/PWA update and cache behavior.
- Phase S2, Add light novels hybrid import: implemented. Folder/file selection and drag/drop, nested-series grouping, per-volume progress, title/source-tag/number parsing, hash duplicate skips, clean-title merges, streamed folder writes, and robust cover extraction/cache are wired.
- Phase S3-S5: planned. S3 Book Detail tools; S4 icon-only controls and Settings cleanup; S5 final audit and deploy check.

## Locked target storage model

- Supported browsers: the user-selected device folder is canonical. The app stores `data/settings.json`, `data/progress.json`, `data/library-index.json`, `data/covers/`, and `library/<Book Folder>/<Volume>.epub` under `<chosen>/<AppName>/`.
- IndexedDB caches only the directory handle, parsed metadata, and hashes. Re-selecting the same folder after site-data removal or reinstall restores the canonical files.
- Unsupported browsers (including iOS, Safari, and Firefox) use in-app IndexedDB/OPFS and Export/Import for portability. Nothing is uploaded.
- Progress remains content-hash keyed (normalized title + author + volume number fallback) and is stored in `progress.json`.
- Each `library/` folder is one book. The cleaned folder name is the title, trailing bracket groups become `sourceTags`, and matching cleaned titles merge. EPUBs are naturally sorted with volume numbers parsed where possible; loose EPUBs remain single-volume books. Cover precedence and cached per-volume covers are specified below and in docs/PROJECT_SPEC.md.

## Locked UI behavior

- No native select, alert, confirm, prompt, or title tooltips; use custom UI components. A platform folder picker is allowed for explicit folder selection/permission.
- Notifications are bottom-right on desktop and top-of-screen on mobile. The only desktop top banner is resync status.
- Modals/popups are centered with blurred backdrop and dismiss via X or outside click, without a separate Close button.
- Theme Light/Dark/System behavior is finished and must not change. The top install button is the only install entry point; no bottom install prompt.

## Verified build results

- `npx tsc --noEmit`: passed after S1.
- `npm run lint`: passed after S1.
- `node --experimental-strip-types --test tests/storage.smoke.mjs`: passed after S1 (6 tests covering folder-access support reasons, scan diffs, and restore-directory resolution).
- `npm run build`: passed after S1 (676.02 kB main JS minified, 210.43 kB gzip).
- Vite emitted the existing non-fatal main-chunk-size warning, above its 500 kB advisory threshold.
- R1 reintroduced the Lenis dependency after it had been removed as unused; one app-level instance is mounted by `LenisProvider`.
- R2 exports `Select`, `IconToggle`, `Tooltip`, `Slider`, `Modal`, `ConfirmDialog`, `ToastProvider`/`useToast`, and `StatusBannerProvider`/`useStatusBanner`. The only file inputs are visually hidden and open the platform file picker for explicit local file selection.
- R3 removed the bottom install and iOS hint UI, including its event listeners and dismissal key. The service-worker update toast remains. No top install button exists in the current app shell; the promised top-only install entry point remains missing.

## R4 Add Books modal

- Changed files: `.github/copilot-instructions.md`, `src/features/library/AddBooksDialog.tsx`, `src/features/library/EmptyLibraryState.tsx`, `src/features/library/LibraryPage.tsx`, and `src/styles/library.css`.
- Component and hook APIs: no public API changes. The Add Books modal uses the existing `Modal` `layoutId` prop and `springBounce` preset.
- The empty-state trigger remains mounted while open so closing can morph back to it. The populated-library Add books action now uses the same shared layout ID. Reduced motion continues to use the Modal's fade-only path.
- Existing multi-file processing and folder-picker behavior remain intact. R6 connects imported EPUBs to `library/<Book Folder>/`.
- Verification: `npx tsc --noEmit`, `npm run lint`, and `npm run build` passed. The main-chunk-size advisory remains.

## R5 Folder storage engine

The canonical layout is `<chosen>/liber/data/settings.json`, `progress.json`, `library-index.json`, `covers/`, and `library/<Book Folder>/<Volume>.epub`. The folder name is read from `public/manifest.webmanifest`. A picked `liber` folder is used directly; picking its parent reuses the existing child when present. Existing `Liber` folders from the earlier R5 implementation are also recognized. Missing subfolders/files are created without replacing existing files.

- Added `src/lib/storage/` with `StorageProvider`, `FolderStorageProvider`, `FallbackStorageProvider`, and the active provider façade. Folder statuses are `not-configured`, `needs-permission`, `folder-missing`, `connected`, and `unsupported`.
- Settings, progress, and index documents carry schema versions and migration paths. JSON writes are debounced, use atomic writable streams with retry, and serialize under Web Locks where available. EPUB index entries cache metadata and hashes by relative path, size, and last-modified time.
- Folder scans reuse the Phase 9 EPUB worker parser, naturally order volumes, support loose EPUB files, retain progress for missing files, and return added/removed/changed path diffs. EPUB chapter reads use the folder source; full EPUB blobs are not duplicated into IndexedDB for folder-backed volumes.
- `useLibrary`, reader book/progress hydration, settings updates, repository resync, confirmed deletion, and progress saves now use the active provider while preserving existing Dexie-backed React return shapes. Dexie remains the metadata/progress cache and the unsupported-browser fallback.
- Fallback backup APIs export/import settings and progress as one JSON Blob. Folder EPUB copying rejects duplicate existing names; deleting canonical files requires an explicit confirmation flag.
- Changed files: `src/lib/storage/{types.ts,index.ts,folderStorageProvider.ts,fallbackStorageProvider.ts,storageUtils.ts}`, `src/data/{libraryRepository.ts,epubContent.ts}`, `src/lib/theme.tsx`, `src/features/library/useLibrary.ts`, `src/features/reader/useReaderBook.ts`, and `tests/storage.smoke.mjs`.
- Native File System Access permission behavior still needs browser/device validation; the included smoke suite tests representative diff and restore-resolution helpers, not native picker permissions.

## R6 Onboarding, reconnect, and real resync

- First run shows the `liber` splash, then a centered folder explanation and `Choose folder` action. The picker requests read/write access and opens in Documents; rejected or cancelled picks produce clear recovery copy.
- Startup silently reconnects when permission is available, shows a reconnect Modal when permission is needed, and returns missing folders to onboarding. Selecting the same folder restores indexed EPUBs and progress; existing books produce a `Library restored` toast with a count.
- Unsupported browsers can select persistent in-app storage. Settings now exposes Export data and confirmed Import data backup actions for settings and progress.
- Library, pull-to-refresh, and Settings resync use the provider scan. Results feed the existing banner/toast pattern; missing files retain progress and mark the affected book. App-open and debounced focus scans notify only when paths changed.
- Add Books copies selected EPUBs into a sanitized folder inferred from series/title metadata, with a filename fallback; folder imports preserve source subfolder names. Existing filenames are not overwritten.
- Settings now shows the selected folder name and status with Change folder and Reconnect actions. Theme controls are unchanged.
- Changed files: `src/App.tsx`, `src/features/onboarding/OnboardingPage.tsx`, `src/features/library/{AddBooksDialog.tsx,EmptyLibraryState.tsx,LibraryPage.tsx}`, `src/features/settings/SettingsPage.tsx`, `src/lib/storage/{index.ts,folderStorageProvider.ts,storageUtils.ts}`, `src/data/libraryRepository.ts`, `src/styles/{app-shell.css,library.css,settings.css}`, and `tests/storage.smoke.mjs`.
- Verification: first-run splash-to-onboarding and simulated unsupported-browser fallback/backup controls were exercised in the integrated browser; 4 storage smoke tests pass. Actual native folder creation, EPUB copy/resync, permission prompts, and restore after browser-data deletion remain unverified without a physical browser filesystem picker session.

## S0 Locked product decisions

- Add Books is renamed **Add light novels** and is a hybrid importer for folders and individual EPUBs, with drag-and-drop for both and separate folder/file picker actions.
- A folder is one book. Trailing `[]`, `()`, `【】`, and `{}` groups are source tags stored separately from the cleaned title and displayed muted on Book Detail. Matching cleaned titles merge; content-hash duplicates are skipped.
- A dropped folder with no root EPUBs but EPUB-bearing child folders imports each child as its own book. Volume numbers parse common filename forms (`Vol. 3`, `v03`, `Volume 3`, `#3`), with natural order as fallback. Cover order is folder cover, lowest-numbered volume cover, later volume covers, generated flat cover. Cache all extracted volume covers.
- Book Detail gets Name/Date Added sorting, direction toggle, grid/list volume toggle, per-book resync, Edit menu, and Add volumes. Library sorting gets the direction toggle too.
- Reading mode and default Library layout controls are icon-only with custom tooltips and aria-labels in Reader and Settings. Settings has no About, app version, or credits.
- Next phases: S1 deployed folder selection; S2 hybrid import; S3 Book Detail tools; S4 icon controls and Settings cleanup; S5 final audit and deploy check.

## S1 Deployed folder selection

- Root cause: `liber-storage-mode=fallback` was persisted in `localStorage` and loaded during provider initialization. `AppRoutes` treated that flag as configured and entered Library without showing onboarding or opening the folder picker. Provider methods also defaulted to Dexie whenever folder storage was not connected, allowing settings initialization to touch fallback storage before user consent.
- Fallback choice is now in-memory for the current page session only. It is not read from or written to localStorage, and provider operations fail closed until a permission-granted folder is connected or the explicit **Use in-app storage** action is chosen. Startup configuration comes from the persisted directory handle and its actual `readwrite` permission.
- Folder access detection checks `showDirectoryPicker` presence/callability, secure context, and top-level frame status. Each result logs once with the `[liber:folder-access]` prefix; unsupported onboarding shows the reason. `window.__liberDiagnostics()` logs browser, API support, provider in use, persisted-handle presence, and permission state.
- Picker cancellation (`AbortError`) is silent and leaves onboarding available. Security, permission, and context errors show plain-language error toasts with the DOM error name as small detail and leave the retry action available.
- Vite PWA registration now uses prompt mode. The update toast's Refresh action calls `updateSW(true)`; the generated worker waits for the `SKIP_WAITING` message and claims clients on activation. `vercel.json` adds SPA rewrites, no-cache headers for `/`, `index.html`, `sw.js`, and the manifest, plus immutable caching for hashed assets. No Permissions-Policy header is set.
- Verification: stale localStorage fallback flag was tested in the integrated browser and did not bypass onboarding; feature-check logs appeared once; AbortError was silent; simulated SecurityError displayed the error toast and kept onboarding active; unsupported API showed its reason and explicit fallback path. Production build, lint, type-check, 6 smoke tests, Vercel JSON validation, and `git diff --check` passed.
- Deployed Vercel behavior and a real browser-generated folder permission prompt still require verification on the deployed desktop Chrome/Edge and Android Chrome sites.

## S2 Add light novels hybrid import

- The Library action and empty-state action are named **Add light novels**. The modal keeps the R4 morph, centered blurred Modal, and X close control; its drop zone accepts folders and EPUBs and contains custom Choose folder / Choose files buttons.
- Folder selection uses the File System Access API where available and a `webkitdirectory` input otherwise. Drag/drop uses `getAsFileSystemHandle()`, falls back to `webkitGetAsEntry()` recursion, then ordinary file items. Folder controls are hidden with a short explanation when neither folder API is available.
- Folder names are cleaned into titles while trailing bracket groups are stored as source tags. A parent directory without root EPUBs produces one group per EPUB-bearing child folder. Volume names parse English/Japanese number forms and sort naturally as fallback; metadata titles fall back to bracket-cleaned filenames.
- EPUB cover extraction now tries manifest `cover-image`, legacy OPF cover metadata, guide cover reference, the referenced cover/title-page XHTML image, and first-spine XHTML image. Folder cover images take priority. Each EPUB cover is cached for its volume, and the lowest available numbered volume cover replaces a generated fallback when needed.
- Imports process one EPUB at a time. The modal reports book and volume loading/success/skipped/error states, continues after individual failures, summarizes new books/merged volumes/duplicates, and offers Done. Folder copies use chunked writable streams, skip present identical content, and create unique filenames rather than overwriting different content.
- Changed files: `src/features/library/{AddBooksDialog.tsx,LibraryPage.tsx,EmptyLibraryState.tsx,importFileUtils.ts}`, `src/lib/storage/{types.ts,folderStorageProvider.ts,fallbackStorageProvider.ts,storageUtils.ts}`, `src/data/{database.ts,libraryRepository.ts,epubParser.worker.ts,mockBooks.ts}`, `src/features/{library/useLibrary.ts,book/BookDetailPage.tsx}`, `src/styles/{library.css,book-detail.css}`, and `tests/storage.smoke.mjs`.
- Verification: smoke tests cover source-tag parsing, English/Japanese volume numbers, a 13-volume group, three child series, and `webkitRelativePath` grouping. Real EPUB-archive cover variants and actual native filesystem copy/dedupe/merge flows still need fixture/device verification.

## Final pass notes

- Real-data edge cases handled: long titles, missing authors, single-vs-many volumes, file-missing states, empty library, corrupt EPUB import failures, and no-voice availability.
- Unused dependency cleanup: removed the dead Lenis dependency from the app footprint.
- README updated to reflect the actual app status, local setup, and browser/platform limitations.

## Important actual-state notes

The repository currently contains worker-based EPUB parsing, folder-backed source-of-truth storage, Dexie/IndexedDB caching and fallback, onboarding/reconnect flows, and Web Speech TTS. The S1-S5 roadmap covers deployed folder-picker reliability, the expanded hybrid-import/detail experience, Settings cleanup, and final deployment verification.

## App asset status

- Static brand assets prepared in `public/` with `favicon.png` as the source image.
- Generated icon variants are placed under `public/icons/` and referenced from the document head.
- A static `public/manifest.webmanifest` is present and provides install metadata for browsers that support it.
- Vite PWA and Workbox configuration are present; browser/device offline and installability validation remains incomplete.

## Conventions observed

- React components/hooks use TypeScript `.tsx`/`.ts`, named exports, and explicit relative imports.
- Feature code is grouped under `src/features/{book,library,reader,settings}`; storage logic is under `src/data`; theme and app settings live under `src/lib`.
- Styling is organized via global and feature-scoped stylesheets under `src/styles` and mapped through Tailwind tokens/cross-theme CSS variables.
- Storage operations are concentrated in `src/data/libraryRepository.ts`; screens generally access data through hooks rather than raw Dexie queries.

## S5B Production preview

- Final status: partial. Production build and service-worker update toast passed; Book Detail resync is missing, while Library resync and native-folder progress/restore remain unverified here.
- [ ] On deployed Chrome/Edge, choose a device folder and confirm reconnect after closing and reopening the app.
- [ ] Import a multi-volume folder, a parent folder with multiple series, and loose EPUB files; re-add content and confirm duplicates skip.
- [ ] Add a volume from Book Detail; change its sort, direction, and layout; confirm settings persist after navigation.
- [ ] Verify Book Detail and Library resync, then read a volume, close/reopen, and confirm progress restores.
- [ ] Clear site data, select the same folder, verify full restore, and deploy a new build to confirm the update toast and Refresh action.
