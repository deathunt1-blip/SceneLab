const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const staging = path.join(root, "build/app");
// Only the isolated staging directory is replaced. Never copy working profiles.
if (path.relative(root, staging) !== path.join("build", "app")) throw new Error("Unsafe staging path");
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
for (const dir of ["dist", "electron"]) fs.cpSync(path.join(root, dir), path.join(staging, dir), { recursive: true });
const pkg = require(path.join(root, "package.json"));
fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify({
  name: "scenelab", version: pkg.version, description: pkg.description,
  main: "electron/main.cjs", author: "SceneLab", private: true,
}, null, 2));
const packages = ["react", "react-dom", "scheduler", "three", "zustand", "lucide-react",
  "@fontsource/dm-sans", "@fontsource/ibm-plex-mono", "jszip", "pako", "lie", "immediate", "setimmediate", "readable-stream", "safe-buffer", "string_decoder", "inherits", "util-deprecate", "isarray", "core-util-is", "process-nextick-args"];
let notices = "SceneLab v1.3 - Third-party notices\n\nElectron and Chromium licenses are provided separately in this folder.\nJSZip is used under its MIT license option.\n\n";
for (const name of packages) {
  const dir = path.join(root, "node_modules", name);
  const info = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const licenses = fs.readdirSync(dir).filter(f => /^(license|ofl|copying)/i.test(f));
  notices += `\n${"=".repeat(72)}\n${name} ${info.version}\n${"=".repeat(72)}\n`;
  if (!licenses.length && name === "isarray") {
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    const start = readme.indexOf("## License");
    if (start < 0) throw new Error("Missing isarray license in README");
    notices += readme.slice(start) + "\n";
    continue;
  }
  if (!licenses.length) throw new Error(`Missing license: ${name}`);
  for (const file of licenses) notices += fs.readFileSync(path.join(dir, file), "utf8") + "\n";
}
fs.mkdirSync(path.join(root, "build/resources"), { recursive: true });
fs.writeFileSync(path.join(root, "build/resources/THIRD-PARTY-NOTICES.txt"), notices);
const requiredAssets = process.platform === "darwin"
  ? ["docs/macOS-使用说明.html", "electron/icon.png"]
  : ["output/pdf/SceneLab_v1.3_使用说明.pdf", "build/resources/icon.ico"];
for (const file of requiredAssets) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Required release asset missing: ${file}`);
}
console.log(`Prepared SceneLab ${pkg.version}; application contains compiled UI and desktop host only.`);
