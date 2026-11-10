# Light Novel Audio Reader: Product spec and roadmap

EPUB-only, offline-first, lightweight, installable PWA. Pure client-side, no backend. Book data and settings stay on the user's device.

## Locked storage model

On supported browsers, the user selects a device folder. The app creates and uses this structure inside it:

```text
<chosen>/<AppName>/
	data/
		settings.json
		progress.json
		library-index.json
		covers/
	library/
		<Book Folder>/
			<Volume>.epub
```

The chosen folder is the source of truth for settings, progress, the library index, covers, and EPUB files. If browser site data is cleared or the app is reinstalled, choosing the same folder restores the library and progress from these files. Nothing is uploaded or leaves the device.

IndexedDB is only a cache for the selected directory handle, parsed metadata, and hash data; it is not the canonical store. Browsers without the required folder APIs, including iOS, Safari, and Firefox, use in-app IndexedDB/OPFS storage and provide Export/Import for the data files so users can back up and restore their library.

Progress is keyed by stable content identity: SHA-256 hash of each EPUB, with the established normalized title + author + volume number fallback when hashing is unavailable. Progress records are written to `data/progress.json`, retained when source files go missing, and removed only when the user deletes the book.

## Library folder rules

- Each folder represents one book. Its title is the folder name after removing any trailing sequence of bracketed source tags using `[]`, `()`, `【】`, or `{}`. Store the bracket contents as `sourceTags`; show them as a muted metadata line on Book Detail, never as part of the title.
- EPUB files inside a book folder are volumes. Parse volume numbers from filenames matching forms such as `Vol. 3`, `v03`, `Volume 3`, or `#3`; order numbered volumes by number and use natural filename order as the fallback/tie-breaker.
- A folder whose cleaned title matches an existing book merges into that book as new volumes. Skip duplicate EPUB content by hash.
- A directly dropped folder with no EPUB files at its root but with subfolders containing EPUBs imports each EPUB-bearing subfolder as its own book.
- Cover priority is a recognized folder cover (`cover.jpg/png/webp` or `folder.jpg/png/webp`), then the cover from the lowest-numbered volume, then later volumes in order, then a generated flat cover. Extract/cache each volume's cover as well as the book cover.
- Author and per-volume metadata come from EPUB metadata.
- An EPUB placed directly in `library/` is a single-volume book.

## Locked import and detail behavior

- The Library action is named **Add light novels**. It accepts folders and individual EPUB files, supports drag-and-drop for both, and provides separate **Choose folder** and **Choose files** actions inside the modal.
- Book Detail includes volume sorting by Name (ascending by default) or Date Added, an icon-only ascending/descending toggle, a grid/list `IconToggle` for volumes, per-book resync, an Edit menu, and **Add volumes**.
- Library sorting includes an icon-only ascending/descending toggle.
- Reading-mode controls (Continuous vertical, Paginated LTR, Paginated RTL) and Library default-layout controls (Grid/List) are icon-only everywhere, including Reader and Settings. Use custom tooltips and accessible aria-labels.
- Settings has no About section, app version, or credits.

## Pages

- Library: bookshelf feel. Grid default (cover, title, author, volume count); list view (small cover, title, author, volume count, date added, progress, last-read timestamp). Sort by Date Added, Date Modified, Last Read, Completed, Title, or Author. Folder scan/resync reports status in a banner; on desktop this is the only top-of-screen notification. Long-press/right-click enters multi-select for delete, cover change, or grouping. Missing files retain progress; restoring the source restores the book. Empty state: "Add your first light novel".
- Library sorting supports ascending/descending direction. Its import action is **Add light novels**.
- Book Detail: large cover, cleaned title, author, muted source tags, total volumes, overall progress, and naturally ordered volumes with progress and Continue/Start. Include the locked sort, direction, view, resync, Edit, and Add volumes controls above.
- Reader: continuous vertical scroll by default; show the volume boundary and next-volume preview, with seamless continuation. Alternatives: Paginated LTR and RTL. Adjustable font size, line height, and margins. Save exact per-volume reading and speech progress. TTS controls provide Play/Pause, speed, device voice, Continue from here, chapter jump, and volume announcements. Use large touch targets.
- Settings: reading mode, TTS defaults, Library default layout, storage usage, folder resync, and data Export/Import where required. Do not add an About section, app version, or credits. Light/Dark/System theme behavior is complete and locked; do not change it.
- Add light novels: a centered hybrid folder/file modal; parse locally, obtain metadata and covers, merge by cleaned folder title, skip duplicate content hashes, and report per-file errors. Cover editing and deletion are supported.
- Navigation: bottom navigation on mobile and desktop navigation consistent with the existing shell.

## Locked UI rules

- Do not use native browser form controls or dialogs in the app: no native `select`, `alert`, `confirm`, `prompt`, or `title` tooltips. Use custom controls and shared primitives consistent with the design system. The operating-system/browser folder picker may be used solely for the explicit permission-granting folder selection.
- Notifications appear bottom-right on desktop and at the top of the screen on mobile. The only desktop top-of-screen exception is the resync status banner.
- Popups and modals are centered, use a blurred backdrop, and close using the X or backdrop click. Do not add a separate "Close" button.
- The install button at the top of the screen is the only install entry point. Do not show a bottom "install library for offline reading" prompt.

## Roadmap

The original phases 0-14 describe the first implementation. The following R roadmap is the current next-work sequence:

- R0, Documentation: update the locked decisions and project context. Complete.
- R1, Motion system: establish restrained, consistent motion and reduced-motion behavior. Complete.
- R2, Custom UI primitives: provide custom controls, dialogs, popups, and notifications required by the UI rules. Complete.
- R3, Library fixes: align the library and its display with the folder rules and real-world metadata/volume cases. Complete.
- R4, Add Books modal: implement the centered folder selection, scan, and restore interaction.
- R5, Folder storage engine: implement the chosen-folder source of truth, JSON data files, covers, and the unsupported-browser fallback with Export/Import.
- R6, Onboarding, scan, restore: guide folder setup and restore, then scan and reconcile the folder structure.

R5 and R6 supersede the storage-engine and resync/reconciliation portions of Phase 10. Phase 10's unrelated library sort/layout and selection work remains relevant.

The S roadmap is the next sequence after R0-R6:

- S0, Documentation and instructions: record the locked import/detail decisions and phase triggers. Complete.
- S1, Deployed folder selection: fix folder selection on deployed builds.
- S2, Add light novels: implement hybrid folder and individual-EPUB import, folder parsing, source tags, volume numbering, cover priority, deduplication, and merge behavior.
- S3, Book Detail tools: implement sorting/direction, volume grid/list, per-book resync, Edit menu, and Add volumes.
- S4, Icon controls and Settings cleanup: use icon-only reading/layout controls everywhere and remove About/version/credits.
- S5, Final audit and deploy check: complete the product audit and verify the deployed build.
