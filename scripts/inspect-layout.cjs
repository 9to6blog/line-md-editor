const { _electron } = require("playwright"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
(async () => {
  delete process.env.ELECTRON_RUN_AS_NODE;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "notes-layout-"));
  const app = await _electron.launch({
    args: ["."],
    env: { ...process.env, NOTES_TEST_ROOT: root },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector("#preview h1");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1550, 868),
    );
    await page.evaluate(() => document.fonts.ready);
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          regions: Object.fromEntries(
            [
              ".toolbar",
              ".sidebar",
              ".editor-pane",
              ".preview-pane",
              "#preview pre",
              "#preview pre code",
              "#preview blockquote",
              "#preview table",
            ].map((s) => {
              const el = document.querySelector(s),
                r = el.getBoundingClientRect(),
                c = getComputedStyle(el);
              return [
                s,
                {
                  x: r.x,
                  y: r.y,
                  width: r.width,
                  height: r.height,
                  font: c.font,
                  lineHeight: c.lineHeight,
                  html: s.includes("pre") ? el.innerHTML : undefined,
                },
              ];
            }),
          ),
          lines: [...document.querySelectorAll(".cm-line")].map((el) => ({
            text: el.textContent,
            height: el.getBoundingClientRect().height,
          })),
        })),
        null,
        2,
      ),
    );
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
