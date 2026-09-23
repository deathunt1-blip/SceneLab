const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  assert.equal(process.platform, "darwin", "Run on a native Mac");
  const root = path.resolve(__dirname, "..");
  const dir = path.resolve(process.argv[2] || path.join(root, "release/build"));
  const version = require(path.join(root, "package.json")).version;
  const stem = `SceneLab-${version}-macOS-${process.arch}`;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "scenelab-mac-check-"));
  const out = path.join(root, "release/mac-verification");
  fs.mkdirSync(out, { recursive: true });
  const run = (file, args) =>
    execFileSync(file, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const verify = (app) => {
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
    const plist = path.join(app, "Contents/Info.plist");
    assert.equal(
      run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", plist]),
      version,
    );
    assert.equal(
      run("/usr/libexec/PlistBuddy", ["-c", "Print :LSMinimumSystemVersion", plist]),
      "13.0.0",
    );
    const arch = run("lipo", ["-archs", path.join(app, "Contents/MacOS/SceneLab")]);
    assert.equal(arch, process.arch === "x64" ? "x86_64" : "arm64");
    for (const file of [
      "app.asar",
      "macOS-使用说明.html",
      "THIRD-PARTY-NOTICES.txt",
      "示例相机参数",
    ]) {
      assert.ok(
        fs.existsSync(path.join(app, "Contents/Resources", file)),
        `Missing ${file}`,
      );
    }
  };
  // A separate runner extracts the published-format ZIP, preserving symlinks.
  run("ditto", ["-x", "-k", path.join(dir, stem + ".zip"), scratch]);
  const app = path.join(scratch, "SceneLab.app");
  verify(app);
  const mount = path.join(scratch, "mounted-dmg");
  run("hdiutil", [
    "attach",
    "-readonly",
    "-nobrowse",
    "-mountpoint",
    mount,
    path.join(dir, stem + ".dmg"),
  ]);
  try {
    verify(path.join(mount, "SceneLab.app"));
    assert.equal(fs.readlinkSync(path.join(mount, "Applications")), "/Applications");
  } finally {
    run("hdiutil", ["detach", mount]);
  }

  const profile = path.join(scratch, "profile");
  fs.mkdirSync(profile);
  const env = {
    ...process.env,
    SCENELAB_USER_DATA_DIR: profile,
    SCENELAB_PORT: "5189",
    SCENELAB_SMOKE_TEST: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  // Intel CI VMs lack a Metal GPU. This opt-in is confined to the test
  // process and its trusted local UI; distributed apps keep normal settings.
  const softwareGL = process.env.SCENELAB_SMOKE_SOFTWARE_GL === "1";
  const args = softwareGL
    ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : [];
  const child = spawn(path.join(app, "Contents/MacOS/SceneLab"), args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data) => {
    logs += data.toString();
  });
  child.stderr.on("data", (data) => {
    logs += data.toString();
  });
  let failure;
  child.on("error", (error) => {
    failure = error;
  });
  try {
    const started = Date.now();
    const resultFile = path.join(profile, "smoke-result.json");
    while (!fs.existsSync(resultFile)) {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode)
        throw new Error(
          `App exited early: ${child.exitCode} ${child.signalCode}\n${logs}`,
        );
      if (Date.now() - started > 90000)
        throw new Error(`Renderer startup timed out\n${logs}`);
      await delay(500);
    }
    const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
    assert.ok(result.canvas && result.buttons > 5, "React scene must render");
    const response = await fetch("http://127.0.0.1:5189/");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /SceneLab/);
    fs.writeFileSync(
      path.join(out, `${process.arch}.json`),
      JSON.stringify(
        {
          version,
          arch: process.arch,
          macOS: os.release(),
        softwareGL,
        signatureVerified: true,
          dmgVerified: true,
          ...result,
        },
        null,
        2,
      ),
    );
    const screenshot = path.join(profile, "smoke.png");
    if (fs.existsSync(screenshot))
      fs.copyFileSync(screenshot, path.join(out, `${process.arch}.png`));
    console.log(
      `Verified DMG, ZIP, bundle signature, native ${process.arch} launch and rendered scene.`,
      result,
    );
  } finally {
    child.kill("SIGTERM");
    fs.writeFileSync(path.join(out, `${process.arch}.log`), logs);
    // Preserve the isolated profile on the disposable CI machine for debugging.
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
