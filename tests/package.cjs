const { _electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

(async () => {
  delete process.env.ELECTRON_RUN_AS_NODE;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notes-package-"));
  const executablePath = path.resolve(
    process.argv[2] || "release/win-unpacked/Notes.exe",
  );
  const documentPath = path.join(root, "패키지 파일 연결.md");
  fs.writeFileSync(
    documentPath,
    "# Packaged Notes\n\n한글 경로 파일 연결 테스트.",
  );
  let app;
  try {
    app = await _electron.launch({
      executablePath,
      args: [documentPath],
      env: { ...process.env, NOTES_TEST_ROOT: root },
    });
    const page = await app.firstWindow();
    await page.waitForFunction(
      () =>
        document.querySelector("#preview h1")?.textContent === "Packaged Notes",
    );
    const info = await app.evaluate(({ app, BrowserWindow }) => ({
      packaged: app.isPackaged,
      sandbox:
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
          .sandbox,
      isolated:
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
          .contextIsolation,
    }));
    assert.deepEqual(info, { packaged: true, sandbox: true, isolated: true });
    // Existing account access is read-only: never push test notes to a real repository.
    const github = await page.evaluate(() => window.notes.githubStatus());
    assert.equal(typeof github.connected, "boolean");
    const availableFonts = await page.evaluate(() => window.notes.fonts());
    assert.ok(availableFonts.length > 10);
    const fontPath = path.join(process.env.WINDIR, "Fonts", "malgun.ttf");
    if (fs.existsSync(fontPath)) {
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [file],
        });
      }, fontPath);
      const font = await page.evaluate(() => window.notes.importFont());
      assert.ok(font.family.startsWith("custom-"));
      assert.ok(fs.existsSync(new URL(font.url)));
    }
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(
      '\n\n<img src="invalid" onerror="window.__unsafe=1"><script>window.__unsafe=1</script>\n\nFinal draft persisted.',
    );
    await page.waitForFunction(() =>
      document
        .querySelector("#preview")
        .textContent.includes("Final draft persisted."),
    );
    assert.equal(await page.evaluate(() => window.__unsafe), undefined);
    assert.equal(
      await page.locator("#preview script,#preview [onerror]").count(),
      0,
    );
    const closed = app.waitForEvent("close");
    await page.getByLabel("Close window", { exact: true }).click();
    await closed;
    app = null;
    const saved = JSON.parse(
      fs.readFileSync(path.join(root, "workspace.json"), "utf8"),
    );
    assert.ok(
      saved.docs.some((d) => d.content.includes("Final draft persisted.")),
    );
    console.log(
      JSON.stringify({
        result: "PASS",
        packagedFileOpen: true,
        koreanPath: true,
        bundledGithubCliConnected: github.connected,
        installedFonts: availableFonts.length,
        fontImport: true,
        markdownSanitization: true,
        closeFlush: true,
        rendererSandbox: true,
      }),
    );
  } finally {
    if (app) {
      await app
        .evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
        )
        .catch(() => {});
      await app.close().catch(() => {});
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
