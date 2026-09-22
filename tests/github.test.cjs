const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Store } = require("../electron/store.cjs");
const { GitHub } = require("../electron/github.cjs");
test("GitHub transport creates, pulls, and detects optimistic concurrency conflicts without sending local paths", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notes-gh-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const a = new Store(path.join(root, "a"), { empty: true }),
    b = new Store(path.join(root, "b"), { empty: true });
  let remote = null,
    version = 0,
    rejectWrite = false;
  const gh = new GitHub("unused");
  gh.run = async (args, input) => {
    if (input) {
      if (rejectWrite) throw Error("HTTP 409");
      const data = JSON.parse(input);
      assert.equal(data.sha, version ? String(version) : undefined);
      remote = Buffer.from(data.content, "base64").toString();
      version++;
      return "{}";
    }
    if (args[1].endsWith("workspace.json")) {
      if (!remote) throw Error("HTTP 404");
      return JSON.stringify({
        sha: String(version),
        content: Buffer.from(remote).toString("base64"),
      });
    }
    return "{}";
  };
  const d = a.create("GitHub note", "# Text");
  a.doc(d.id).path = "C:/private/secret.md";
  await gh.sync(a, "owner/repo");
  assert.ok(!remote.includes("C:/private"));
  await gh.sync(b, "owner/repo");
  assert.equal(b.doc(d.id).content, "# Text");
  assert.equal(version, 1, "unchanged sync should not create a commit");
  a.update(d.id, { content: "Changed" });
  await gh.sync(a, "owner/repo");
  await gh.sync(b, "owner/repo");
  assert.equal(b.doc(d.id).content, "Changed");
  rejectWrite = true;
  a.update(d.id, { content: "Keep this edit" });
  await assert.rejects(gh.sync(a, "owner/repo"), /Another device/);
  assert.equal(a.doc(d.id).content, "Keep this edit");
});
