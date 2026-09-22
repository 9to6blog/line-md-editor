const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");
const { validSnapshot, fingerprint } = require("./store.cjs");
const exec = promisify(execFile);
class GitHub {
  constructor(binary) {
    this.binary = binary;
    this.loginProcess = null;
  }
  async run(args, input) {
    if (input === undefined) {
      const { stdout } = await exec(this.binary, args, {
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120000,
      });
      return stdout;
    }
    return new Promise((resolve, reject) => {
      const p = spawn(this.binary, args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "",
        err = "";
      const timer = setTimeout(() => {
        p.kill();
        reject(Error("GitHub request timed out."));
      }, 120000);
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      p.on("close", (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve(out)
          : reject(Error(err || "GitHub request failed."));
      });
      p.stdin.end(input);
    });
  }
  async status() {
    try {
      return {
        connected: true,
        user: JSON.parse(await this.run(["api", "user"])).login,
      };
    } catch {
      return { connected: false };
    }
  }
  login(onOutput) {
    if (this.loginProcess)
      throw Error("A GitHub sign-in is already in progress.");
    return new Promise((resolve, reject) => {
      const p = spawn(
        this.binary,
        [
          "auth",
          "login",
          "--hostname",
          "github.com",
          "--git-protocol",
          "https",
          "--web",
          "--skip-ssh-key",
        ],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      );
      this.loginProcess = p;
      const timer = setTimeout(() => p.kill(), 300000);
      const receive = (d) => {
        const s = d.toString();
        onOutput(s.replace(/\x1b\[[0-9;]*m/g, ""));
        if (/Press Enter/i.test(s)) p.stdin.write("\n");
      };
      p.stdout.on("data", receive);
      p.stderr.on("data", receive);
      p.stdin.write("\n");
      p.on("error", (e) => {
        clearTimeout(timer);
        this.loginProcess = null;
        reject(e);
      });
      p.on("close", async (code) => {
        clearTimeout(timer);
        this.loginProcess = null;
        code === 0
          ? resolve(await this.status())
          : reject(Error("GitHub sign-in did not finish. Please try again."));
      });
    });
  }
  async repos() {
    return JSON.parse(
      await this.run(["api", "user/repos?per_page=100&sort=pushed"]),
    )
      .filter((r) => r.permissions?.push)
      .map((r) => ({ name: r.full_name, private: r.private }));
  }
  async sync(store, repo) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
      throw Error("Enter a GitHub repository as owner/repository.");
    const key = "github:" + repo,
      endpoint = `repos/${repo}/contents/.notes-sync/workspace.json`;
    let remote = { version: 1, docs: [] },
      sha;
    try {
      const data = JSON.parse(await this.run(["api", endpoint]));
      sha = data.sha;
      const json = data.content
        ? Buffer.from(data.content, "base64").toString("utf8")
        : await this.run([
            "api",
            endpoint,
            "-H",
            "Accept: application/vnd.github.raw+json",
          ]);
      remote = validSnapshot(JSON.parse(json));
    } catch (e) {
      if (!/HTTP 404/.test(e.message)) throw e;
      await this.run(["api", `repos/${repo}`]);
    }
    const started = Object.fromEntries(
      store.data.docs.map((d) => [d.id, fingerprint(d)]),
    );
    const result = store.merge(remote, store.data.syncBases[key]);
    const content = Buffer.from(
      JSON.stringify(result.snapshot, null, 2),
    ).toString("base64");
    if (content.length > 12 * 1024 * 1024)
      throw Error(
        "This workspace is too large for GitHub sync. Choose a cloud folder instead.",
      );
    const body = {
      message: "Sync Notes workspace",
      content,
      ...(sha ? { sha } : {}),
    };
    const unchanged =
      sha &&
      remote.docs.length === result.snapshot.docs.length &&
      remote.docs.every((d) =>
        result.snapshot.docs.some(
          (l) => l.id === d.id && fingerprint(l) === fingerprint(d),
        ),
      );
    try {
      if (!unchanged)
        await this.run(
          ["api", "--method", "PUT", endpoint, "--input", "-"],
          JSON.stringify(body),
        );
    } catch (e) {
      if (/409|422/.test(e.message))
        throw Error(
          "Another device updated GitHub during sync. Your local notes are safe; click Sync again.",
        );
      throw e;
    }
    store.acceptSync(result.snapshot, key, started);
    return result;
  }
}
module.exports = { GitHub };
