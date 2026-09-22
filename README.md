# Notes · Windows Markdown editor

A Windows 10/11 x64 desktop Markdown workspace, built around the supplied Notes design reference. The source editor, preview, outline, custom SVG toolbar, document tabs, collections, favorites, tags, light/dark themes and status bar are implemented as an actual desktop application.

## Install

Run `Notes-Setup-1.0.0-x64.exe`. The installer registers `.md`, `.markdown` and `.mdown` and adds Start Menu / desktop shortcuts. Choose **Notes** in Windows **Settings → Apps → Default apps** (also accessible from Notes → Settings → Files). Windows retains control over your default-app choice.

`Notes-Portable-1.0.0-x64.exe` runs without installation. Use the installer for file association. The portable build stores settings and drafts in the Windows user profile; it is not a USB-isolated data vault.

## Editing

- Real CodeMirror editor with syntax highlighting, undo/redo, line numbers, find/replace, IME support and keyboard shortcuts.
- Live, sanitized GitHub-flavored Markdown preview, clickable task checkboxes, syntax-highlighted code blocks and code copying.
- Resizable split view, source-only and preview-only modes; synchronized scrolling can be switched off.
- Tabs and local drafts survive restarts. **Ctrl+S** writes a Markdown file; **Ctrl+Shift+S** saves a copy. Draft autosave does not silently overwrite an external file.
- Export Markdown, HTML or A4 PDF. Relative local images work for an opened file; inserted local images use absolute file URLs, so move/copy image assets when sharing the document.
- Right-click a tab or recent file to rename its workspace label, organize collections/tags, favorite, archive or move to Trash. Trash is reversible. Renaming a workspace label does not rename an existing disk file; use Save As for that.
- Installed fonts and imported TTF/OTF/WOFF/WOFF2 fonts; separate editor and reading fonts/sizes, including Korean font fallbacks.
- Native window opacity (70–100%) and translucent surface settings. Windows 11 22H2+ additionally enables the OS Mica backdrop. OS window corners/backdrop and text rasterization may differ across Windows versions and display scaling.

## Sync without developer keys

**OneDrive, Dropbox, Google Drive:** install/sign into the provider's normal desktop application and choose one of its synced folders in Notes → Settings → Sync. Choose the same folder on each computer. Notes exchanges an authoritative `Notes Workspace/workspace.json` snapshot and writes `.md` export mirrors under `Notes Workspace/Markdown/`. Edit notes in Notes; mirrors are exports and external edits to the mirrors are not imported. Deletions use reversible Trash metadata.

**GitHub:** the app bundles the official GitHub CLI 2.101.0. Existing CLI sign-in is recognized; otherwise click **Sign in with browser** and follow the displayed one-time device code. No personal access token, application registration, Git installation or API-key issuance is required. Select an existing repository you can write to (prefer private for private notes). Sync uses `.notes-sync/workspace.json`; it does not upload local file paths, credentials or font files. The repository's default branch must allow direct writes.

Sync runs manually or every five minutes while Notes is open. A three-way comparison preserves simultaneous edits as a separate `(...sync conflict).md` note. GitHub updates use SHA-based optimistic concurrency; when another device writes during the request, Notes asks you to sync again. Cloud providers themselves may create conflicted snapshot copies when multiple disconnected devices publish simultaneously; retain those provider conflict copies for recovery. This is folder sync, not an app-owned OAuth connection to the three cloud-drive APIs.

## Keyboard shortcuts

| Shortcut              | Action                                       |
| --------------------- | -------------------------------------------- |
| Ctrl+N / Ctrl+O       | New / Open                                   |
| Ctrl+S / Ctrl+Shift+S | Save / Save as                               |
| Ctrl+W                | Close current tab (draft remains in library) |
| Ctrl+B / Ctrl+I       | Bold / Italic                                |
| Ctrl+Z / Ctrl+Y       | Undo / Redo                                  |
| Ctrl+F                | Find / replace in current document           |
| Ctrl+Shift+F          | Search all notes                             |
| Ctrl+Shift+P          | Toggle preview                               |
| Ctrl+,                | Settings                                     |

## Develop and build on Windows

Node.js 24 LTS, npm, Windows 10/11 x64. No production service is required.

```powershell
npm ci
npm test
npm run test:ui
npm start
npm run dist
```

`npm ci` runs the preparation script: it renders the authored SVG to a multi-resolution `.ico`, downloads the pinned official GitHub CLI archive, validates its SHA-256 and extracts its executable/license. `npm run dist` creates an NSIS installer and a portable executable in `release/`. Electron and all npm dependencies are pinned in `package-lock.json`. Renderer dependencies are bundled locally; no runtime CDN is used.

The installer is currently unsigned (no signing certificate was supplied). Windows may show an unknown-publisher / SmartScreen prompt. Packaged app source has context isolation, a sandboxed renderer, a restricted preload bridge, a Content Security Policy, sanitized Markdown and external-navigation restrictions.

## Validation

`npm test` covers UTF-8 file round trips, external-write protection, persistent drafts, two-device folder sync, conflict copies, edits typed during network sync, malformed snapshots, GitHub transport, path exclusion and concurrent-write rejection.

`npm run test:ui` launches the real Electron application with an isolated temporary profile. It checks initial layout, dark theme, native opacity, font selection, Korean editing, checkboxes, file saving, folder adapters for all three cloud providers, PDF output, search and restart restoration. Native file dialogs are stubbed during automation. Cloud-provider networking and the interactive GitHub browser sign-in require the user's account and are not claimed as end-to-end cloud tests. Windows 10 compatibility is targeted; validation is on the available host OS, not a separate Windows 10 VM.

The supplied image is a visual reference, not included in the repository. Notes closely recreates its layout and authored icons; exact pixel identity across OS versions and DPI settings is not guaranteed. Sample document feature checkboxes and progress labels reproduce the reference content and are editable examples, not the application's actual feature status.

Third-party notices are in `THIRD-PARTY.md`; Electron/Chromium and GitHub CLI licenses ship with the app.
