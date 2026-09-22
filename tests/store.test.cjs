const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store, fingerprint } = require("../electron/store.cjs");
function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notes-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test("UTF-8 Korean files round trip and external changes are protected", (t) => {
  const root = sandbox(t),
    s = new Store(path.join(root, "app"), { empty: true });
  const file = path.join(root, "한글 문서.md");
  fs.writeFileSync(file, "# 안녕하세요\n한글 폰트 테스트");
  const d = s.open(file);
  assert.match(d.content, /안녕하세요/);
  s.update(d.id, { content: "# 수정" });
  s.save(d.id, file);
  assert.equal(fs.readFileSync(file, "utf8"), "# 수정");
  fs.writeFileSync(file, "outside");
  assert.throws(() => s.save(d.id, file), /outside/);
  assert.equal(fs.readFileSync(file, "utf8"), "outside");
});
test("two devices pull, push, and preserve simultaneous edits as a conflict copy", (t) => {
  const root = sandbox(t),
    a = new Store(path.join(root, "a"), { empty: true }),
    b = new Store(path.join(root, "b"), { empty: true }),
    cloud = path.join(root, "cloud");
  const d = a.create("Plan", "# One");
  a.syncFolder(cloud);
  b.syncFolder(cloud);
  assert.equal(b.doc(d.id).content, "# One");
  a.update(d.id, { content: "# Two" });
  a.syncFolder(cloud);
  b.syncFolder(cloud);
  assert.equal(b.doc(d.id).content, "# Two");
  a.update(d.id, { content: "A edit" });
  b.update(d.id, { content: "B edit" });
  a.syncFolder(cloud);
  const result = b.syncFolder(cloud);
  assert.equal(result.conflicts, 1);
  assert.equal(b.doc(d.id).content, "B edit");
  assert.ok(
    b.data.docs.some(
      (x) => x.content === "A edit" && x.name.includes("conflict"),
    ),
  );
  a.syncFolder(cloud);
  assert.equal(a.doc(d.id).content, "B edit");
});
test("edits typed during network sync are never overwritten", (t) => {
  const s = new Store(sandbox(t), { empty: true }),
    d = s.create("New", "before");
  const started = { [d.id]: fingerprint(d) };
  s.update(d.id, { content: "typed while syncing" });
  s.acceptSync(
    { version: 1, docs: [{ ...d, content: "remote" }] },
    "github:test",
    started,
  );
  assert.equal(s.doc(d.id).content, "typed while syncing");
});
test("invalid remote is rejected without changing local notes", (t) => {
  const root = sandbox(t),
    s = new Store(root, { empty: true });
  s.create("Safe", "keep");
  assert.throws(
    () => s.merge({ version: 1, docs: [{ id: "../../bad" }] }),
    /Invalid/,
  );
  assert.equal(s.data.docs[0].content, "keep");
});
test("drafts, settings, session and trashed notes survive restart", (t) => {
  const root = sandbox(t),
    s = new Store(root, { empty: true });
  const d = s.create("Draft", "text");
  s.update(d.id, { trash: true, tags: ["개인"] });
  s.settings({ theme: "dark", opacity: 80 });
  s.session([d.id], d.id);
  const fresh = new Store(root);
  assert.equal(fresh.doc(d.id).content, "text");
  assert.equal(fresh.doc(d.id).trash, true);
  assert.equal(fresh.data.settings.opacity, 80);
  assert.equal(fresh.data.active, d.id);
});
