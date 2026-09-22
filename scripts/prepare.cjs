const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process");
(async () => {
  const sharp = require("sharp");
  const { default: toIco } = await import("png-to-ico");
  const png = await sharp("assets/icon.svg").resize(256, 256).png().toBuffer();
  fs.writeFileSync("assets/icon.ico", await toIco(png));
  const folder = path.resolve("assets/vendor");
  fs.mkdirSync(folder, { recursive: true });
  if (!fs.existsSync(path.join(folder, "gh.exe"))) {
    const url =
      "https://github.com/cli/cli/releases/download/v2.101.0/gh_2.101.0_windows_amd64.zip";
    const data = Buffer.from(await (await fetch(url)).arrayBuffer());
    const digest = crypto.createHash("sha256").update(data).digest("hex");
    if (
      digest !==
      "bc6c814367b193cd8e713611d61e36013c0ef843b8f516458fe3eda039192794"
    )
      throw Error("GitHub CLI checksum mismatch");
    const zip = path.join(folder, "gh.zip");
    fs.writeFileSync(zip, data);
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zip.replaceAll("'", "''")}','${folder.replaceAll("'", "''")}')`,
      ],
      { windowsHide: true },
    );
    fs.copyFileSync(
      path.join(folder, "bin", "gh.exe"),
      path.join(folder, "gh.exe"),
    );
    fs.unlinkSync(zip);
  }
  const license = await (
    await fetch("https://raw.githubusercontent.com/cli/cli/v2.101.0/LICENSE")
  ).text();
  fs.writeFileSync(path.join(folder, "LICENSE-GitHub-CLI.txt"), license);
  console.log(
    "Prepared SVG-derived Windows icon and verified GitHub CLI 2.101.0.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
