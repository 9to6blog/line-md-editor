const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeTheme,
  screen,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Store, atomicWrite } = require("./store.cjs");
const { GitHub } = require("./github.cjs");
const testMode = !!process.env.NOTES_TEST_ROOT;
if (testMode) app.setPath("userData", process.env.NOTES_TEST_ROOT);
app.setAppUserModelId("studio.notes.markdown");
let win,
  store,
  github,
  syncing = false,
  closeAllowed = false,
  syncTimer;
const cliFiles = () =>
  process.argv.filter(
    (a) => /\.(md|markdown|mdown|txt)$/i.test(a) && fs.existsSync(a),
  );
if (!testMode && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      for (const p of argv.filter(
        (a) => /\.(md|markdown|mdown|txt)$/i.test(a) && fs.existsSync(a),
      )) {
        try {
          win.webContents.send("notes:opened", store.open(p));
        } catch (e) {
          dialog.showErrorBox("Could not open file", e.message);
        }
      }
    }
  });
  app
    .whenReady()
    .then(async () => {
      try {
        store = new Store(app.getPath("userData"));
      } catch (e) {
        dialog.showErrorBox("Notes workspace", e.message);
        app.quit();
        return;
      }
      github = new GitHub(
        app.isPackaged
          ? path.join(process.resourcesPath, "vendor", "gh.exe")
          : path.join(__dirname, "..", "assets", "vendor", "gh.exe"),
      );
      const display = screen.getPrimaryDisplay().workAreaSize;
      const width = testMode ? 1550 : Math.min(1550, display.width - 64),
        height = testMode ? 868 : Math.min(868, display.height - 64);
      const material =
        process.platform === "win32" &&
        Number(os.release().split(".")[2]) >= 22621;
      win = new BrowserWindow({
        width,
        height,
        minWidth: 980,
        minHeight: 640,
        frame: false,
        roundedCorners: true,
        show: false,
        backgroundColor: "#eef3fa",
        ...(material ? { backgroundMaterial: "mica" } : {}),
        icon: path.join(__dirname, "../assets/icon.ico"),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          spellcheck: true,
        },
      });
      win.removeMenu();
      win.setOpacity(
        Math.max(0.7, Math.min(1, store.data.settings.opacity / 100)),
      );
      nativeTheme.themeSource = store.data.settings.theme;
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e) => e.preventDefault());
      win.webContents.session.setPermissionRequestHandler((wc, p, cb) =>
        cb(false),
      );
      win.on("close", (e) => {
        if (!closeAllowed) {
          e.preventDefault();
          win.webContents.send("notes:close-request");
        }
      });
      ipcMain.handle("notes:load", () => store.snapshot());
      let startupDispatched = false;
      ipcMain.handle("notes:ready", () => {
        if (!startupDispatched) {
          startupDispatched = true;
          setImmediate(() => {
            for (const file of cliFiles()) {
              try {
                win.webContents.send("notes:opened", store.open(file));
              } catch (e) {
                dialog.showErrorBox("Could not open file", e.message);
              }
            }
          });
        }
        return true;
      });
      ipcMain.handle("notes:create", (_, name, content) =>
        store.create(name, content),
      );
      ipcMain.handle("notes:update", (_, id, patch) => store.update(id, patch));
      ipcMain.handle("notes:session", (_, tabs, active) =>
        store.session(tabs, active),
      );
      const openFiles = async (paths) => {
        const docs = [];
        for (const file of paths) docs.push(store.open(file));
        return docs;
      };
      ipcMain.handle("notes:open", async () => {
        const result = await dialog.showOpenDialog(win, {
          title: "Open Markdown",
          properties: ["openFile", "multiSelections"],
          filters: [
            {
              name: "Markdown documents",
              extensions: ["md", "markdown", "mdown", "txt"],
            },
            { name: "All files", extensions: ["*"] },
          ],
        });
        return result.canceled ? [] : openFiles(result.filePaths);
      });
      ipcMain.handle("notes:open-paths", (_, paths) => openFiles(paths));
      ipcMain.handle("notes:save", async (_, id, as) => {
        let target = as ? null : store.doc(id).path;
        if (!target) {
          const result = await dialog.showSaveDialog(win, {
            defaultPath: store.doc(id).name,
            filters: [{ name: "Markdown", extensions: ["md"] }],
          });
          if (result.canceled) return null;
          target = result.filePath;
        }
        return store.save(id, target);
      });
      ipcMain.handle("notes:settings", (_, patch) => {
        const settings = store.settings(patch);
        nativeTheme.themeSource = ["light", "dark", "system"].includes(
          settings.theme,
        )
          ? settings.theme
          : "light";
        win.setOpacity(
          Math.max(0.7, Math.min(1, Number(settings.opacity) / 100)),
        );
        return settings;
      });
      ipcMain.handle("notes:window", (_, action) => {
        if (action === "minimize") win.minimize();
        if (action === "maximize")
          win.isMaximized() ? win.unmaximize() : win.maximize();
        if (action === "close") win.close();
        if (action === "close-ready") {
          closeAllowed = true;
          setImmediate(() => win.close());
          return true;
        }
      });
      ipcMain.handle("notes:fonts", async () => {
        try {
          const { stdout } = await promisify(execFile)(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families.Name | ConvertTo-Json -Compress",
            ],
            { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
          );
          return JSON.parse(stdout.replace(/^\uFEFF/, ""));
        } catch {
          return [
            "Segoe UI",
            "Consolas",
            "Arial",
            "Georgia",
            "Malgun Gothic",
            "Gulim",
            "Courier New",
          ];
        }
      });
      ipcMain.handle("notes:import-font", async () => {
        const result = await dialog.showOpenDialog(win, {
          title: "Import font",
          filters: [
            { name: "Fonts", extensions: ["ttf", "otf", "woff", "woff2"] },
          ],
          properties: ["openFile"],
        });
        if (result.canceled) return null;
        const source = result.filePaths[0];
        if (fs.statSync(source).size > 30 * 1024 * 1024)
          throw Error("Choose a font smaller than 30 MB.");
        const id = require("node:crypto").randomUUID();
        const target = path.join(
          store.root,
          "fonts",
          id + path.extname(source),
        );
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
        const font = {
          name: path.basename(source, path.extname(source)),
          family: "custom-" + id,
          url: pathToFileURL(target).href,
        };
        store.data.customFonts.push(font);
        store.persist();
        return font;
      });
      ipcMain.handle("notes:sync-folder", async (_, provider) => {
        const envDefaults = {
          onedrive: process.env.OneDrive || process.env.OneDriveConsumer,
          dropbox: path.join(os.homedir(), "Dropbox"),
          google: path.join(os.homedir(), "My Drive"),
        };
        const result = await dialog.showOpenDialog(win, {
          title: "Choose your " + provider + " sync folder",
          defaultPath: envDefaults[provider] || app.getPath("documents"),
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled) return null;
        return store.settings({
          syncProvider: provider,
          syncFolder: result.filePaths[0],
          lastSync: null,
        });
      });
      const sync = async () => {
        if (syncing) return { busy: true };
        const s = store.data.settings;
        if (s.syncProvider === "none")
          throw Error("Choose a sync provider in Settings first.");
        syncing = true;
        try {
          const result =
            s.syncProvider === "github"
              ? await github.sync(store, s.githubRepo)
              : store.syncFolder(s.syncFolder);
          const out = {
            conflicts: result.conflicts,
            pulled: result.pulled,
            state: store.snapshot(),
          };
          win?.webContents.send("notes:sync-result", out);
          return out;
        } finally {
          syncing = false;
        }
      };
      ipcMain.handle("notes:sync", sync);
      syncTimer = setInterval(() => {
        if (store.data.settings.syncProvider !== "none")
          sync().catch((e) =>
            win?.webContents.send("notes:sync-result", { error: e.message }),
          );
      }, 300000);
      ipcMain.handle("notes:github-status", () => github.status());
      ipcMain.handle("notes:github-repos", () => github.repos());
      ipcMain.handle("notes:github-login", () =>
        github.login((text) =>
          win.webContents.send("notes:github-login-output", text),
        ),
      );
      ipcMain.handle("notes:default-apps", () =>
        shell.openExternal("ms-settings:defaultapps"),
      );
      ipcMain.handle("notes:external", (_, url) => {
        if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
      });
      ipcMain.handle("notes:image", async () => {
        const result = await dialog.showOpenDialog(win, {
          title: "Insert image",
          filters: [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
            },
          ],
          properties: ["openFile"],
        });
        if (result.canceled) return null;
        const f = result.filePaths[0];
        return {
          name: path.basename(f),
          path: f.replaceAll("\\", "/"),
          url: pathToFileURL(f).href,
        };
      });
      ipcMain.handle("notes:export", async (_, id, format, html) => {
        if (!["md", "html", "pdf"].includes(format))
          throw Error("Unknown export format.");
        const doc = store.doc(id);
        const result = await dialog.showSaveDialog(win, {
          defaultPath: doc.name.replace(/\.[^.]+$/, "") + "." + format,
          filters: [{ name: format.toUpperCase(), extensions: [format] }],
        });
        if (result.canceled) return null;
        if (format === "md") atomicWrite(result.filePath, doc.content);
        else if (format === "html") atomicWrite(result.filePath, html);
        else {
          const print = new BrowserWindow({
            show: false,
            webPreferences: {
              sandbox: true,
              nodeIntegration: false,
              contextIsolation: true,
            },
          });
          try {
            await print.loadURL(
              "data:text/html;charset=utf-8," + encodeURIComponent(html),
            );
            await print.webContents.executeJavaScript(
              "document.fonts.ready.then(()=>true)",
            );
            const buffer = await print.webContents.printToPDF({
              printBackground: true,
              pageSize: "A4",
              margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
            });
            fs.writeFileSync(result.filePath, buffer);
          } finally {
            print.destroy();
          }
        }
        return result.filePath;
      });
      await win.loadFile(path.join(__dirname, "../dist/index.html"));
      win.show();
    })
    .catch((e) => {
      dialog.showErrorBox("Notes", e.stack || e.message);
      app.quit();
    });
  app.on("window-all-closed", () => {
    clearInterval(syncTimer);
    app.quit();
  });
}
