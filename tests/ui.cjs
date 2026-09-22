const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
(async () => {
  delete process.env.ELECTRON_RUN_AS_NODE;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notes-ui-"));
  const output = path.resolve(process.env.NOTES_OUTPUT || "test-results");
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  let app;
  try {
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, NOTES_TEST_ROOT: root },
    });
    const page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("#preview h1");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1550, 868),
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, "Notes-Light.png") });
    assert.equal(
      await page.locator("#preview h1").textContent(),
      "Welcome to Notes",
    );
    assert.equal(await page.locator(".tab").count(), 3);
    assert.equal(await page.locator("#preview table tbody tr").count(), 4);
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth > innerWidth,
      toolbar:
        document.querySelector(".toolbar").scrollWidth >
        document.querySelector(".toolbar").clientWidth,
    }));
    assert.deepEqual(overflow, { body: false, toolbar: false });
    await page.locator("[data-action=theme]").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.screenshot({ path: path.join(output, "Notes-Dark.png") });
    await page.locator("[data-action=theme]").click();
    await page.locator("[data-action=settings]").click();
    await page.getByLabel("Window opacity", { exact: true }).fill("85");
    await page
      .getByLabel("Window opacity", { exact: true })
      .dispatchEvent("change");
    await page.waitForFunction(
      () => document.querySelector("output")?.textContent === "85%",
    );
    const opacity = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getOpacity(),
    );
    assert.ok(Math.abs(opacity - 0.85) < 0.01);
    await page.getByLabel("Window opacity", { exact: true }).fill("100");
    await page
      .getByLabel("Window opacity", { exact: true })
      .dispatchEvent("change");
    await page.locator("[data-settings-tab=Editor]").click();
    await page
      .getByLabel("Editor font", { exact: true })
      .selectOption("Malgun Gothic");
    await page.waitForFunction(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--editor-font")
        .includes("Malgun"),
    );
    await page.screenshot({ path: path.join(output, "Notes-Settings.png") });
    await page
      .getByLabel("Editor font", { exact: true })
      .selectOption("Consolas");
    await page.getByLabel("Close dialog", { exact: true }).click();
    await page.locator("[data-action=new]").first().click();
    const editor = page.locator(".cm-content");
    await editor.click();
    await page.keyboard.insertText(
      "# 한글 테스트\n\nMarkdown **works**.\n\n- [ ] Complete\n",
    );
    await page.waitForFunction(
      () =>
        document.querySelector("#preview h1")?.textContent === "한글 테스트",
    );
    assert.equal(await page.locator("#preview strong").textContent(), "works");
    await page.locator("#preview input[type=checkbox]").check();
    await page.waitForFunction(() =>
      document.querySelector(".cm-content").textContent.includes("[x]"),
    );
    const file = path.join(root, "한글 저장.md");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    await page.keyboard.press("Control+s");
    await page.waitForFunction(async () => {
      const s = await window.notes.load();
      return s.docs.some((d) => d.path?.endsWith("한글 저장.md"));
    });
    assert.match(fs.readFileSync(file, "utf8"), /한글 테스트/);
    await app.evaluate(
      ({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [folder],
        });
      },
      path.join(root, "cloud"),
    );
    for (const provider of ["onedrive", "dropbox", "google"]) {
      await page.evaluate(async (provider) => {
        await window.notes.chooseSyncFolder(provider);
        await window.notes.sync();
      }, provider);
      assert.ok(
        fs.existsSync(
          path.join(root, "cloud", "Notes Workspace", "workspace.json"),
        ),
      );
    }
    const pdf = path.join(root, "export.pdf");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, pdf);
    await page.locator("[data-inspector=Export]").click();
    await page.locator("[data-export=pdf]").click();
    await page.waitForFunction(
      () =>
        document.querySelector(".toast")?.textContent.includes("export.pdf"),
      {},
      { timeout: 20000 },
    );
    assert.equal(fs.readFileSync(pdf).subarray(0, 4).toString(), "%PDF");
    await page.locator("[data-action=search]").click();
    await page.getByLabel("Search all notes").fill("한글");
    assert.equal(await page.locator("[data-search-doc]").count(), 1);
    await page.getByLabel("Close dialog", { exact: true }).click();
    const last = await page.evaluate(() => window.notes.load());
    assert.ok(last.docs.some((d) => d.content.includes("한글 테스트")));
    assert.equal(errors.length, 0, errors.join("\n"));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    app = null;
    app = await electron.launch({
      args: ["."],
      env: { ...process.env, NOTES_TEST_ROOT: root },
    });
    const reopened = await app.firstWindow();
    await reopened.waitForSelector("#preview h1");
    assert.equal(
      await reopened.locator("#preview h1").textContent(),
      "한글 테스트",
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    app = null;
    const associated = path.join(root, "파일 연결 확인.md");
    fs.writeFileSync(
      associated,
      "# File association works\n\n한글 경로도 정상입니다.",
    );
    app = await electron.launch({
      args: [".", associated],
      env: { ...process.env, NOTES_TEST_ROOT: root },
    });
    const opened = await app.firstWindow();
    await opened.waitForFunction(
      () =>
        document.querySelector("#preview h1")?.textContent ===
        "File association works",
    );
    for (const width of [1280, 980]) {
      await app.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()[0].setSize(width, 760),
        width,
      );
      await opened.waitForFunction((w) => innerWidth === w, width);
      assert.equal(
        await opened.evaluate(
          () =>
            document.querySelector(".toolbar").scrollWidth >
            document.querySelector(".toolbar").clientWidth,
        ),
        false,
        "Toolbar at " + width,
      );
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    app = null;
    console.log(
      "PASS: reference layout, theme, native opacity, font, Korean editing, checklists, save, 3 cloud providers, PDF, search, restart.",
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
