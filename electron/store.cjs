const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { seeds } = require("./seed.cjs");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temporary, data, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function portable(doc) {
  return {
    id: doc.id,
    name: doc.name,
    content: doc.content,
    folders: doc.folders || [],
    tags: doc.tags || [],
    favorite: !!doc.favorite,
    archived: !!doc.archived,
    trash: !!doc.trash,
    updatedAt: doc.updatedAt,
  };
}
const fingerprint = (doc) =>
  hash(JSON.stringify(portable({ ...doc, updatedAt: 0 })));
function validSnapshot(data) {
  if (
    data?.version !== 1 ||
    !Array.isArray(data.docs) ||
    data.docs.length > 10000
  )
    throw new Error("This is not a valid Notes sync workspace.");
  const ids = new Set();
  for (const doc of data.docs) {
    if (
      !doc ||
      typeof doc.id !== "string" ||
      !/^[\w-]{1,100}$/.test(doc.id) ||
      ids.has(doc.id) ||
      typeof doc.name !== "string" ||
      typeof doc.content !== "string" ||
      doc.content.length > 20 * 1024 * 1024 ||
      !Array.isArray(doc.tags) ||
      !Array.isArray(doc.folders) ||
      [...doc.tags, ...doc.folders].some((x) => typeof x !== "string")
    )
      throw new Error(
        "Invalid document in sync workspace. No files were changed.",
      );
    ids.add(doc.id);
  }
  return data;
}
class Store {
  constructor(root, { empty = false } = {}) {
    this.root = root;
    this.file = path.join(root, "workspace.json");
    const defaults = {
      version: 1,
      docs: empty ? [] : clone(seeds),
      tabs: empty ? [] : ["sample-1", "sample-2", "sample-4"],
      active: empty ? null : "sample-1",
      settings: {
        theme: "light",
        opacity: 100,
        glass: 75,
        editorFont: "Consolas",
        previewFont: "Segoe UI",
        fontSize: 13,
        previewSize: 14,
        wordWrap: true,
        syncScroll: true,
        zoom: 100,
        syncProvider: "none",
        syncFolder: "",
        githubRepo: "",
        lastSync: null,
      },
      syncBases: {},
      customFonts: [],
    };
    if (fs.existsSync(this.file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (!Array.isArray(this.data.docs)) throw Error("Invalid workspace");
      } catch (e) {
        throw new Error(
          "Your workspace could not be read. It has been preserved at " +
            this.file +
            ". " +
            e.message,
        );
      }
    } else this.data = defaults;
    this.data.settings = { ...defaults.settings, ...this.data.settings };
    this.data.syncBases ||= {};
    this.data.customFonts ||= [];
    this.persist();
  }
  persist() {
    atomicWrite(this.file, JSON.stringify(this.data, null, 2));
  }
  snapshot() {
    return clone(this.data);
  }
  doc(id) {
    const doc = this.data.docs.find((d) => d.id === id);
    if (!doc) throw Error("Document no longer exists.");
    return doc;
  }
  update(id, patch) {
    const doc = this.doc(id);
    for (const key of [
      "name",
      "content",
      "folders",
      "tags",
      "favorite",
      "archived",
      "trash",
    ])
      if (patch[key] !== undefined) doc[key] = patch[key];
    doc.updatedAt = Date.now();
    this.persist();
    return clone(doc);
  }
  create(name = "Untitled.md", content = "") {
    const doc = {
      id: crypto.randomUUID(),
      name: name.endsWith(".md") ? name : name + ".md",
      content,
      folders: ["Personal"],
      tags: [],
      favorite: false,
      archived: false,
      trash: false,
      updatedAt: Date.now(),
    };
    this.data.docs.unshift(doc);
    this.persist();
    return clone(doc);
  }
  open(file) {
    file = path.resolve(file);
    if (!/\.(md|markdown|mdown|txt)$/i.test(file))
      throw Error("Please choose a Markdown or text file.");
    if (fs.statSync(file).size > 20 * 1024 * 1024)
      throw Error("Files larger than 20 MB are not supported.");
    let doc = this.data.docs.find(
      (d) => d.path?.toLowerCase() === file.toLowerCase(),
    );
    if (doc) return clone(doc);
    const content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    doc = this.create(path.basename(file), content);
    Object.assign(this.doc(doc.id), {
      path: file,
      diskHash: hash(fs.readFileSync(file)),
      savedContent: content,
    });
    this.persist();
    return clone(this.doc(doc.id));
  }
  save(id, file, { overwrite = false } = {}) {
    const doc = this.doc(id);
    file = path.resolve(file);
    if (
      !overwrite &&
      doc.path === file &&
      doc.diskHash &&
      fs.existsSync(file) &&
      hash(fs.readFileSync(file)) !== doc.diskHash
    )
      throw Error(
        "This file changed outside Notes. Save a copy to keep both versions.",
      );
    atomicWrite(file, doc.content);
    Object.assign(doc, {
      path: file,
      name: path.basename(file),
      diskHash: hash(doc.content),
      savedContent: doc.content,
    });
    this.persist();
    return clone(doc);
  }
  settings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.persist();
    return clone(this.data.settings);
  }
  session(tabs, active) {
    this.data.tabs = tabs.filter((id) =>
      this.data.docs.some((d) => d.id === id),
    );
    this.data.active = active;
    this.persist();
  }
  merge(remote, base = {}) {
    validSnapshot(remote);
    const local = this.data.docs.map(portable);
    const map = new Map(local.map((d) => [d.id, d]));
    let conflicts = 0,
      pulled = 0;
    for (const incoming of remote.docs) {
      const localDoc = map.get(incoming.id);
      if (!localDoc) {
        map.set(incoming.id, portable(incoming));
        pulled++;
        continue;
      }
      const lh = fingerprint(localDoc),
        rh = fingerprint(incoming);
      if (lh === rh) continue;
      if (base[incoming.id] === lh) {
        map.set(incoming.id, portable(incoming));
        pulled++;
      } else if (base[incoming.id] !== rh) {
        const conflict = {
          ...portable(incoming),
          id: crypto.randomUUID(),
          name: incoming.name.replace(/\.md$/i, "") + " (sync conflict).md",
          updatedAt: Date.now(),
        };
        map.set(conflict.id, conflict);
        conflicts++;
      }
    }
    return {
      snapshot: { version: 1, docs: [...map.values()] },
      conflicts,
      pulled,
    };
  }
  acceptSync(snapshot, key, started) {
    // A keystroke may arrive while the network is in flight. Preserve that local edit.
    const existing = new Map(this.data.docs.map((d) => [d.id, d]));
    const merged = snapshot.docs.map((d) => {
      const old = existing.get(d.id);
      if (old && started[d.id] && fingerprint(old) !== started[d.id])
        return old;
      return { ...old, ...d };
    });
    for (const doc of this.data.docs)
      if (!merged.some((d) => d.id === doc.id)) merged.push(doc);
    this.data.docs = merged;
    this.data.syncBases[key] = Object.fromEntries(
      snapshot.docs.map((d) => [d.id, fingerprint(d)]),
    );
    this.data.settings.lastSync = Date.now();
    this.persist();
  }
  syncFolder(folder) {
    const root = path.resolve(folder);
    if (root === path.resolve(this.root))
      throw Error("Choose a cloud folder separate from the Notes data folder.");
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, "Notes Workspace", "workspace.json");
    const key = "folder:" + root;
    const remote = fs.existsSync(file)
      ? validSnapshot(JSON.parse(fs.readFileSync(file, "utf8")))
      : { version: 1, docs: [] };
    const started = Object.fromEntries(
      this.data.docs.map((d) => [d.id, fingerprint(d)]),
    );
    const result = this.merge(remote, this.data.syncBases[key]);
    // Publish the authoritative snapshot atomically. Markdown mirrors are convenient exports.
    for (const doc of result.snapshot.docs) {
      const safeName = doc.name
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 100);
      atomicWrite(
        path.join(
          root,
          "Notes Workspace",
          "Markdown",
          doc.id + "--" + safeName,
        ),
        doc.content,
      );
    }
    atomicWrite(file, JSON.stringify(result.snapshot, null, 2));
    this.acceptSync(result.snapshot, key, started);
    return result;
  }
}
module.exports = {
  Store,
  hash,
  fingerprint,
  portable,
  validSnapshot,
  atomicWrite,
};
