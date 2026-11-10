# Light Novel Audio Reader: Always-on rules

## How to work

- When my message starts with "PHASE N:", "PHASE R#:" (R0 to R6), or "PHASE S#:" (S0 to S5), execute it directly and completely with your tools, exactly the same way for all three phase families. Do not re-summarize the phase, do not write a plan for me to approve, and do not ask me for files. If something is ambiguous, state one assumption in a line and proceed.
- Before a task: read docs/BUILD_STATE.md and only the files the task names or clearly needs. Do NOT re-read the whole repo, do not re-audit finished work, and do not re-read files you already read in this chat.
- After a task: run only `npx tsc --noEmit`. Run lint and `npm run build` only when the phase says so or when I ask. Fix only errors you introduced.
- Update docs/BUILD_STATE.md with at most 5 short lines (phase done, files changed, any API change). Do not rewrite the whole file.
- Stay inside the phase: no refactors, no renames, no style cleanups, no extra features, no extra audits.
- If a phase seems too big, do the first half, report what remains in one line, and wait for me.
- Do not run git commits or push unless I ask. Do not implement anything outside the requested phase.
- This project's design system overrides any generic design preferences or "variety" rules from the WebDev agent. All other agent rules still apply.

## Locked stack

React + Vite + TypeScript, Tailwind CSS, Lenis for page scrolling, Framer Motion (GSAP only for complex sequences), @zip.js/zip.js with the existing custom EPUB parser, Dexie for cache/fallback storage, native Web Speech API, vite-plugin-pwa (Workbox), Lucide icons (thin), and react-router. Installing packages from this list is fine; any other dependency needs my approval.

## Locked design system

- Brutal minimal, flat, modern tech. Thin lines, simple geometric shapes, no heavy shadows, no gradients.
- Black and white plus pure grays (hover/disabled). Light = white bg, black text/borders. Dark = black bg, white text/borders. Exactly ONE accent colour, only for functional states: missing-file warning, active TTS, progress fill, primary CTA.
- Very light uniform diagonal dot texture background in both themes.
- Thin clean sans-serif (Inter, Geist, or system-ui); generous line-height for reading text.
- Minimal motion: small scale/opacity on press and hold; animate only useful feedback; respect reduced motion.
- Shared motion tokens live in `src/lib/motion.ts`; Lenis is mounted once at the app root. Modals stop Lenis, and inner scroll areas use `data-lenis-prevent`.
- Mobile-first. Library grid: 5 columns on large desktop, fewer on tablet and phone.
- Theme Light/Dark/System via a class on <html>; colours are CSS variables mapped into Tailwind.

## Unslop rules (apply to every screen and feature)

1 No filler badges (a badge must carry information). 2 No redundant labels. 3 No random italics or emphasis. 4 Monospace only for numbers/metadata where it helps. 5 Use design-system tokens and shared components, no one-off styles. 6 Show the actual product, not placeholders. 7 Enlarge the main feature of each screen. 8 Group with spacing, not extra boxes. 9 Specific headlines and empty-state copy. 10 One emphasized primary action per screen. 11 Accent used sparingly and consistently. 12 One icon family, one stroke width, one size scale. 13 No decorative embellishments. 14 Inner radius = outer radius minus padding. 15 Text contrast passes WCAG AA in both themes. 16 Balanced headline wrapping. 17 Align by eye where optical differs from mathematical. 18 Tabular numbers for progress, counts, timestamps. 19 Every async action has a loading state. 20 Animate only useful feedback.

## Architecture decisions (do not change without asking me)

- UI reads data only through hooks (e.g. useLibrary); storage replaces mock data behind the same return shape.
- On supported browsers, the user chooses a device folder. The app's `<chosen>/<AppName>/data/settings.json`, `progress.json`, `library-index.json`, and `covers/`, plus `library/<Book Folder>/<Volume>.epub`, are the source of truth. Clearing site data or reinstalling and choosing the same folder restores the data. Nothing leaves the device.
- IndexedDB only caches the directory handle, parsed metadata, and hash data; it is not the canonical store. Unsupported browsers, including iOS, Safari, and Firefox, use in-app IndexedDB/OPFS storage and must provide Export/Import of the data files.
- Each direct subfolder in `library/` is one book/series; its folder name is the display title. EPUBs inside are volumes ordered by natural filename sort. Author and cover come from EPUB metadata. A loose EPUB directly in `library/` is a single-volume book.
- Progress is keyed by stable identity that survives file deletion and re-adding: SHA-256 content hash per EPUB, fallback = normalized title + author + volume number. Write progress to `data/progress.json`; retain it when a source file is missing and remove it only when the user deletes the book.
- A book folder is one book. Its title is the folder name with all trailing `[]`, `()`, `【】`, or `{}` source-tag groups removed; store the tag text in `sourceTags` and show it as muted metadata on Book Detail, never as part of the title. A folder whose cleaned title matches an existing book merges into that book.
- Add light novels is a hybrid importer for folder drops/selections and individual EPUB files, with drag-and-drop for both and separate Choose folder / Choose files actions. A dropped folder with no EPUB directly inside but EPUB-bearing subfolders imports each such subfolder as its own book.
- Volume order uses natural filename sort. Parse volume numbers from `Vol. 3`, `v03`, `Volume 3`, or `#3`; use natural order when no number is found. Skip same-identity EPUB content hashes. Folder cover priority is `cover.jpg/png/webp` or `folder.jpg/png/webp`, then volume covers from lowest numbered onward, then a generated flat cover; extract/cache each volume cover too.
- Book Detail includes Name (ascending by default) and Date Added sorting, an ascending/descending icon toggle, a grid/list `IconToggle` for volumes, per-book resync, an Edit menu, and Add volumes. Library sorting also has an ascending/descending icon toggle.
- EPUB parsing runs in a Web Worker if it blocks the UI. Chapter HTML is sanitized, publisher styles stripped, app typography applied.
- TTS reads sentence-sized chunks, updates saved progress as it advances, uses Media Session and Wake Lock. Web Speech often pauses when the screen locks (especially iOS Safari): show an in-app notice where unsupported.

## Locked UI behavior

- Do not use native browser controls or dialogs: no native select, alert, confirm, prompt, or title tooltips. All in-app controls use custom shared components and the design system. The platform folder picker is permitted only to let the user select/grant access to their folder.
- Use shared `Select`, `IconToggle`, `Tooltip`, `Slider`, `Modal`, and `ConfirmDialog` components. Notifications use `ToastProvider`/`useToast`; resync uses `StatusBannerProvider`/`useStatusBanner`.
- Notifications appear bottom-right on desktop and at the top of the screen on mobile. The only desktop top-of-screen exception is the resync status banner.
- Popups and modals are always centered with a blurred backdrop; close via the X or clicking outside. Do not add a separate Close button.
- Light/Dark/System theme behavior is complete and locked; do not change it.
- Reading-mode controls and Library default-layout controls are icon-only everywhere, including Reader and Settings, using custom tooltips and accessible aria-labels. Settings has no About section, app version, or credits.
- The top-of-screen install button is the only install entry point. Never show a bottom "install library for offline reading" prompt.

## Coding rules

TypeScript, small focused components, one folder per feature (src/features/{library,book,reader,settings}), shared primitives in src/components/ui, follow naming and import conventions already in the repo, lightweight bundle.

## Future additions

R0-R6 are complete. Follow the S roadmap in docs/PROJECT_SPEC.md: S0 docs/instructions (complete), S1 deployed folder selection, S2 Add light novels hybrid import, S3 Book Detail tools, S4 icon controls and Settings cleanup, S5 final audit and deploy check. Any new feature must use existing tokens, shared components, and hooks; follow the unslop rules; respect the architecture decisions; and ship with a "Done when" checklist. If a request conflicts with a locked decision, tell me the conflict and propose options before coding.

*** Add File: C:\Users\htums\Documents\Workspace\liber\docs\PROJECT_SPEC.md

# Light Novel Audio Reader: Product spec and roadmap

EPUB-only, offline-first, lightweight, installable PWA. Pure client-side, free and open-source tools only, no backend.

## Pages

- Library: bookshelf feel. Grid default (cover, title, author, "N vols" badge); list view (small cover, title, author, volume count, date added, progress Unread/In Progress/Completed, last-read timestamp). Sort: Date Added, Date Modified, Last Read, Completed, Title, Author. Pull-to-refresh and Resync button rescan storage. Long-press/right-click enters multi-select (enlarge + checkmark) for Delete / Change Cover. Missing-file: red exclamation badge on cover, progress retained, re-adding restores progress. Empty state: "Add your first light novel".
- Book Detail: large cover, title, author, total volumes, overall progress bar, ordered volume list with progress % and Continue/Start.
- Reader: default continuous vertical scroll; at the end of a volume show "End of Volume X" plus next-volume preview (title + first lines) and continue seamlessly. Settings alternatives: Paginated LTR, Paginated RTL. Adjustable font size, line height, margins. Progress auto-saved per volume plus overall series progress. TTS bar always accessible: Play/Pause, Speed, Voice (device voices), Continue from here / chapter jump, announces "End of Volume X. Starting Volume Y in 3, 2, 1". Large touch targets, one-handed friendly.
- Settings: app version, Theme, Reading mode, TTS defaults, Library layout default, Clear cache, Resync library, Export/Import progress (later), About/Credits.
- Add books: multi-file EPUB picker, folder select where supported; on add extract metadata + first-volume cover. Edit cover with any local image. Delete confirmation (progress deleted with the book). Navigation: bottom nav on mobile, sidebar/top bar on desktop.

## Roadmap (phases)

0 Scaffold. 1 Design system and primitives. 2 App shell and navigation. 3 Library UI. 4 Book Detail UI. 5 Reader UI. 6 Settings UI. 7 Add-books / Edit-cover / Delete UI. 8 Storage layer (Dexie: books, volumes, files, covers, progress, settings; stable-identity keys; Dexie-backed hook replaces mock). 9 EPUB import and metadata (hash, unzip, OPF, title/author/series/volume/cover/spine/chapters, group volumes into series, fallback generated cover, per-file errors, Web Worker, wire Edit Cover and Delete). 10 Library functionality (real sort, persisted layout/sort, multi-select, Resync/pull-to-refresh, missing-file detection, auto-relink, no duplicates). 11 Reader functionality (real EPUB rendering, lazy chapter streaming, seamless volume boundaries, paginated LTR/RTL, text controls, debounced progress, exact position restore). 12 TTS (voices, speed, sentence chunking, highlight/scroll, Continue from here, chapter jump, volume announcements, Media Session, Wake Lock, graceful degradation). 13 PWA and offline (manifest, maskable B/W icons, Workbox precache, offline reading, install prompt, iOS hint, update toast, persistent storage + usage in Settings, Lighthouse pass). 14 Final audit and polish (re-run the 20-rule audit with real data, missing states, bundle trim, README).

*** Add File: C:\Users\htums\Documents\Workspace\liber\docs\BUILD_STATE.md

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
- Phase 13, PWA and offline: partial. The app now includes static icon/manifest assets and a usable metadata pass, but full Workbox installation and offline validation are not yet configured.
- Phase 14, polish/audit: still pending. Bundle trimming, final accessibility pass, and a production-level QA sweep remain.

## Verified build results

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Vite emitted a non-fatal warning that the main JS chunk is 592.74 kB minified (187.63 kB gzip), above its 500 kB threshold.

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
