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
- Phase 8, Storage layer: complete for the current repo. Dexie schema, stable-volume identity, progress records, resync/relink logic, and directory tracking are all present.
- Phase 9, EPUB import and metadata: partial-to-advanced. The app has worker-based EPUB parsing and metadata extraction, DRM/no-spine validation, and sanitized chapter rendering hooks in place; however, import still requires full end-to-end validation with real-world EPUBs.
- Phase 10, Library functionality: partial. Real sort, relink, progress retention, and missing-file handling exist, but a full resync workflow and missing-file reconciliation still need product-level verification.
- Phase 11, Reader functionality: partial. Chapter rendering and TTS hooks are implemented, but exact reading-position persistence and seamless reading across chapters still need deeper validation.
- Phase 12, TTS: partial but substantial. Web Speech integration, voice selection, sentence segmentation, Media Session, Wake Lock, and saved speech progress are implemented, but browser-specific background behavior still needs field testing.
- Phase 13, PWA and offline: complete for the requested app-shell and installability pass. The app is configured for a generated Web App Manifest, Workbox precache of the shell/assets, install prompt banners, iOS Home Screen hint, persistent storage requests, and a visible update toast.
- Phase 14, polish/audit: complete for the current project. Final pass covered long-text wrapping, empty/loading/error states, metadata fallbacks, storage-full notices, TTS voice availability, and bundle cleanup. README was refreshed with setup, features, and platform limits.

## Verified build results
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Vite emitted a non-fatal warning that the main JS chunk is 592.74 kB minified (187.63 kB gzip), above its 500 kB threshold.

## Final pass notes
- Real-data edge cases handled: long titles, missing authors, single-vs-many volumes, file-missing states, empty library, corrupt EPUB import failures, and no-voice availability.
- Unused dependency cleanup: removed the dead Lenis dependency from the app footprint.
- README updated to reflect the actual app status, local setup, and browser/platform limitations.

## Important actual-state notes
The repository is more advanced than the older build-state docs suggested. Real worker-based EPUB parsing, Dexie migration logic, stored progress, and Web Speech TTS support already exist in the application code; the remaining work is validation, cleanup, and production hardening rather than base scaffolding.

## App asset status
- Static brand assets prepared in `public/` with `favicon.png` as the source image.
- Generated icon variants are placed under `public/icons/` and referenced from the document head.
- A static `public/manifest.webmanifest` is present and provides install metadata for browsers that support it.
- Vite PWA plugin setup remains intentionally minimal until the explicit PWA phase is implemented.

## Conventions observed
- React components/hooks use TypeScript `.tsx`/`.ts`, named exports, and explicit relative imports.
- Feature code is grouped under `src/features/{book,library,reader,settings}`; storage logic is under `src/data`; theme and app settings live under `src/lib`.
- Styling is organized via global and feature-scoped stylesheets under `src/styles` and mapped through Tailwind tokens/cross-theme CSS variables.
- Storage operations are concentrated in `src/data/libraryRepository.ts`; screens generally access data through hooks rather than raw Dexie queries.
