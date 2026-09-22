const { contextBridge, ipcRenderer, webUtils } = require("electron");
const call =
  (name) =>
  (...args) =>
    ipcRenderer.invoke("notes:" + name, ...args);
contextBridge.exposeInMainWorld("notes", {
  load: call("load"),
  ready: call("ready"),
  update: call("update"),
  create: call("create"),
  open: call("open"),
  save: call("save"),
  session: call("session"),
  settings: call("settings"),
  fonts: call("fonts"),
  importFont: call("import-font"),
  chooseSyncFolder: call("sync-folder"),
  sync: call("sync"),
  githubStatus: call("github-status"),
  githubLogin: call("github-login"),
  githubRepos: call("github-repos"),
  export: call("export"),
  chooseImage: call("image"),
  defaultApps: call("default-apps"),
  window: call("window"),
  external: call("external"),
  openDropped: (files) =>
    call("open-paths")(files.map((f) => webUtils.getPathForFile(f))),
  on: (name, handler) => {
    if (
      ![
        "opened",
        "sync-result",
        "github-login-output",
        "save-request",
        "close-request",
      ].includes(name)
    )
      return () => {};
    const fn = (_, data) => handler(data);
    ipcRenderer.on("notes:" + name, fn);
    return () => ipcRenderer.removeListener("notes:" + name, fn);
  },
});
